"""
Unit tests for ClaudeProvider.

All Anthropic API calls are mocked — no ANTHROPIC_API_KEY is required.
"""

from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

_ROOT = Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.llm.factory import ProviderConfig, ProviderFactory
from knowledge_base.llm.base import LLMResponse


# ---------------------------------------------------------------------------
# Shared test fixture helpers
# ---------------------------------------------------------------------------

class _MockPromptPackage:
    system_prompt     = "You are SoorgaAI."
    knowledge_context = "=== CORE KNOWLEDGE ===\nSample content.\n---"
    query_text        = "What is AI governance?"


def _make_usage(in_tok=100, out_tok=200, cache_create=50, cache_read=0):
    u = SimpleNamespace(
        input_tokens                  = in_tok,
        output_tokens                 = out_tok,
        cache_creation_input_tokens   = cache_create,
        cache_read_input_tokens       = cache_read,
    )
    return u


def _make_final_message(model="claude-opus-4-8", usage=None):
    return SimpleNamespace(
        model = model,
        usage = usage or _make_usage(),
    )


class _MockStream:
    """Simulates the anthropic streaming context manager."""

    def __init__(self, chunks: list[str], final_message):
        self._chunks = chunks
        self._final  = final_message

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    @property
    def text_stream(self):
        return iter(self._chunks)

    def get_final_message(self):
        return self._final


def _base_config(**kwargs) -> ProviderConfig:
    defaults = dict(
        provider               = "claude",
        model                  = "claude-opus-4-8",
        enable_thinking        = False,   # keeps max_tokens/budget simple in tests
        max_tokens             = 4096,
        thinking_budget_tokens = 1000,
        timeout                = 30.0,
    )
    defaults.update(kwargs)
    return ProviderConfig(**defaults)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestClaudeProviderSuccess(unittest.TestCase):

    def _make_provider(self, mock_client):
        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            return ProviderFactory.create(config)

    def test_generate_returns_llm_response(self):
        mock_client = MagicMock()
        mock_client.messages.stream.return_value = _MockStream(
            ["## Executive Summary\n", "AI governance..."],
            _make_final_message(),
        )
        provider = self._make_provider(mock_client)
        result   = provider.generate(_MockPromptPackage())

        self.assertIsInstance(result, LLMResponse)

    def test_generate_success_true(self):
        mock_client = MagicMock()
        mock_client.messages.stream.return_value = _MockStream(
            ["## Executive Summary\n", "Content here."],
            _make_final_message(),
        )
        provider = self._make_provider(mock_client)
        result   = provider.generate(_MockPromptPackage())

        self.assertTrue(result.success)

    def test_generate_response_text_assembled(self):
        mock_client = MagicMock()
        chunks = ["Hello", " ", "world"]
        mock_client.messages.stream.return_value = _MockStream(
            chunks, _make_final_message()
        )
        provider = self._make_provider(mock_client)
        result   = provider.generate(_MockPromptPackage())

        self.assertEqual(result.response_text, "Hello world")

    def test_generate_provider_field(self):
        mock_client = MagicMock()
        mock_client.messages.stream.return_value = _MockStream(
            ["ok"], _make_final_message()
        )
        provider = self._make_provider(mock_client)
        result   = provider.generate(_MockPromptPackage())

        self.assertEqual(result.provider, "claude")

    def test_generate_token_usage_populated(self):
        mock_client = MagicMock()
        mock_client.messages.stream.return_value = _MockStream(
            ["ok"], _make_final_message(usage=_make_usage(100, 200, 50, 10))
        )
        provider = self._make_provider(mock_client)
        result   = provider.generate(_MockPromptPackage())

        self.assertIsNotNone(result.token_usage)
        self.assertEqual(result.token_usage.input_tokens,         100)
        self.assertEqual(result.token_usage.output_tokens,        200)
        self.assertEqual(result.token_usage.cache_tokens_created,  50)
        self.assertEqual(result.token_usage.cache_tokens_read,     10)

    def test_generate_latency_positive(self):
        mock_client = MagicMock()
        mock_client.messages.stream.return_value = _MockStream(
            ["ok"], _make_final_message()
        )
        provider = self._make_provider(mock_client)
        result   = provider.generate(_MockPromptPackage())

        self.assertGreater(result.latency, 0)

    def test_generate_error_message_none_on_success(self):
        mock_client = MagicMock()
        mock_client.messages.stream.return_value = _MockStream(
            ["ok"], _make_final_message()
        )
        provider = self._make_provider(mock_client)
        result   = provider.generate(_MockPromptPackage())

        self.assertIsNone(result.error_message)


