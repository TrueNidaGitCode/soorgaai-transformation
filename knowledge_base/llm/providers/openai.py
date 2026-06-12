"""
SoorgaAI — LLM Provider: OpenAI

Supports all OpenAI chat-completion models (GPT-4o, GPT-4, o1, etc.).
Falls back to OPENAI_API_KEY env var when api_key is not set in ProviderConfig.

Install: pip install openai
"""

from __future__ import annotations

import logging
import time
from typing import Any

from knowledge_base.llm.base import LLMProvider, LLMResponse, TokenUsage

_log = logging.getLogger("soorgaai.llm.openai")

_DEFAULT_MODEL  = "gpt-4o"
_DEFAULT_TOKENS = 4096


class OpenAIProvider(LLMProvider):
    """
    OpenAI chat-completion backend.

    Uses the streaming API so tokens are visible progressively when
    stream_to_stdout=True. Token usage is extracted from the final chunk.
    """

    def __init__(self, config) -> None:
        try:
            import openai
            self._openai = openai
            self._client = openai.OpenAI(
                api_key=config.api_key or None,
                timeout=config.timeout,
            )
        except ImportError:
            raise ImportError(
                "OpenAI SDK is not installed.\n  Run: pip install openai"
            )

        self._model         = config.model or _DEFAULT_MODEL
        self._max_tokens    = config.max_tokens or _DEFAULT_TOKENS
        self._temperature   = config.temperature
        self._stream_stdout = config.stream_to_stdout

    # ------------------------------------------------------------------
    # LLMProvider interface
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt_package: Any) -> LLMResponse:
        _log.info(
            "[openai] request  model=%s  max_tokens=%d  temp=%.1f",
            self._model, self._max_tokens, self._temperature,
        )
        t0 = time.perf_counter()

        user_content = (
            f"{prompt_package.knowledge_context}\n\n"
            f"Query: {prompt_package.query_text}\n\n"
            "Generate a structured strategy response following the "
            "six-section format in the system prompt."
        )
        messages = [
            {"role": "system", "content": prompt_package.system_prompt},
            {"role": "user",   "content": user_content},
        ]

        try:
            collected: list[str] = []
            usage_data: dict     = {}

            with self._client.chat.completions.stream(
                model       = self._model,
                messages    = messages,
                max_tokens  = self._max_tokens,
                temperature = self._temperature,
            ) as stream:
                for text in stream.text_stream:
                    if self._stream_stdout:
                        print(text, end="", flush=True)
                    collected.append(text)

                if self._stream_stdout:
                    print()

                final = stream.get_final_message()

            latency = time.perf_counter() - t0
            usage   = final.usage or {}

            in_tok  = getattr(usage, "prompt_tokens",     0) or 0
            out_tok = getattr(usage, "completion_tokens", 0) or 0

            _log.info(
                "[openai] success  model=%s  in=%d  out=%d  latency=%.2fs",
                self._model, in_tok, out_tok, latency,
            )

            return LLMResponse(
                provider      = "openai",
                model         = self._model,
                success       = True,
                response_text = "".join(collected),
                latency       = latency,
                token_usage   = TokenUsage(
                    input_tokens  = in_tok,
                    output_tokens = out_tok,
                ),
            )

        except Exception as exc:
            latency = time.perf_counter() - t0
            msg     = _classify(exc, self._openai)
            _log.error(
                "[openai] failure  model=%s  latency=%.2fs  error=%s",
                self._model, latency, msg,
            )
            return LLMResponse(
                provider      = "openai",
                model         = self._model,
                success       = False,
                response_text = "",
                latency       = latency,
                error_message = msg,
            )


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

def _classify(exc: Exception, openai_module) -> str:
    msg = str(exc).lower()

    if isinstance(exc, openai_module.AuthenticationError):
        return "Invalid or revoked OpenAI API key."

    if isinstance(exc, openai_module.NotFoundError):
        return "Model not found — check the model ID."

    if isinstance(exc, openai_module.RateLimitError):
        if any(w in msg for w in ("quota", "insufficient", "billing", "exceeded your")):
            return "OpenAI quota exceeded — check billing at platform.openai.com."
        return "OpenAI rate limit — retry after a short wait."

    if isinstance(exc, openai_module.BadRequestError):
        return f"Bad request: {exc}"

    if isinstance(exc, openai_module.APITimeoutError):
        return "Request timed out — increase timeout or retry."

    if isinstance(exc, openai_module.APIConnectionError):
        return "Could not connect to OpenAI API — check network."

    return f"[{type(exc).__name__}] {exc}"
