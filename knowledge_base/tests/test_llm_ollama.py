"""
Unit tests for OllamaProvider.

httpx is mocked — no running Ollama server is required.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, call

_ROOT = Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.llm.factory import ProviderConfig, ProviderFactory
from knowledge_base.llm.base import LLMResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _MockPromptPackage:
    system_prompt     = "You are SoorgaAI."
    knowledge_context = "=== CORE KNOWLEDGE ===\nSample.\n---"
    query_text        = "What AI use cases suit automotive manufacturing?"


def _json_line(content="", done=False, in_tok=0, out_tok=0) -> str:
    chunk: dict = {"message": {"content": content}, "done": done}
    if done:
        chunk["prompt_eval_count"] = in_tok
        chunk["eval_count"]        = out_tok
    return json.dumps(chunk)


class _MockStreamResponse:
    """Simulates an httpx streaming response context manager."""

    def __init__(self, lines: list[str], status_code: int = 200):
        self._lines       = lines
        self.status_code  = status_code

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            raise httpx.HTTPStatusError(
                message  = f"HTTP {self.status_code}",
                request  = MagicMock(),
                response = MagicMock(status_code=self.status_code),
            )

    def iter_lines(self):
        return iter(self._lines)


def _base_config(**kwargs) -> ProviderConfig:
    defaults = dict(
        provider = "ollama",
        model    = "llama3.2",
        base_url = "http://localhost:11434",
        timeout  = 30.0,
    )
    defaults.update(kwargs)
    return ProviderConfig(**defaults)


def _build_provider(mock_httpx, **kwargs):
    config = _base_config(**kwargs)
    with patch("knowledge_base.llm.providers.ollama.OllamaProvider.__init__",
               _patched_ollama_init(mock_httpx)):
        from knowledge_base.llm.providers.ollama import OllamaProvider
        provider = object.__new__(OllamaProvider)
        provider._httpx         = mock_httpx
        provider._model         = config.model or "llama3.2"
        provider._base_url      = (config.base_url or "http://localhost:11434").rstrip("/")
        provider._timeout       = config.timeout
        provider._temperature   = config.temperature
        provider._stream_stdout = config.stream_to_stdout
    return provider


def _patched_ollama_init(mock_httpx):
    def _init(self, config):
        self._httpx         = mock_httpx
        self._model         = config.model or "llama3.2"
        self._base_url      = (config.base_url or "http://localhost:11434").rstrip("/")
        self._timeout       = config.timeout
        self._temperature   = config.temperature
        self._stream_stdout = config.stream_to_stdout
    return _init


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestOllamaProviderSuccess(unittest.TestCase):

    def _make_success_provider(self, chunks=None, in_tok=60, out_tok=120):
        if chunks is None:
            chunks = ["Hello", " world"]
        lines = [_json_line(c) for c in chunks]
        lines.append(_json_line(done=True, in_tok=in_tok, out_tok=out_tok))

        mock_httpx = MagicMock()
        mock_httpx.stream.return_value = _MockStreamResponse(lines)
        return _build_provider(mock_httpx)

    def test_generate_returns_llm_response(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertIsInstance(result, LLMResponse)

    def test_generate_success_true(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertTrue(result.success)

    def test_generate_response_text_assembled(self):
        provider = self._make_success_provider(["Part1", " Part2"])
        result   = provider.generate(_MockPromptPackage())
        self.assertEqual(result.response_text, "Part1 Part2")

    def test_generate_provider_field(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertEqual(result.provider, "ollama")

    def test_generate_model_field(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertEqual(result.model, "llama3.2")

    def test_generate_token_usage_populated(self):
        provider = self._make_success_provider(in_tok=60, out_tok=120)
        result   = provider.generate(_MockPromptPackage())
        self.assertIsNotNone(result.token_usage)
        self.assertEqual(result.token_usage.input_tokens,  60)
        self.assertEqual(result.token_usage.output_tokens, 120)

    def test_generate_latency_positive(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertGreater(result.latency, 0)

    def test_generate_no_error_on_success(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertIsNone(result.error_message)

    def test_correct_endpoint_called(self):
        mock_httpx = MagicMock()
        lines = [_json_line("ok"), _json_line(done=True)]
        mock_httpx.stream.return_value = _MockStreamResponse(lines)
        provider = _build_provider(mock_httpx)
        provider.generate(_MockPromptPackage())
        call_args = mock_httpx.stream.call_args
        self.assertIn("/api/chat", call_args[0][1])


class TestOllamaProviderErrors(unittest.TestCase):

    def _provider_with_exc(self, exc):
        mock_httpx = MagicMock()
        mock_httpx.stream.side_effect = exc
        return _build_provider(mock_httpx)

    def test_server_unavailable_returns_failure(self):
        import httpx
        exc      = httpx.ConnectError("Connection refused")
        provider = self._provider_with_exc(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("ollama serve", result.error_message)

    def test_timeout_returns_failure(self):
        import httpx
        exc      = httpx.TimeoutException("Read timeout")
        provider = self._provider_with_exc(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("timed out", result.error_message.lower())

    def test_model_not_found_returns_failure(self):
        mock_httpx = MagicMock()
        mock_httpx.stream.return_value = _MockStreamResponse([], status_code=404)
        provider = _build_provider(mock_httpx)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("not found", result.error_message.lower())

    def test_http_error_returns_failure(self):
        import httpx
        exc = httpx.HTTPStatusError(
            message  = "Internal Server Error",
            request  = MagicMock(),
            response = MagicMock(status_code=500),
        )
        provider = self._provider_with_exc(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("HTTP error", result.error_message)

    def test_error_has_empty_text(self):
        import httpx
        exc      = httpx.ConnectError("refused")
        provider = self._provider_with_exc(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertEqual(result.response_text, "")

    def test_error_latency_positive(self):
        import httpx
        exc      = httpx.ConnectError("refused")
        provider = self._provider_with_exc(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertGreaterEqual(result.latency, 0)


class TestOllamaProviderProperties(unittest.TestCase):

    def test_provider_name(self):
        p = _build_provider(MagicMock())
        self.assertEqual(p.provider_name, "ollama")

    def test_model_name(self):
        mock_httpx = MagicMock()
        p = _build_provider(mock_httpx, model="mistral")
        self.assertEqual(p.model_name, "mistral")


if __name__ == "__main__":
    unittest.main()
