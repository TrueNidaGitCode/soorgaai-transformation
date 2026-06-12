"""
SoorgaAI — LLM Abstraction Layer: Base Types

Defines the common interface and response types for every LLM provider.
PromptPackage (from strategy_response_engine.py) is consumed via duck typing so
this module has no import dependency on the retrieval or prompt-building layers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class TokenUsage:
    """Token consumption as reported by the provider."""
    input_tokens:         int = 0
    output_tokens:        int = 0
    cache_tokens_created: int = 0   # Anthropic prompt-cache writes
    cache_tokens_read:    int = 0   # Anthropic prompt-cache reads (billed at ~0.1×)


@dataclass
class LLMResponse:
    """
    Standard response returned by every LLMProvider.generate() call.

    On success: success=True, response_text contains the model output.
    On failure: success=False, error_message describes what went wrong,
                response_text is empty.
    latency is wall-clock seconds from the start of the API call.
    """
    provider:      str
    model:         str
    success:       bool
    response_text: str
    latency:       float
    token_usage:   TokenUsage | None = None
    error_message: str | None       = None


class LLMProvider(ABC):
    """
    Abstract interface for all SoorgaAI LLM backends.

    Implement this class to add a new provider — no other layer needs changing.

    The generate() method accepts any object that exposes:
        .system_prompt      str  — model instructions
        .knowledge_context  str  — formatted retrieved knowledge
        .query_text         str  — original user query

    generate() must never raise; all errors are captured in LLMResponse.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Short identifier: 'claude' | 'openai' | 'gemini' | 'ollama'."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Active model ID as configured at instantiation."""

    @abstractmethod
    def generate(self, prompt_package: Any) -> LLMResponse:
        """Send prompt_package to the LLM and return a standard LLMResponse."""
