"""
SoorgaAI Conversation Engine — deterministic intent detection.

Detects what the user is trying to achieve BEFORE retrieval and LLM
generation. Pure rule-based keyword matching: no LLM, no embeddings,
no machine learning — fast, deterministic, and trivially debuggable.

Detection pipeline
──────────────────
  1. Normalize  — lowercase, trim, strip punctuation, collapse whitespace.
  2. Match      — whole-word / whole-phrase keyword matching per intent.
  3. Score      — intent with the most matches wins; ties resolved by
                  Intent declaration order (CREATE first, GENERAL last).
  4. Confidence — 0.95 multiple matches | 0.80 single match | 0.50 fallback.

The keyword tables are intentionally domain-independent (verbs and
conversational phrases, not domain nouns) so every future SoorgaAI domain
can reuse this module unchanged. Domain-specific vocabularies can be added
later via register_keywords() without touching detection logic.

Usage:
    from knowledge_base.conversation import detect_intent

    result = detect_intent("Why did you suggest this vision?")
    # IntentResult(intent=Intent.EXPLAIN, confidence=0.95,
    #              matched_keywords=["why", "suggest"])
"""

from __future__ import annotations

import re
import string
import sys
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.conversation.intent import Intent
from knowledge_base.conversation.intent_result import IntentResult

# ---------------------------------------------------------------------------
# Confidence levels (per Sprint 20A specification)
# ---------------------------------------------------------------------------

CONFIDENCE_MULTI    = 0.95   # two or more keyword matches
CONFIDENCE_SINGLE   = 0.80   # exactly one keyword match
CONFIDENCE_FALLBACK = 0.50   # no matches → GENERAL

_DIVIDER = "=" * 50

# ---------------------------------------------------------------------------
# Keyword tables — domain-independent verbs and conversational phrases.
#
# Multi-word entries are matched as whole phrases; single words as whole
# words ("improve" does NOT match "improved"). Keep entries lowercase and
# punctuation-free — queries are normalized before matching.
# ---------------------------------------------------------------------------

_INTENT_KEYWORDS: dict[Intent, tuple[str, ...]] = {
    Intent.CREATE: (
        "create", "define", "draft", "build", "write",
        "develop", "design", "formulate", "compose",
    ),
    Intent.REFINE: (
        "improve", "refine", "rewrite", "strengthen", "enhance",
        "polish", "revise", "reword", "sharpen", "tighten",
        "make this", "make it",
    ),
    Intent.ASSESS: (
        "assess", "rate", "evaluate", "score", "review",
        "grade", "appraise", "how good",
    ),
    Intent.EXPLAIN: (
        "why", "reasoning", "suggest", "suggested", "rationale",
        "justify", "principles", "conclusion", "how did you",
    ),
    Intent.BENCHMARK: (
        "benchmark", "compare", "comparison", "industry",
        "best practice", "best practices", "oem", "oems",
        "competitors", "peers", "leaders",
    ),
    Intent.CRITIQUE: (
        "critique", "challenge", "devils advocate", "assumptions",
        "missing", "weakness", "weaknesses", "gaps", "flaw", "flaws",
        "could be improved", "blind spot", "blind spots",
    ),
    Intent.RISK: (
        "risk", "risks", "go wrong", "pitfall", "pitfalls",
        "danger", "dangers", "threat", "threats",
        "concern", "concerns", "issues", "vulnerabilities",
    ),
    # Intent.GENERAL has no keywords — it is the fallback.
}

# Apostrophes are deleted (devil's → devils); all other punctuation becomes
# a space so "vision?Why" style run-ons still tokenize cleanly.
_APOSTROPHES   = str.maketrans("", "", "'’")
_PUNCT_TO_SPACE = str.maketrans(
    {c: " " for c in string.punctuation + "“”‘’—–…"}
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_intent(query: str, *, debug: bool = False) -> IntentResult:
    """
    Detect the conversational intent of a user query.

    Deterministic and side-effect free: the same query always produces the
    same IntentResult. Set debug=True to print the analysis block during
    development (disabled by default).
    """
    normalized = normalize_query(query)

    best_intent:   Intent    = Intent.GENERAL
    best_keywords: list[str] = []

    # Intent declaration order gives deterministic tie-breaking.
    for intent, keywords in _INTENT_KEYWORDS.items():
        matched = [kw for kw in keywords if _matches(kw, normalized)]
        if len(matched) > len(best_keywords):
            best_intent, best_keywords = intent, matched

    if len(best_keywords) >= 2:
        confidence = CONFIDENCE_MULTI
    elif len(best_keywords) == 1:
        confidence = CONFIDENCE_SINGLE
    else:
        best_intent = Intent.GENERAL
        confidence  = CONFIDENCE_FALLBACK

    result = IntentResult(
        intent           = best_intent,
        confidence       = confidence,
        matched_keywords = best_keywords,
    )

    if debug:
        print_analysis(query, result)

    return result


def normalize_query(query: str) -> str:
    """Lowercase, strip apostrophes, replace punctuation with spaces, collapse whitespace."""
    text = query.lower().strip()
    text = text.translate(_APOSTROPHES)
    text = text.translate(_PUNCT_TO_SPACE)
    return " ".join(text.split())


def register_keywords(intent: Intent, keywords: list[str]) -> None:
    """
    Extension point: add domain-specific keywords for an intent.

    Future domains (Manufacturing, Healthcare, Finance, …) can enrich the
    shared tables without modifying this module. GENERAL cannot be extended —
    it is the fallback and must stay keyword-free.
    """
    if intent is Intent.GENERAL:
        raise ValueError("GENERAL is the fallback intent and takes no keywords.")
    normalized = tuple(normalize_query(kw) for kw in keywords if kw.strip())
    existing   = _INTENT_KEYWORDS.get(intent, ())
    _INTENT_KEYWORDS[intent] = existing + tuple(
        kw for kw in normalized if kw not in existing
    )


def print_analysis(query: str, result: IntentResult) -> None:
    """Print the development debug block for a detection result."""
    print(_DIVIDER)
    print("SoorgaAI Conversation Analysis")
    print(_DIVIDER)
    print(f"User Query       : {query}")
    print(f"Detected Intent  : {result.intent.name}")
    print(f"Confidence       : {result.confidence:.2f}")
    keywords = ", ".join(result.matched_keywords) or "—"
    print(f"Matched Keywords : {keywords}")
    print(_DIVIDER)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _matches(keyword: str, normalized_query: str) -> bool:
    """Whole-word/phrase match: 'improve' matches 'improve this', not 'improved'."""
    return re.search(rf"\b{re.escape(keyword)}\b", normalized_query) is not None


# ---------------------------------------------------------------------------
# CLI entry point — quick manual testing
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="SoorgaAI Conversation Intent Engine — deterministic intent detection",
    )
    parser.add_argument("--query", "-q", default=None,
                        help="Query string (omit for interactive REPL)")
    args = parser.parse_args()

    if args.query:
        detect_intent(args.query, debug=True)
        return

    print("Interactive mode — enter a query and press Enter.  Ctrl+C to exit.")
    print()
    while True:
        try:
            query = input("Query> ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break
        if not query:
            continue
        detect_intent(query, debug=True)
        print()


if __name__ == "__main__":
    main()
