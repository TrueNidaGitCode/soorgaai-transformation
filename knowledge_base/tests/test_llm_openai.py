"""
Unit tests for OpenAIProvider.

The openai SDK does not need to be installed — the provider is built directly
with a fully mocked _client and _openai module.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

_ROOT = Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.llm.base import LLMResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _MockPromptPackage:
    system_prompt     = "You are SoorgaAI."
    knowledge_context = "=== CORE KNOWLEDGE ===\nSample.\n---"
    query_text        = "How should we structure AI governance?"


def _make_usage(prompt=100, completion=200):
    return SimpleNamespace(prompt_tokens=prompt, completion_tokens=completion)


def _make_final_message(text="Response text.", usage=None):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        usage=usage or _make_usage(),
    )


class _MockStream:
    """Simulates the openai streaming context manager."""

    def __init__(self, chunks: list[str], final_message=None):
        self._chunks = chunks
        self._final  = final_message or _make_final_message()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    @property
    def text_stream(self):
        return iter(self._chunks)

    def get_final_message(self):
        return self._final


def _make_mock_openai_module():
    """
    Return a MagicMock that looks like the openai module with real
    exception classes so isinstance() checks work correctly.
    """
    mod = MagicMock()

    # Define real exception subclasses so isinstance() works in _classify()
    class AuthenticationError(Exception): pass
    class NotFoundError(Exception):       pass
    class RateLimitError(Exception):      pass
    class BadRequestError(Exception):     pass
    class APITimeoutError(Exception):     pass
    class APIConnectionError(Exception):  pass

    mod.AuthenticationError = AuthenticationError
    mod.NotFoundError       = NotFoundError
    mod.RateLimitError      = RateLimitError
    mod.BadRequestError     = BadRequestError
    mod.APITimeoutError     = APITimeoutError
    mod.APIConnectionError  = APIConnectionError
    return mod


def _build_provider(mock_client=None, mock_openai=None, **kwargs):
    """Create an OpenAIProvider without importing the openai SDK."""
    from knowledge_base.llm.providers.openai import OpenAIProvider

    if mock_client is None:
        mock_client = MagicMock()
    if mock_openai is None:
        mock_openai = _make_mock_openai_module()

    provider = object.__new__(OpenAIProvider)
    provider._openai        = mock_openai
    provider._client        = mock_client
    provider._model         = kwargs.get("model", "gpt-4o")
    provider._max_tokens    = kwargs.get("max_tokens", 2048)
    provider._temperature   = kwargs.get("temperature", 0.0)
    provider._stream_stdout = kwargs.get("stream_to_stdout", False)
    return provider


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestOpenAIProviderSuccess(unittest.TestCase):

    def _make_success_provider(self, chunks=None, usage=None):
        chunks = chunks or ["AI governance", " content."]
        mock_client = MagicMock()
        mock_client.chat.completions.stream.return_value = _MockStream(
            chunks, _make_final_message(usage=usage or _make_usage())
        )
        return _build_provider(mock_client)

    def test_generate_returns_llm_response(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertIsInstance(result, LLMResponse)

    def test_generate_success_true(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertTrue(result.success)

    def test_generate_response_text_assembled(self):
        provider = self._make_success_provider(["Part1", " Part2", " Part3"])
        result   = provider.generate(_MockPromptPackage())
        self.assertEqual(result.response_text, "Part1 Part2 Part3")

    def test_generate_provider_field(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertEqual(result.provider, "openai")

    def test_generate_token_usage_populated(self):
        provider = self._make_success_provider(usage=_make_usage(50, 150))
        result   = provider.generate(_MockPromptPackage())
        self.assertIsNotNone(result.token_usage)
        self.assertEqual(result.token_usage.input_tokens,  50)
        self.assertEqual(result.token_usage.output_tokens, 150)

    def test_generate_latency_positive(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertGreater(result.latency, 0)

    def test_generate_no_error_on_success(self):
        provider = self._make_success_provider()
        result   = provider.generate(_MockPromptPackage())
        self.assertIsNone(result.error_message)


class TestOpenAIProviderErrors(unittest.TestCase):

    def _provider_with_error(self, exc, mock_openai):
        """Build a provider using the SAME mock_openai that the exception was created from."""
        mock_client = MagicMock()
        mock_cm     = MagicMock()
        mock_cm.__enter__.side_effect = exc
        mock_client.chat.completions.stream.return_value = mock_cm
        return _build_provider(mock_client, mock_openai)

    def test_invalid_api_key_returns_failure(self):
        mo  = _make_mock_openai_module()
        exc = mo.AuthenticationError("invalid api key")
        result = self._provider_with_error(exc, mo).generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("API key", result.error_message)

    def test_quota_exceeded_returns_failure(self):
        mo  = _make_mock_openai_module()
        exc = mo.RateLimitError("You exceeded your current quota, please check your plan and billing details")
        result = self._provider_with_error(exc, mo).generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("quota", result.error_message.lower())

    def test_rate_limit_returns_failure(self):
        mo  = _make_mock_openai_module()
        exc = mo.RateLimitError("rate limit exceeded")
        result = self._provider_with_error(exc, mo).generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("rate limit", result.error_message.lower())

    def test_model_not_found_returns_failure(self):
        mo  = _make_mock_openai_module()
        exc = mo.NotFoundError("model not found")
        result = self._provider_with_error(exc, mo).generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("not found", result.error_message.lower())

    def test_timeout_returns_failure(self):
        mo  = _make_mock_openai_module()
        exc = mo.APITimeoutError("timeout")
        result = self._provider_with_error(exc, mo).generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("timed out", result.error_message.lower())

    def test_connection_error_returns_failure(self):
        mo  = _make_mock_openai_module()
        exc = mo.APIConnectionError("connection failed")
        result = self._provider_with_error(exc, mo).generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("connect", result.error_message.lower())

    def test_error_has_empty_text(self):
        mo  = _make_mock_openai_module()
        exc = mo.APITimeoutError("timeout")
        result = self._provider_with_error(exc, mo).generate(_MockPromptPackage())
        self.assertEqual(result.response_text, "")


class TestOpenAIProviderProperties(unittest.TestCase):

    def test_provider_name(self):
        p = _build_provider(model="gpt-4o")
        self.assertEqual(p.provider_name, "openai")

    def test_model_name(self):
        p = _build_provider(model="gpt-4o-mini")
        self.assertEqual(p.model_name, "gpt-4o-mini")


if __name__ == "__main__":
    unittest.main()
