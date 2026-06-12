"""
SoorgaAI Conversation Engine — Intent taxonomy.

Domain-independent enumeration of conversational intents. Every SoorgaAI
domain (Automotive, Manufacturing, Healthcare, Finance, Sustainability, …)
shares this single taxonomy so that downstream behaviours can be reused.

Declaration order doubles as deterministic tie-break priority when a query
matches keywords from more than one intent (GENERAL is last — fallback only).
"""

from __future__ import annotations

from enum import Enum


class Intent(Enum):
    """What the user is trying to achieve with a query."""

    CREATE    = "create"      # produce new content (vision, strategy, roadmap)
    REFINE    = "refine"      # improve existing content
    ASSESS    = "assess"      # evaluate / score existing content
    EXPLAIN   = "explain"     # explain reasoning behind a previous answer
    BENCHMARK = "benchmark"   # compare with industry / best practices
    CRITIQUE  = "critique"    # challenge assumptions, find weaknesses
    RISK      = "risk"        # identify risks, pitfalls, concerns
    GENERAL   = "general"     # fallback — standard conversational guidance
