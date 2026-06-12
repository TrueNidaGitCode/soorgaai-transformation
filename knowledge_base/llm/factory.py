"""
SoorgaAI — LLM Abstraction Layer: Provider Factory

ProviderConfig: single unified configuration dataclass for any provider.
ProviderFactory: instantiates the right LLMProvider from a ProviderConfig.

Adding a new provider requires only:
  1. A module in knowledge_base/llm/providers/<name>.py implementing LLMProvider.
  2. One new branch in ProviderFactory.create().
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from knowledge_base.llm.base import LLMProvider

_log = logging.getLogger("soorgaai.llm.factory")

_VALID = ("claude", "openai", "gemini", "ollama")


@dataclass
class ProviderConfig:
    """
    Unified configuration for any LLM provider.

    Provider-specific fields are silently ignored by providers that
    don't support them (e.g. enable_thinking is only used by Claude).
    """
    provider:               str              # "claude" | "openai" | "gemini" | "ollama"
    model:                  str | None = None # None → each provider's default
    api_key:                str | None = None # None → read from environment variable
    base_url:               str | None = None # Ollama base URL, e.g. "http://localhost:11434"
    max_tokens:             int        = 4096
    timeout:                float      = 60.0
    temperature:            float      = 0.0  # where the provider supports it
    # Claude extended thinking
    enable_thinking:        bool       = True
    thinking_budget_tokens: int        = 8000  # must be < max_tokens
    # Output
    stream_to_stdout:       bool       = False


class ProviderFactory:
    """Creates and returns an LLMProvider from a ProviderConfig."""

    @staticmethod
    def create(config: ProviderConfig) -> LLMProvider:
        """
        Instantiate the provider named by config.provider.

        Raises
        ------
        ValueError   unknown provider name
        ImportError  required SDK not installed
        """
        key = config.provider.strip().lower()
        _log.info(
            "ProviderFactory: provider=%s  model=%s",
            key, config.model or "(default)",
        )

        if key == "claude":
            from knowledge_base.llm.providers.claude import ClaudeProvider
            return ClaudeProvider(config)

        if key == "openai":
            from knowledge_base.llm.providers.openai import OpenAIProvider
            return OpenAIProvider(config)

        if key == "gemini":
            from knowledge_base.llm.providers.gemini import GeminiProvider
            return GeminiProvider(config)

        if key == "ollama":
            from knowledge_base.llm.providers.ollama import OllamaProvider
            return OllamaProvider(config)

        raise ValueError(
            f"Unknown provider {config.provider!r}. "
            f"Valid choices: {', '.join(_VALID)}"
        )
