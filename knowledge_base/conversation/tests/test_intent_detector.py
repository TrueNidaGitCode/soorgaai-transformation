"""
Unit tests for the SoorgaAI Conversation Intent Engine (Sprint 20A).

Pure rule-based detection — no LLM, no embeddings, no network access.
Run with:
    py -m pytest knowledge_base/conversation/tests/ -v
    py -m unittest knowledge_base.conversation.tests.test_intent_detector
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.conversation import (
    CONFIDENCE_FALLBACK,
    CONFIDENCE_MULTI,
    CONFIDENCE_SINGLE,
    Intent,
    IntentResult,
    detect_intent,
    normalize_query,
)


# ---------------------------------------------------------------------------
# Sprint 20A required test cases
# ---------------------------------------------------------------------------

class TestSprint20ARequiredCases(unittest.TestCase):
    """The eight detection cases mandated by the sprint specification."""

    def test_create(self):
        self.assertIs(detect_intent("Help me define our AI vision.").intent,
                      Intent.CREATE)

    def test_refine(self):
        self.assertIs(detect_intent("Improve this vision.").intent,
                      Intent.REFINE)

    def test_assess(self):
        self.assertIs(detect_intent("Rate our AI strategy.").intent,
                      Intent.ASSESS)

    def test_explain(self):
        self.assertIs(detect_intent("Why did you suggest this?").intent,
                      Intent.EXPLAIN)

    def test_benchmark(self):
        self.assertIs(detect_intent("Compare with automotive best practices.").intent,
                      Intent.BENCHMARK)

    def test_critique(self):
        self.assertIs(detect_intent("Challenge my assumptions.").intent,
                      Intent.CRITIQUE)

    def test_risk(self):
        self.assertIs(detect_intent("What risks do you see?").intent,
                      Intent.RISK)

    def test_general_fallback(self):
        self.assertIs(detect_intent("Tell me about AI strategy.").intent,
                      Intent.GENERAL)


# ---------------------------------------------------------------------------
# Specification examples per intent
# ---------------------------------------------------------------------------

class TestSpecificationExamples(unittest.TestCase):
    """Wider example coverage drawn from the intent definitions."""

    def _assert_all(self, queries: list[str], expected: Intent) -> None:
        for query in queries:
            with self.subTest(query=query):
                self.assertIs(detect_intent(query).intent, expected)

    def test_create_examples(self):
        self._assert_all([
            "Create an AI strategy.",
            "Draft our AI commitment.",
            "Build an AI roadmap.",
            "Write a strategy statement.",
        ], Intent.CREATE)

    def test_refine_examples(self):
        self._assert_all([
            "Rewrite this.",
            "Strengthen this.",
            "Enhance this.",
            "Make this measurable.",
            "Make this more executive.",
        ], Intent.REFINE)

    def test_assess_examples(self):
        self._assert_all([
            "Assess this strategy.",
            "Evaluate this roadmap.",
            "Score this.",
            "Review our alignment.",
        ], Intent.ASSESS)

    def test_explain_examples(self):
        self._assert_all([
            "Explain your reasoning.",
            "How did you reach this conclusion?",
            "What principles did you use?",
            "Why is this important?",
        ], Intent.EXPLAIN)

    def test_benchmark_examples(self):
        self._assert_all([
            "Compare with industry.",
            "Benchmark this.",
            "How do OEMs approach this?",
            "What are best practices?",
            "Compare with automotive leaders.",
        ], Intent.BENCHMARK)

    def test_critique_examples(self):
        self._assert_all([
            "Challenge this.",
            "What is missing?",
            "What are the weaknesses?",
            "Play devil's advocate.",
            "What could be improved?",
        ], Intent.CRITIQUE)

    def test_risk_examples(self):
        self._assert_all([
            "What could go wrong?",
            "Identify issues.",
            "What are the pitfalls?",
            "What concerns should leadership have?",
        ], Intent.RISK)

    def test_general_examples(self):
        self._assert_all([
            "Tell me about AI strategy.",
            "What is AI governance?",
            "What is an AI CoE?",
        ], Intent.GENERAL)


# ---------------------------------------------------------------------------
# Confidence scoring
# ---------------------------------------------------------------------------

class TestConfidenceScoring(unittest.TestCase):

    def test_multiple_matches_gives_095(self):
        result = detect_intent("Why did you suggest this vision?")
        self.assertIs(result.intent, Intent.EXPLAIN)
        self.assertEqual(result.confidence, CONFIDENCE_MULTI)
        self.assertEqual(result.matched_keywords, ["why", "suggest"])

    def test_single_match_gives_080(self):
        result = detect_intent("Rate our AI strategy.")
        self.assertIs(result.intent, Intent.ASSESS)
        self.assertEqual(result.confidence, CONFIDENCE_SINGLE)
        self.assertEqual(result.matched_keywords, ["rate"])

    def test_fallback_gives_050(self):
        result = detect_intent("Tell me about AI strategy.")
        self.assertIs(result.intent, Intent.GENERAL)
        self.assertEqual(result.confidence, CONFIDENCE_FALLBACK)
        self.assertEqual(result.matched_keywords, [])

    def test_result_type(self):
        self.assertIsInstance(detect_intent("Score this."), IntentResult)


# ---------------------------------------------------------------------------
# Determinism, normalization, and edge cases
# ---------------------------------------------------------------------------

class TestDetectorBehaviour(unittest.TestCase):

    def test_deterministic_repeat_calls(self):
        query = "Compare with automotive best practices."
        first  = detect_intent(query)
        second = detect_intent(query)
        self.assertEqual(first, second)

    def test_case_punctuation_whitespace_insensitive(self):
        variants = [
            "  CHALLENGE my ASSUMPTIONS!!  ",
            "challenge, my... assumptions",
            "Challenge my assumptions.",
        ]
        results = [detect_intent(v) for v in variants]
        for result in results:
            self.assertIs(result.intent, Intent.CRITIQUE)
            self.assertEqual(result.matched_keywords, ["challenge", "assumptions"])

    def test_whole_word_matching_no_substring_hits(self):
        # "improved" must not trigger the REFINE keyword "improve":
        # "What could be improved?" is a CRITIQUE phrase.
        result = detect_intent("What could be improved?")
        self.assertIs(result.intent, Intent.CRITIQUE)
        self.assertEqual(result.matched_keywords, ["could be improved"])

    def test_normalize_query(self):
        self.assertEqual(
            normalize_query("  Play DEVIL'S advocate!?  "),
            "play devils advocate",
        )

    def test_empty_query_falls_back_to_general(self):
        result = detect_intent("")
        self.assertIs(result.intent, Intent.GENERAL)
        self.assertEqual(result.confidence, CONFIDENCE_FALLBACK)

    def test_whitespace_only_query_falls_back_to_general(self):
        self.assertIs(detect_intent("   \t  ").intent, Intent.GENERAL)

    def test_most_matches_wins_across_intents(self):
        # "why" + "suggest" (EXPLAIN ×2) outweighs "improve" (REFINE ×1).
        result = detect_intent("Why did you suggest I improve this?")
        self.assertIs(result.intent, Intent.EXPLAIN)
        self.assertEqual(result.confidence, CONFIDENCE_MULTI)

    def test_no_llm_or_network_dependencies(self):
        # The conversation package must stay import-light: pure stdlib.
        import knowledge_base.conversation.intent_detector as detector
        forbidden = ("anthropic", "openai", "chromadb", "langchain", "httpx")
        for name in forbidden:
            self.assertNotIn(name, dir(detector))


if __name__ == "__main__":
    unittest.main()