class TestClaudeProviderErrors(unittest.TestCase):

    def _make_provider_with_error(self, error_class_name: str, error_msg: str):
        """Return a provider whose stream raises the named anthropic exception."""
        import anthropic

        exc_class = getattr(anthropic, error_class_name, None)
        if exc_class is None:
            self.skipTest(f"anthropic.{error_class_name} not found in installed SDK")

        mock_client = MagicMock()
        mock_cm = MagicMock()

        # Build a minimal response mock required by some Anthropic error types
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.headers = {}
        try:
            exc = exc_class(
                message  = error_msg,
                response = mock_response,
                body     = {"error": {"message": error_msg}},
            )
        except TypeError:
            exc = exc_class(error_msg)

        mock_cm.__enter__.side_effect = exc
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            return ProviderFactory.create(config)

    def test_insufficient_credits_returns_failure(self):
        mock_client = MagicMock()
        mock_cm     = MagicMock()

        import anthropic
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.headers = {}
        exc = anthropic.BadRequestError(
            message  = "Your credit balance is too low to access the Anthropic API.",
            response = mock_response,
            body     = {"error": {"message": "credit balance is too low"}},
        )
        mock_cm.__enter__.side_effect = exc
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            provider = ProviderFactory.create(config)

        result = provider.generate(_MockPromptPackage())

        self.assertFalse(result.success)
        self.assertIn("credit", result.error_message.lower())

    def test_invalid_api_key_returns_failure(self):
        mock_client = MagicMock()
        mock_cm     = MagicMock()

        import anthropic
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.headers = {}
        exc = anthropic.AuthenticationError(
            message  = "invalid_api_key",
            response = mock_response,
            body     = {"error": {"message": "invalid_api_key"}},
        )
        mock_cm.__enter__.side_effect = exc
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            provider = ProviderFactory.create(config)

        result = provider.generate(_MockPromptPackage())

        self.assertFalse(result.success)
        self.assertIn("API key", result.error_message)

    def test_timeout_returns_failure(self):
        import anthropic

        mock_client = MagicMock()
        mock_cm     = MagicMock()
        mock_cm.__enter__.side_effect = anthropic.APITimeoutError(request=MagicMock())
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            provider = ProviderFactory.create(config)

        result = provider.generate(_MockPromptPackage())

        self.assertFalse(result.success)
        self.assertIn("timed out", result.error_message.lower())

    def test_model_not_found_returns_failure(self):
        import anthropic

        mock_client   = MagicMock()
        mock_cm       = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.headers = {}
        exc = anthropic.NotFoundError(
            message  = "model_not_found",
            response = mock_response,
            body     = {"error": {"message": "model_not_found"}},
        )
        mock_cm.__enter__.side_effect = exc
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            provider = ProviderFactory.create(config)

        result = provider.generate(_MockPromptPackage())

        self.assertFalse(result.success)
        self.assertIn("not found", result.error_message.lower())

    def test_connection_error_returns_failure(self):
        import anthropic

        mock_client = MagicMock()
        mock_cm     = MagicMock()
        mock_cm.__enter__.side_effect = anthropic.APIConnectionError(request=MagicMock())
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            provider = ProviderFactory.create(config)

        result = provider.generate(_MockPromptPackage())

        self.assertFalse(result.success)
        self.assertIn("connect", result.error_message.lower())

    def test_error_response_has_empty_text(self):
        import anthropic

        mock_client = MagicMock()
        mock_cm     = MagicMock()
        mock_cm.__enter__.side_effect = anthropic.APITimeoutError(request=MagicMock())
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            provider = ProviderFactory.create(config)

        result = provider.generate(_MockPromptPackage())

        self.assertEqual(result.response_text, "")

    def test_error_response_latency_positive(self):
        import anthropic

        mock_client = MagicMock()
        mock_cm     = MagicMock()
        mock_cm.__enter__.side_effect = anthropic.APITimeoutError(request=MagicMock())
        mock_client.messages.stream.return_value = mock_cm

        config = _base_config()
        with patch("anthropic.Anthropic", return_value=mock_client):
            provider = ProviderFactory.create(config)

        result = provider.generate(_MockPromptPackage())

        self.assertGreaterEqual(result.latency, 0)


class TestClaudeProviderProperties(unittest.TestCase):

    def _make_provider(self):
        mock_client = MagicMock()
        config = _base_config(model="claude-opus-4-8")
        with patch("anthropic.Anthropic", return_value=mock_client):
            return ProviderFactory.create(config)

    def test_provider_name(self):
        p = self._make_provider()
        self.assertEqual(p.provider_name, "claude")

    def test_model_name(self):
        p = self._make_provider()
        self.assertEqual(p.model_name, "claude-opus-4-8")


if __name__ == "__main__":
    unittest.main()
