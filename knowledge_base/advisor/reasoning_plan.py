"""
SoorgaAI AI Advisor — Reasoning Plan data model.

A ReasoningPlan describes HOW SoorgaAI should think about a query before
any retrieval-grounded generation happens. It is produced deterministically
from the detected Intent — no LLM is involved — and carried through
ContextPackage / PromptPackage for future consumers (Sprint 20C Prompt
Builder).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from knowledge_base.conversation.intent import Intent


@dataclass
class ReasoningPlan:
    """
    Structured reasoning strategy for a single query.

    Fields
    ──────
    intent        The detected Intent this plan was built for.
    goal          One-line statement of what the response must achieve.
    tasks         Ordered reasoning steps the advisor should perform.
    constraints   Boundaries the advisor must respect while responding.
    """
    intent:      Intent
    goal:        str
    tasks:       list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
