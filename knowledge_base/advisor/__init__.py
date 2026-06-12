"""
SoorgaAI AI Advisor — reusable platform module.

Deterministic reasoning layer that decides HOW SoorgaAI should think about
a query before retrieval and LLM generation. Sprint 20B: reasoning planning
only — dynamic prompting arrives in Sprint 20C.

Public API:
    from knowledge_base.advisor import ReasoningPlan, build_reasoning_plan
"""

from knowledge_base.advisor.reasoning_plan import ReasoningPlan
from knowledge_base.advisor.reasoning_planner import (
    build_reasoning_plan,
    print_plan,
    register_plan_template,
)

__all__ = [
    "ReasoningPlan",
    "build_reasoning_plan",
    "print_plan",
    "register_plan_template",
]
