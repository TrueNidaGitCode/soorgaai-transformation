"""
Unit tests for GeminiProvider.

google-generativeai is mocked — no GOOGLE_API_KEY is required.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

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
    query_text        = "How should automotive OEMs approach AI governance?"


def _make_usage(prompt=80, candidates=180):
    return SimpleNamespace(
        prompt_token_count     = prompt,
        candidates_token_count = candidates,
    )


def _make_response(text="Generated response.", usage=None):
    return SimpleNamespace(
        text           = text,
        usage_metadata = usage or _make_usage(),
    )


def _base_config(**kwargs) -> ProviderConfig:
    defaults = dict(
        provider   = "gemini",
        model      = "gemini-1.5-pro",
        max_tokens = 2048,
        timeout    = 30.0,
    )
    defaults.update(kwargs)
    return ProviderConfig(**defaults)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGeminiProviderSuccess(unittest.TestCase):

    def _make_provider(self, mock_response=None):
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response or _make_response()
        mock_genai.GenerativeModel.return_value  = mock_model
        mock_genai.GenerationConfig              = MagicMock(return_value={})
        return _build_gemini_provider(mock_genai, _base_config()), mock_model

    def test_generate_returns_llm_response(self):
        provider, _ = self._make_provider()
        result = provider.generate(_MockPromptPackage())
        self.assertIsInstance(result, LLMResponse)

    def test_generate_success_true(self):
        provider, _ = self._make_provider()
        result = provider.generate(_MockPromptPackage())
        self.assertTrue(result.success)

    def test_generate_response_text(self):
        provider, _ = self._make_provider(_make_response("Governance framework."))
        result = provider.generate(_MockPromptPackage())
        self.assertEqual(result.response_text, "Governance framework.")

    def test_generate_provider_field(self):
        provider, _ = self._make_provider()
        result = provider.generate(_MockPromptPackage())
        self.assertEqual(result.provider, "gemini")

    def test_generate_token_usage(self):
        provider, _ = self._make_provider(_make_response(usage=_make_usage(80, 180)))
        result = provider.generate(_MockPromptPackage())
        self.assertIsNotNone(result.token_usage)
        self.assertEqual(result.token_usage.input_tokens,  80)
        self.assertEqual(result.token_usage.output_tokens, 180)

    def test_generate_latency_positive(self):
        provider, _ = self._make_provider()
        result = provider.generate(_MockPromptPackage())
        self.assertGreater(result.latency, 0)


class TestGeminiProviderErrors(unittest.TestCase):

    def _make_provider_with_error(self, exc):
        mock_genai = MagicMock()
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = exc
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.GenerationConfig             = MagicMock(return_value={})
        return _build_gemini_provider(mock_genai, _base_config())

    def test_permission_denied_returns_failure(self):
        exc      = _make_google_exc("PermissionDenied", "API key invalid")
        provider = self._make_provider_with_error(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("API key", result.error_message)

    def test_quota_exceeded_returns_failure(self):
        exc      = _make_google_exc("ResourceExhausted", "quota exceeded")
        provider = self._make_provider_with_error(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("quota", result.error_message.lower())

    def test_model_not_found_returns_failure(self):
        exc      = _make_google_exc("NotFound", "model not found 404")
        provider = self._make_provider_with_error(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("not found", result.error_message.lower())

    def test_timeout_returns_failure(self):
        exc      = _make_google_exc("DeadlineExceeded", "timeout exceeded")
        provider = self._make_provider_with_error(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("timed out", result.error_message.lower())

    def test_service_unavailable_returns_failure(self):
        exc      = _make_google_exc("ServiceUnavailable", "service unavailable 503")
        provider = self._make_provider_with_error(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertFalse(result.success)
        self.assertIn("unavailable", result.error_message.lower())

    def test_error_has_empty_text(self):
        exc      = _make_google_exc("PermissionDenied", "invalid")
        provider = self._make_provider_with_error(exc)
        result   = provider.generate(_MockPromptPackage())
        self.assertEqual(result.response_text, "")


class TestGeminiProviderProperties(unittest.TestCase):

    def test_provider_name(self):
        p = _build_gemini_provider(MagicMock(), _base_config(model="gemini-1.5-pro"))
        self.assertEqual(p.provider_name, "gemini")

    def test_model_name(self):
        p = _build_gemini_provider(MagicMock(), _base_config(model="gemini-1.5-pro"))
        self.assertEqual(p.model_name, "gemini-1.5-pro")


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _make_google_exc(class_name: str, message: str) -> Exception:
    """Create a fake google-api-core style exception by naming convention."""
    exc_class = type(class_name, (Exception,), {})
    return exc_class(message)


def _patched_gemini_init(mock_genai):
    """Return a __init__ that skips the real import."""
    def _init(self, config):
        self._genai         = mock_genai
        self._model_name    = config.model or "gemini-1.5-pro"
        self._max_tokens    = config.max_tokens
        self._temperature   = config.temperature
        self._timeout       = config.timeout
        self._stream_stdout = config.stream_to_stdout
    return _init


def _build_gemini_provider(mock_genai, config):
    """Directly build a GeminiProvider bypassing the import."""
    from knowledge_base.llm.providers.gemini import GeminiProvider

    provider = object.__new__(GeminiProvider)
    provider._genai         = mock_genai
    provider._model_name    = config.model or "gemini-1.5-pro"
    provider._max_tokens    = config.max_tokens
    provider._temperature   = config.temperature
    provider._timeout       = config.timeout
    provider._stream_stdout = config.stream_to_stdout
    return provider


if __name__ == "__main__":
    unittest.main()
