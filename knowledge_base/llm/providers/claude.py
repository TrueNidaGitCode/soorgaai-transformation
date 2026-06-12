"""
SoorgaAI — LLM Provider: Anthropic Claude

Supports extended thinking and prompt caching.
Falls back to ANTHROPIC_API_KEY env var when api_key is not set in ProviderConfig.

Install: pip install anthropic
"""

from __future__ import annotations

import logging
import time
from typing import Any

from knowledge_base.llm.base import LLMProvider, LLMResponse, TokenUsage

_log = logging.getLogger("soorgaai.llm.claude")

_DEFAULT_MODEL  = "claude-opus-4-8"
_DEFAULT_TOKENS = 16000
_DEFAULT_BUDGET = 8000


class ClaudeProvider(LLMProvider):
    """
    Anthropic Claude backend.

    Uses streaming so tokens appear progressively when stream_to_stdout=True.
    Prompt caching is applied to both the system prompt and the knowledge
    context block to minimise cost on repeated queries.
    """

    def __init__(self, config) -> None:
        try:
            import anthropic
            self._anthropic = anthropic
            self._client = anthropic.Anthropic(
                api_key=config.api_key or None,
                timeout=config.timeout,
            )
        except ImportError:
            raise ImportError(
                "Anthropic SDK is not installed.\n  Run: pip install anthropic"
            )

        self._model          = config.model or _DEFAULT_MODEL
        self._max_tokens     = config.max_tokens or _DEFAULT_TOKENS
        self._stream_stdout  = config.stream_to_stdout
        self._temperature    = config.temperature

        budget = getattr(config, "thinking_budget_tokens", _DEFAULT_BUDGET)
        enable = getattr(config, "enable_thinking", True)
        self._thinking_budget = (
            budget if enable and budget < self._max_tokens else None
        )

    # ------------------------------------------------------------------
    # LLMProvider interface
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "claude"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt_package: Any) -> LLMResponse:
        thinking_label = (
            f"budget={self._thinking_budget}" if self._thinking_budget else "off"
        )
        _log.info(
            "[claude] request  model=%s  thinking=%s  max_tokens=%d",
            self._model, thinking_label, self._max_tokens,
        )
        t0 = time.perf_counter()

        system = [
            {
                "type":          "text",
                "text":          prompt_package.system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type":          "text",
                        "text":          prompt_package.knowledge_context,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": (
                            f"Query: {prompt_package.query_text}\n\n"
                            "Generate a structured strategy response following the "
                            "six-section format in the system prompt."
                        ),
                    },
                ],
            }
        ]

        extra: dict = {}
        if self._thinking_budget:
            extra["thinking"] = {
                "type":          "enabled",
                "budget_tokens": self._thinking_budget,
            }

        try:
            collected: list[str] = []
            with self._client.messages.stream(
                model      = self._model,
                max_tokens = self._max_tokens,
                system     = system,
                messages   = messages,
                **extra,
            ) as stream:
                for text in stream.text_stream:
                    if self._stream_stdout:
                        print(text, end="", flush=True)
                    collected.append(text)

                if self._stream_stdout:
                    print()

                final = stream.get_final_message()

            latency = time.perf_counter() - t0
            usage   = final.usage

            _log.info(
                "[claude] success  model=%s  in=%d  out=%d  latency=%.2fs",
                final.model,
                usage.input_tokens,
                usage.output_tokens,
                latency,
            )

            return LLMResponse(
                provider      = "claude",
                model         = final.model,
                success       = True,
                response_text = "".join(collected),
                latency       = latency,
                token_usage   = TokenUsage(
                    input_tokens         = usage.input_tokens,
                    output_tokens        = usage.output_tokens,
                    cache_tokens_created = getattr(usage, "cache_creation_input_tokens", 0) or 0,
                    cache_tokens_read    = getattr(usage, "cache_read_input_tokens",      0) or 0,
                ),
            )

        except Exception as exc:
            latency = time.perf_counter() - t0
            msg     = _classify(exc, self._anthropic)
            _log.error(
                "[claude] failure  model=%s  latency=%.2fs  error=%s",
                self._model, latency, msg,
            )
            return LLMResponse(
                provider      = "claude",
                model         = self._model,
                success       = False,
                response_text = "",
                latency       = latency,
                error_message = msg,
            )


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

def _classify(exc: Exception, anthropic_module) -> str:
    msg = str(exc).lower()

    if isinstance(exc, anthropic_module.AuthenticationError):
        return "Invalid or revoked Anthropic API key."

    if isinstance(exc, anthropic_module.BadRequestError):
        if "credit balance" in msg or "insufficient" in msg:
            return "Insufficient credits — add credits at console.anthropic.com."
        return f"Bad request: {exc}"

    if isinstance(exc, anthropic_module.NotFoundError):
        return "Model not found — check the --claude-model value."

    if isinstance(exc, anthropic_module.RateLimitError):
        return "Anthropic rate limit exceeded — retry after a short wait."

    if isinstance(exc, anthropic_module.APITimeoutError):
        return "Request timed out — increase --timeout or retry."

    if isinstance(exc, anthropic_module.APIConnectionError):
        return "Could not connect to Anthropic API — check network."

    return f"[{type(exc).__name__}] {exc}"
