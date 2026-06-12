"""
Unit tests for the SoorgaAI AI Advisor Reasoning Planner (Sprint 20B).

Pure rule-based planning — no LLM, no embeddings, no network access.
Run with:
    py -m pytest knowledge_base/advisor/tests/ -v
    py -m unittest knowledge_base.advisor.tests.test_reasoning_planner
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.advisor import ReasoningPlan, build_reasoning_plan
from knowledge_base.conversation import Intent, detect_intent


def _plan_for(query: str, capability: str = "", layer: str = "") -> ReasoningPlan:
    """Run the Sprint 20A→20B pipeline: detect intent, then build the plan."""
    intent = detect_intent(query)
    return build_reasoning_plan(intent.intent, query, capability, layer)


# ---------------------------------------------------------------------------
# Sprint 20B required test cases — query → intent → goal
# ---------------------------------------------------------------------------

class TestSprint20BRequiredCases(unittest.TestCase):
    """The eight planning cases mandated by the sprint specification."""

    def _assert_plan(self, query: str, intent: Intent, goal: str) -> None:
        plan = _plan_for(query)
        self.assertIs(plan.intent, intent)
        self.assertEqual(plan.goal, goal)

    def test_create(self):
        self._assert_plan("Help me define our AI vision.",
                          Intent.CREATE, "Generate new content.")

    def test_refine(self):
        self._assert_plan("Improve this vision.",
                          Intent.REFINE, "Improve existing content.")

    def test_assess(self):
        self._assert_plan("Rate our AI strategy.",
                          Intent.ASSESS, "Evaluate content.")

    def test_explain(self):
        self._assert_plan("Why did you suggest this?",
                          Intent.EXPLAIN, "Explain reasoning.")

    def test_benchmark(self):
        self._assert_plan("Compare with automotive best practices.",
                          Intent.BENCHMARK, "Compare against best practices.")

    def test_critique(self):
        self._assert_plan("Challenge my assumptions.",
                          Intent.CRITIQUE, "Challenge assumptions.")

    def test_risk(self):
        self._assert_plan("What risks do you see?",
                          Intent.RISK, "Identify risks.")

    def test_general(self):
        self._assert_plan("Tell me about AI strategy.",
                          Intent.GENERAL, "Provide balanced guidance.")


# ---------------------------------------------------------------------------
# Plan content — tasks and constraints per intent
# ---------------------------------------------------------------------------

class TestPlanContent(unittest.TestCase):

    def test_explain_plan_success_criteria(self):
        # The CTO success-criteria case: layer is known to be Automotive.
        plan = build_reasoning_plan(
            Intent.EXPLAIN,
            query      = "Why did you suggest this vision?",
            capability = "AI Initiative Leadership",
            layer      = "Automotive",
        )
        self.assertIs(plan.intent, Intent.EXPLAIN)
        self.assertEqual(plan.goal, "Explain reasoning.")
        self.assertIn("Explain Core principles.", plan.tasks)
        self.assertIn("Explain Automotive principles.", plan.tasks)
        self.assertIn("Explain assumptions.", plan.tasks)
        self.assertIn("Do not rewrite.", plan.constraints)
        self.assertIn("Stay aligned to retrieved knowledge.", plan.constraints)

    def test_layer_placeholder_defaults_to_industry(self):
        plan = build_reasoning_plan(Intent.EXPLAIN, "Why?")
        self.assertIn("Explain Industry principles.", plan.tasks)

    def test_create_plan(self):
        plan = build_reasoning_plan(Intent.CREATE, layer="Automotive")
        self.assertEqual(plan.tasks, [
            "Use retrieved knowledge.",
            "Combine Core and Automotive context.",
            "Generate practical content.",
        ])
        self.assertIn("Do not score.", plan.constraints)
        self.assertIn("Do not critique.", plan.constraints)

    def test_refine_plan(self):
        plan = build_reasoning_plan(Intent.REFINE)
        self.assertIn("Preserve intent.", plan.tasks)
        self.assertIn("Strengthen executive language.", plan.tasks)
        self.assertIn("Avoid unnecessary rewriting.", plan.constraints)

    def test_assess_plan(self):
        plan = build_reasoning_plan(Intent.ASSESS)
        self.assertIn("Identify strengths.", plan.tasks)
        self.assertIn("Score quality.", plan.tasks)
        self.assertIn("Do not rewrite.", plan.constraints)

    def test_benchmark_plan(self):
        plan = build_reasoning_plan(Intent.BENCHMARK)
        self.assertIn("Compare with industry.", plan.tasks)
        self.assertIn("Identify opportunities.", plan.tasks)

    def test_critique_plan(self):
        plan = build_reasoning_plan(Intent.CRITIQUE)
        self.assertIn("Find blind spots.", plan.tasks)
        self.assertIn("Avoid rewriting.", plan.constraints)

    def test_risk_plan(self):
        plan = build_reasoning_plan(Intent.RISK)
        self.assertIn("Identify business risks.", plan.tasks)
        self.assertIn("Identify technical risks.", plan.tasks)
        self.assertIn("Propose mitigation ideas.", plan.tasks)

    def test_general_plan_has_no_forced_structure(self):
        plan = build_reasoning_plan(Intent.GENERAL)
        self.assertIn("Answer naturally.", plan.tasks)
        self.assertIn("No forced structure.", plan.constraints)

    def test_every_intent_has_a_plan(self):
        for intent in Intent:
            with self.subTest(intent=intent):
                plan = build_reasoning_plan(intent)
                self.assertIs(plan.intent, intent)
                self.assertTrue(plan.goal)
                self.assertTrue(plan.tasks)
                self.assertTrue(plan.constraints)

    def test_universal_grounding_constraint_on_every_plan(self):
        for intent in Intent:
            with self.subTest(intent=intent):
                plan = build_reasoning_plan(intent)
                self.assertIn("Stay aligned to retrieved knowledge.",
                              plan.constraints)


# ---------------------------------------------------------------------------
# Determinism and platform constraints
# ---------------------------------------------------------------------------

class TestPlannerBehaviour(unittest.TestCase):

    def test_deterministic_repeat_calls(self):
        first  = _plan_for("Why did you suggest this vision?", layer="Automotive")
        second = _plan_for("Why did you suggest this vision?", layer="Automotive")
        self.assertEqual(first, second)

    def test_plans_are_independent_instances(self):
        # Mutating one plan must not leak into the shared templates.
        plan = build_reasoning_plan(Intent.RISK)
        plan.tasks.append("Tampered task.")
        self.assertNotIn("Tampered task.", build_reasoning_plan(Intent.RISK).tasks)

    def test_result_type(self):
        self.assertIsInstance(build_reasoning_plan(Intent.CREATE), ReasoningPlan)

    def test_no_llm_or_network_dependencies(self):
        # The advisor package must stay import-light: pure stdlib.
        import knowledge_base.advisor.reasoning_planner as planner
        forbidden = ("anthropic", "openai", "chromadb", "langchain", "httpx")
        for name in forbidden:
            self.assertNotIn(name, dir(planner))


if __name__ == "__main__":
    unittest.main()
