"""
SoorgaAI — LLM Provider: Google Gemini

Supports all Gemini generative models via the google-generativeai SDK.
Falls back to GOOGLE_API_KEY env var when api_key is not set in ProviderConfig.

Install: pip install google-generativeai
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from knowledge_base.llm.base import LLMProvider, LLMResponse, TokenUsage

_log = logging.getLogger("soorgaai.llm.gemini")

_DEFAULT_MODEL  = "gemini-1.5-pro"
_DEFAULT_TOKENS = 4096


class GeminiProvider(LLMProvider):
    """
    Google Gemini backend via google-generativeai.

    System instructions are passed via the model's system_instruction parameter.
    When stream_to_stdout=True the full response is printed after generation
    (Gemini non-streaming returns the complete text in one call).
    """

    def __init__(self, config) -> None:
        try:
            import google.generativeai as genai
            self._genai = genai
        except ImportError:
            raise ImportError(
                "Google GenerativeAI SDK is not installed.\n"
                "  Run: pip install google-generativeai"
            )

        api_key = config.api_key or os.environ.get("GOOGLE_API_KEY", "")
        if api_key:
            genai.configure(api_key=api_key)

        self._model_name    = config.model or _DEFAULT_MODEL
        self._max_tokens    = config.max_tokens or _DEFAULT_TOKENS
        self._temperature   = config.temperature
        self._timeout       = config.timeout
        self._stream_stdout = config.stream_to_stdout

    # ------------------------------------------------------------------
    # LLMProvider interface
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model_name

    def generate(self, prompt_package: Any) -> LLMResponse:
        _log.info(
            "[gemini] request  model=%s  max_tokens=%d  temp=%.1f",
            self._model_name, self._max_tokens, self._temperature,
        )
        t0 = time.perf_counter()

        user_content = (
            f"{prompt_package.knowledge_context}\n\n"
            f"Query: {prompt_package.query_text}\n\n"
            "Generate a structured strategy response following the "
            "six-section format in the system prompt."
        )

        try:
            model = self._genai.GenerativeModel(
                model_name         = self._model_name,
                system_instruction = prompt_package.system_prompt,
            )
            generation_cfg = self._genai.GenerationConfig(
                max_output_tokens = self._max_tokens,
                temperature       = self._temperature,
            )
            response = model.generate_content(
                contents          = user_content,
                generation_config = generation_cfg,
                request_options   = {"timeout": self._timeout},
            )

            latency = time.perf_counter() - t0
            text    = response.text

            if self._stream_stdout:
                print(text)

            meta    = getattr(response, "usage_metadata", None)
            in_tok  = getattr(meta, "prompt_token_count",     0) or 0
            out_tok = getattr(meta, "candidates_token_count", 0) or 0

            _log.info(
                "[gemini] success  model=%s  in=%d  out=%d  latency=%.2fs",
                self._model_name, in_tok, out_tok, latency,
            )

            return LLMResponse(
                provider      = "gemini",
                model         = self._model_name,
                success       = True,
                response_text = text,
                latency       = latency,
                token_usage   = TokenUsage(
                    input_tokens  = in_tok,
                    output_tokens = out_tok,
                ),
            )

        except Exception as exc:
            latency = time.perf_counter() - t0
            msg     = _classify(exc)
            _log.error(
                "[gemini] failure  model=%s  latency=%.2fs  error=%s",
                self._model_name, latency, msg,
            )
            return LLMResponse(
                provider      = "gemini",
                model         = self._model_name,
                success       = False,
                response_text = "",
                latency       = latency,
                error_message = msg,
            )


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

def _classify(exc: Exception) -> str:
    name = type(exc).__name__
    msg  = str(exc).lower()

    if "PermissionDenied" in name or "403" in msg or "api key" in msg:
        return "Invalid or revoked Google API key."

    if "ResourceExhausted" in name or "429" in msg or "quota" in msg:
        return "Gemini quota or rate limit exceeded — check console.cloud.google.com."

    if "NotFound" in name or "404" in msg:
        return "Gemini model not found — check the model name."

    if "InvalidArgument" in name or "400" in msg:
        return f"Bad request: {exc}"

    if "DeadlineExceeded" in name or "timeout" in msg:
        return "Request timed out — increase timeout or retry."

    if "ServiceUnavailable" in name or "503" in msg or "unavailable" in msg:
        return "Gemini service unavailable — retry later."

    return f"[{name}] {exc}"
