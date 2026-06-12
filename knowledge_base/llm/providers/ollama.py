"""
SoorgaAI — LLM Provider: Ollama (local inference)

Calls the Ollama HTTP API directly via httpx (already a project dependency).
No extra SDK is required — just a running Ollama server.

Start Ollama:  ollama serve
Pull a model:  ollama pull llama3.2

Default base URL: http://localhost:11434
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from knowledge_base.llm.base import LLMProvider, LLMResponse, TokenUsage

_log = logging.getLogger("soorgaai.llm.ollama")

_DEFAULT_MODEL    = "llama3.2"
_DEFAULT_BASE_URL = "http://localhost:11434"
_CHAT_ENDPOINT    = "/api/chat"


class OllamaProvider(LLMProvider):
    """
    Ollama local-inference backend.

    Uses the /api/chat endpoint with stream=True so tokens appear
    progressively when stream_to_stdout=True. All chunks are collected
    before returning so LLMResponse always contains the complete text.
    """

    def __init__(self, config) -> None:
        try:
            import httpx
            self._httpx = httpx
        except ImportError:
            raise ImportError(
                "httpx is not installed.\n  Run: pip install httpx"
            )

        self._model         = config.model or _DEFAULT_MODEL
        self._base_url      = (config.base_url or _DEFAULT_BASE_URL).rstrip("/")
        self._timeout       = config.timeout
        self._temperature   = config.temperature
        self._stream_stdout = config.stream_to_stdout

    # ------------------------------------------------------------------
    # LLMProvider interface
    # ------------------------------------------------------------------

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt_package: Any) -> LLMResponse:
        _log.info(
            "[ollama] request  model=%s  base_url=%s",
            self._model, self._base_url,
        )
        t0 = time.perf_counter()

        user_content = (
            f"{prompt_package.knowledge_context}\n\n"
            f"Query: {prompt_package.query_text}\n\n"
            "Generate a structured strategy response following the "
            "six-section format in the system prompt."
        )
        payload = {
            "model":   self._model,
            "messages": [
                {"role": "system", "content": prompt_package.system_prompt},
                {"role": "user",   "content": user_content},
            ],
            "stream":  True,
            "options": {"temperature": self._temperature},
        }
        url = self._base_url + _CHAT_ENDPOINT

        try:
            collected: list[str] = []
            in_tok = out_tok = 0

            with self._httpx.stream(
                "POST",
                url,
                json    = payload,
                timeout = self._timeout,
            ) as response:
                response.raise_for_status()
                for raw_line in response.iter_lines():
                    if not raw_line:
                        continue
                    try:
                        chunk = json.loads(raw_line)
                    except json.JSONDecodeError:
                        continue

                    text = chunk.get("message", {}).get("content", "")
                    if text:
                        if self._stream_stdout:
                            print(text, end="", flush=True)
                        collected.append(text)

                    if chunk.get("done"):
                        in_tok  = chunk.get("prompt_eval_count", 0) or 0
                        out_tok = chunk.get("eval_count",        0) or 0

            if self._stream_stdout:
                print()

            latency = time.perf_counter() - t0
            _log.info(
                "[ollama] success  model=%s  in=%d  out=%d  latency=%.2fs",
                self._model, in_tok, out_tok, latency,
            )

            return LLMResponse(
                provider      = "ollama",
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
            msg     = _classify(exc, self._base_url, self._model)
            _log.error(
                "[ollama] failure  model=%s  latency=%.2fs  error=%s",
                self._model, latency, msg,
            )
            return LLMResponse(
                provider      = "ollama",
                model         = self._model,
                success       = False,
                response_text = "",
                latency       = latency,
                error_message = msg,
            )


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------

def _classify(exc: Exception, base_url: str, model: str) -> str:
    name = type(exc).__name__
    msg  = str(exc).lower()

    if "ConnectError" in name or "ConnectionRefused" in name or "connect" in msg:
        return (
            f"Could not connect to Ollama at {base_url} — "
            "is 'ollama serve' running?"
        )

    if "TimeoutException" in name or "timeout" in msg:
        return "Request timed out — increase timeout or use a faster model."

    if "404" in msg or "not found" in msg:
        return f"Model '{model}' not found — run: ollama pull {model}"

    if "HTTPStatusError" in name:
        return f"Ollama HTTP error: {exc}"

    return f"[{name}] {exc}"
