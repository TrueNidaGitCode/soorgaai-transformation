"""
SoorgaAI AI Advisor — deterministic Reasoning Planner.

Turns a detected Intent into a structured ReasoningPlan (goal + tasks +
constraints) BEFORE retrieval and LLM generation. Pure template lookup with
placeholder substitution: no LLM, no embeddings, no machine learning.

Planning pipeline
─────────────────
  1. Look up the plan template for the Intent (GENERAL when unknown).
  2. Substitute placeholders — {layer} and {capability} — using the values
     supplied by the caller ("Industry" / "General" when not yet known).
  3. Append the universal grounding constraint shared by every plan.

The templates are domain-independent: {layer} resolves to "Automotive",
"Manufacturing", "Healthcare", … at plan time, so every future SoorgaAI
domain reuses this module unchanged. Domain-specific plans can be installed
via register_plan_template() without touching planner logic.

Usage:
    from knowledge_base.advisor import build_reasoning_plan
    from knowledge_base.conversation import Intent

    plan = build_reasoning_plan(
        Intent.EXPLAIN,
        query      = "Why did you suggest this vision?",
        capability = "AI Initiative Leadership",
        layer      = "Automotive",
    )
    # ReasoningPlan(intent=Intent.EXPLAIN, goal="Explain reasoning.",
    #               tasks=["Explain Core principles.",
    #                      "Explain Automotive principles.", ...], ...)
"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.conversation.intent import Intent
from knowledge_base.advisor.reasoning_plan import ReasoningPlan

_DIVIDER = "=" * 37

# Default placeholder values used before retrieval has identified the
# primary capability / layer for the query.
_DEFAULT_LAYER      = "Industry"
_DEFAULT_CAPABILITY = "General"

# Every plan ends with this constraint: SoorgaAI responses must stay
# grounded in retrieved knowledge regardless of intent.
_UNIVERSAL_CONSTRAINT = "Stay aligned to retrieved knowledge."

# ---------------------------------------------------------------------------
# Plan templates — domain-independent reasoning strategies per intent.
#
# Tasks/constraints may contain {layer} and {capability} placeholders,
# resolved at plan time. Keep entries short, imperative, and free of
# domain nouns so all SoorgaAI domains can share these templates.
# ---------------------------------------------------------------------------

_PLAN_TEMPLATES: dict[Intent, tuple[str, tuple[str, ...], tuple[str, ...]]] = {
    # Intent: (goal, tasks, constraints)
    Intent.CREATE: (
        "Generate new content.",
        (
            "Use retrieved knowledge.",
            "Combine Core and {layer} context.",
            "Generate practical content.",
        ),
        (
            "Do not score.",
            "Do not critique.",
        ),
    ),
    Intent.REFINE: (
        "Improve existing content.",
        (
            "Preserve intent.",
            "Improve clarity.",
            "Improve business value.",
            "Strengthen executive language.",
        ),
        (
            "Avoid unnecessary rewriting.",
        ),
    ),
    Intent.ASSESS: (
        "Evaluate content.",
        (
            "Identify strengths.",
            "Identify gaps.",
            "Score quality.",
            "Provide recommendations.",
        ),
        (
            "Do not rewrite.",
        ),
    ),
    Intent.EXPLAIN: (
        "Explain reasoning.",
        (
            "Explain Core principles.",
            "Explain {layer} principles.",
            "Explain assumptions.",
            "Explain applied framework.",
        ),
        (
            "Do not rewrite.",
            "Do not create new strategy.",
            "Keep explanation concise.",
        ),
    ),
    Intent.BENCHMARK: (
        "Compare against best practices.",
        (
            "Compare with industry.",
            "Identify differences.",
            "Identify opportunities.",
        ),
        (
            "Do not rewrite.",
        ),
    ),
    Intent.CRITIQUE: (
        "Challenge assumptions.",
        (
            "Find weaknesses.",
            "Find blind spots.",
            "Challenge logic.",
            "Suggest improvements.",
        ),
        (
            "Avoid rewriting.",
        ),
    ),
    Intent.RISK: (
        "Identify risks.",
        (
            "Identify business risks.",
            "Identify technical risks.",
            "Identify organizational risks.",
            "Propose mitigation ideas.",
        ),
        (
            "Avoid rewriting.",
        ),
    ),
    Intent.GENERAL: (
        "Provide balanced guidance.",
        (
            "Answer naturally.",
            "Use retrieved knowledge.",
            "Stay practical.",
        ),
        (
            "No forced structure.",
        ),
    ),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_reasoning_plan(
    intent:     Intent,
    query:      str = "",
    capability: str = "",
    layer:      str = "",
    *,
    debug:      bool = False,
) -> ReasoningPlan:
    """
    Build the ReasoningPlan for a detected intent.

    Deterministic and side-effect free: the same inputs always produce the
    same plan. capability/layer are optional — pass them when retrieval has
    already identified the primary capability/layer; otherwise placeholders
    fall back to generic labels ("Industry" / "General"). Set debug=True to
    print the analysis block during development (disabled by default).
    """
    goal, task_templates, constraint_templates = _PLAN_TEMPLATES.get(
        intent, _PLAN_TEMPLATES[Intent.GENERAL]
    )

    values = {
        "layer":      layer.strip()      or _DEFAULT_LAYER,
        "capability": capability.strip() or _DEFAULT_CAPABILITY,
    }

    tasks       = [t.format(**values) for t in task_templates]
    constraints = [c.format(**values) for c in constraint_templates]
    if _UNIVERSAL_CONSTRAINT not in constraints:
        constraints.append(_UNIVERSAL_CONSTRAINT)

    plan = ReasoningPlan(
        intent      = intent,
        goal        = goal,
        tasks       = tasks,
        constraints = constraints,
    )

    if debug:
        print_plan(query, plan)

    return plan


def register_plan_template(
    intent:      Intent,
    goal:        str,
    tasks:       list[str],
    constraints: list[str],
) -> None:
    """
    Extension point: replace the plan template for an intent.

    Future domains can install richer reasoning strategies without modifying
    planner logic. Templates may use {layer} and {capability} placeholders.
    """
    if not goal.strip():
        raise ValueError("A reasoning plan template requires a non-empty goal.")
    _PLAN_TEMPLATES[intent] = (goal, tuple(tasks), tuple(constraints))


def print_plan(query: str, plan: ReasoningPlan) -> None:
    """Print the development debug block for a reasoning plan."""
    mark = _list_marker()
    print(_DIVIDER)
    print("SoorgaAI Reasoning Planner")
    print(_DIVIDER)
    print(f"User Query  : {query or '—'}")
    print(f"Intent      : {plan.intent.name}")
    print(f"Goal        : {plan.goal}")
    print("Tasks:")
    for task in plan.tasks:
        print(f"  {mark} {task}")
    print("Constraints:")
    for constraint in plan.constraints:
        print(f"  {mark} {constraint}")
    print(_DIVIDER)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _list_marker() -> str:
    """Return '✓' when stdout can encode it, '-' otherwise (e.g. cp1252 pipes)."""
    encoding = getattr(sys.stdout, "encoding", None) or "ascii"
    try:
        "✓".encode(encoding)
        return "✓"
    except (UnicodeEncodeError, LookupError):
        return "-"


# ---------------------------------------------------------------------------
# CLI entry point — quick manual testing (intent detection + planning)
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    from knowledge_base.conversation import detect_intent

    parser = argparse.ArgumentParser(
        description="SoorgaAI AI Advisor Reasoning Planner — deterministic plan preview",
    )
    parser.add_argument("--query", "-q",  default=None,
                        help="Query string (omit for interactive REPL)")
    parser.add_argument("--capability",   default="",
                        help="Primary capability, if already known")
    parser.add_argument("--layer",        default="",
                        help="Primary knowledge layer, if already known")
    args = parser.parse_args()

    def _run(query: str) -> None:
        intent = detect_intent(query)
        build_reasoning_plan(
            intent.intent, query, args.capability, args.layer, debug=True,
        )

    if args.query:
        _run(args.query)
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
        _run(query)
        print()


if __name__ == "__main__":
    main()
