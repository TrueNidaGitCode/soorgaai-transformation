"""
SoorgaAI Conversation Engine — Intent detection result.

Plain dataclass with no dependencies beyond the Intent enum, so it can be
carried through ContextPackage / PromptPackage and serialised freely.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from knowledge_base.conversation.intent import Intent


@dataclass
class IntentResult:
    """
    Outcome of deterministic intent detection for a single query.

    Fields
    ──────
    intent             Detected Intent (GENERAL when nothing matched).
    confidence         0.95 multiple keyword matches | 0.80 single | 0.50 fallback.
    matched_keywords   Keywords found in the normalized query, in match order.
    """
    intent:           Intent
    confidence:       float
    matched_keywords: list[str] = field(default_factory=list)
