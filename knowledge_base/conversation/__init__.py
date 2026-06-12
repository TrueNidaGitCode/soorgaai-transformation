"""
SoorgaAI Conversation Engine — reusable platform module.

Deterministic, domain-independent conversation understanding that runs
before retrieval and LLM generation. Sprint 20A: intent detection only.

Public API:
    from knowledge_base.conversation import Intent, IntentResult, detect_intent
"""

from knowledge_base.conversation.intent import Intent
from knowledge_base.conversation.intent_result import IntentResult
from knowledge_base.conversation.intent_detector import (
    CONFIDENCE_FALLBACK,
    CONFIDENCE_MULTI,
    CONFIDENCE_SINGLE,
    detect_intent,
    normalize_query,
    print_analysis,
    register_keywords,
)

__all__ = [
    "CONFIDENCE_FALLBACK",
    "CONFIDENCE_MULTI",
    "CONFIDENCE_SINGLE",
    "Intent",
    "IntentResult",
    "detect_intent",
    "normalize_query",
    "print_analysis",
    "register_keywords",
]
