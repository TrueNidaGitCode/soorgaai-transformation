"""
SoorgaAI — Strategy Response Engine

Converts a ContextPackage into a professional AI strategy response using Claude.
Builds a structured prompt that preserves capability hierarchy, source attribution,
and layer context. Returns both the prompt package and generated response for
full traceability.

No content is fabricated or hallucinated. Claude is instructed to cite every claim
with a chunk_id and to respond with "Not available in the current knowledge base."
for anything not present in the supplied context.

Usage:
    py knowledge_base/strategy_response_engine.py --provider openai --query "AI governance"
    py knowledge_base/strategy_response_engine.py --provider huggingface --query "..." \\
        --top-k 8 --threshold 0.05
    py knowledge_base/strategy_response_engine.py --provider openai   # interactive REPL

Install:
    pip install chromadb anthropic langchain-openai
    # or for HuggingFace:
    pip install chromadb anthropic langchain-community sentence-transformers

Note: Requires ANTHROPIC_API_KEY environment variable.
      Run vector_store.py first to populate the Chroma collection.

Usage (module):
    from knowledge_base.strategy_response_engine import ClaudeStrategyResponseEngine
    from knowledge_base.context_builder import DefaultContextBuilder
    from knowledge_base.hybrid_retrieval import ChromaHybridRetrieval

    engine   = ChromaHybridRetrieval(docs, embeddings)
    result   = engine.retrieve("AI governance framework", top_k=5)
    package  = DefaultContextBuilder().build(result)
    strategy = ClaudeStrategyResponseEngine()
    prompt   = strategy.build_prompt(package)
    response = strategy.generate(prompt, stream_to_stdout=True)
    strategy.print_response(response, include_text=False)
"""

from __future__ import annotations

import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path

_HERE = Path(__file__).parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.advisor import ReasoningPlan, print_plan
from knowledge_base.context_builder import ContextPackage, DefaultContextBuilder, KnowledgeSection
from knowledge_base.conversation import IntentResult, detect_intent
from knowledge_base.embedding_engine import create_embeddings
from knowledge_base.hybrid_retrieval import ChromaHybridRetrieval
from knowledge_base.loader import CapabilityIndex, MarkdownLoader
from knowledge_base.vector_store import _DEFAULT_COLLECTION, _DEFAULT_PERSIST

_DEFAULT_MODEL           = "claude-opus-4-8"
_DEFAULT_MAX_TOKENS      = 16000   # must cover thinking budget + response
_DEFAULT_THINKING_BUDGET = 8000    # tokens reserved for extended thinking
_DIVIDER            = "=" * 56

# ---------------------------------------------------------------------------
# System prompt — cached across requests (stable content)
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are SoorgaAI, a professional AI strategy consultant specialising in enterprise \
and automotive AI adoption.

You generate structured strategy responses using ONLY the knowledge provided in the \
user message. Do not use external knowledge, general training data, or any information \
not explicitly present in the supplied context. If information is not available, state \
exactly: "Not available in the current knowledge base."

Response format — always produce these six sections in this order:

## Executive Summary
Two to three sentences directly answering the query from the supplied context.

## Core Perspective
Strategic insights from Core layer knowledge. Cite every factual claim as [chunk_id]. \
If no Core knowledge is available: "Not available in the current knowledge base."

## Automotive Perspective
Strategic insights from Automotive layer knowledge. Cite every factual claim as [chunk_id]. \
If no Automotive knowledge is available: "Not available in the current knowledge base."

## Strategic Insights
Three to five cross-cutting themes synthesised from the provided context. \
Cite with [chunk_id].

## Recommendations
Three to five concrete, actionable recommendations. Each must reference at least one \
[chunk_id] from the supplied context.

## Sources Used
A bulleted list of every chunk cited in this response:
- [chunk_id] | Document | Section

Strict rules:
— Use ONLY information explicitly present in the supplied context sections.
— Cite every factual claim with at least one [chunk_id].
— Do not fabricate capabilities, metrics, organisations, or strategies.
— Never reference knowledge outside the supplied context, even if you know it to be true.\
"""


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class PromptPackage:
    """
    Structured prompt ready to send to Claude.

    Preserves full traceability: the system prompt, formatted knowledge context,
    original query, the ContextPackage it was built from, and the list of
    chunk_ids included so callers can verify source coverage.

    intent carries the conversation intent detected before retrieval
    (SoorgaAI Conversation Engine); reasoning_plan carries the strategy
    derived from it (SoorgaAI AI Advisor). Sprints 20A/20B store them for
    traceability; the Sprint 20C Prompt Builder will consume them for
    dynamic prompting. Both are None when detection was skipped — fully
    backward compatible.
    """
    system_prompt:      str
    knowledge_context:  str
    query_text:         str
    context_package:    ContextPackage
    model:              str
    chunk_ids_included: list[str]            = field(default_factory=list)
    intent:             IntentResult | None  = None
    reasoning_plan:     ReasoningPlan | None = None


@dataclass
class StrategyResponse:
    """
    Claude's generated strategy response with full provenance.

    Both the prompt package and the response text are preserved so downstream
    systems can audit every claim against its source chunk.
    """
    prompt_package:       PromptPackage
    response_text:        str
    model:                str
    input_tokens:         int
    output_tokens:        int
    cache_tokens_created: int   # tokens written to Anthropic prompt cache
    cache_tokens_read:    int   # tokens served from cache (billed at ~0.1×)
    query:                str


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class StrategyResponseEngine(ABC):
    """
    Abstract interface for the strategy response pipeline.

    Subclass to swap the LLM backend without changing the retrieval or context
    building layers. build_prompt() and generate() are separated so callers can
    inspect the prompt before sending it to the model.
    """

    @abstractmethod
    def build_prompt(self, package: ContextPackage) -> PromptPackage:
        """Build a structured PromptPackage from a ContextPackage."""

    @abstractmethod
    def generate(
        self,
        prompt_package: PromptPackage,
        *,
        stream_to_stdout: bool = False,
    ) -> StrategyResponse:
        """
        Send the PromptPackage to the LLM and return the complete response.

        stream_to_stdout: when True, print text tokens as they arrive so the
        user sees progressive output. The returned StrategyResponse still
        contains the full response_text either way.
        """

    def respond(
        self,
        package: ContextPackage,
        *,
        stream_to_stdout: bool = False,
    ) -> StrategyResponse:
        """Convenience: build_prompt + generate in one call."""
        prompt = self.build_prompt(package)
        return self.generate(prompt, stream_to_stdout=stream_to_stdout)

    def print_response(
        self,
        response: StrategyResponse,
        *,
        include_text: bool = True,
    ) -> None:
        """
        Print the response summary and (optionally) the response text.

        Pass include_text=False after streaming so the text is not printed twice.
        """
        print()
        print(_DIVIDER)
        print(f"Query   : {response.query}")
        if response.prompt_package.intent is not None:
            intent = response.prompt_package.intent
            print(f"Intent  : {intent.intent.name}  (confidence={intent.confidence:.2f})")
        if response.prompt_package.reasoning_plan is not None:
            print(f"Plan    : {response.prompt_package.reasoning_plan.goal}")
        print(f"Model   : {response.model}")
        print(f"Tokens  : {response.input_tokens} in → {response.output_tokens} out")
        if response.cache_tokens_created or response.cache_tokens_read:
            print(
                f"Cache   : {response.cache_tokens_created} written  "
                f"{response.cache_tokens_read} read"
            )
        pkg = response.prompt_package
        print(f"Chunks  : {len(pkg.chunk_ids_included)} context chunks used")
        print(_DIVIDER)

        if include_text:
            print()
            print(response.response_text)
            print()
            print(_DIVIDER)

        # Chunk traceability table
        print("SOURCES INCLUDED IN PROMPT")
        print(_DIVIDER)
        for cid in pkg.chunk_ids_included:
            sec = next(
                (s for s in pkg.context_package.sections if s.chunk_id == cid),
                None,
            )
            if sec:
                print(
                    f"  [{sec.source:<10}]  [{sec.layer:<12}]  "
                    f"{sec.capability} / {sec.section}  ({cid})"
                )
            else:
                print(f"  {cid}")
        print(_DIVIDER)


# ---------------------------------------------------------------------------
# Claude implementation
# ---------------------------------------------------------------------------

class ClaudeStrategyResponseEngine(StrategyResponseEngine):
    """
    Strategy response engine backed by Anthropic Claude.

    Uses prompt caching on both the system prompt and the knowledge context
    block to minimise cost when the same or similar context is queried
    repeatedly within the cache TTL window.

    Adaptive thinking is enabled so Claude can reason through complex strategy
    questions before generating the final response.

    Parameters
    ----------
    model:
        Claude model ID. Defaults to claude-opus-4-8.
    max_tokens:
        Maximum output tokens (thinking + response). Defaults to 16000.
    thinking_budget_tokens:
        Token budget for extended thinking. Must be < max_tokens. Defaults to 8000.
    enable_thinking:
        Set False to disable extended thinking (faster, cheaper). Default True.
    """

    def __init__(
        self,
        model:                 str  = _DEFAULT_MODEL,
        max_tokens:            int  = _DEFAULT_MAX_TOKENS,
        thinking_budget_tokens: int  = _DEFAULT_THINKING_BUDGET,
        enable_thinking:       bool = True,
    ) -> None:
        try:
            import anthropic as _anthropic
            self._anthropic = _anthropic
            self._client    = _anthropic.Anthropic()
        except ImportError:
            raise ImportError(
                "Anthropic SDK is not installed.\n  Run: pip install anthropic"
            )

        if enable_thinking and thinking_budget_tokens >= max_tokens:
            raise ValueError(
                f"thinking_budget_tokens ({thinking_budget_tokens}) must be "
                f"less than max_tokens ({max_tokens})."
            )

        self._model           = model
        self._max_tokens      = max_tokens
        self._thinking_budget = thinking_budget_tokens if enable_thinking else None

    # ------------------------------------------------------------------
    # StrategyResponseEngine interface
    # ------------------------------------------------------------------

    def build_prompt(self, package: ContextPackage) -> PromptPackage:
        """Build a PromptPackage from a ContextPackage."""
        return PromptPackage(
            system_prompt      = _SYSTEM_PROMPT,
            knowledge_context  = _build_knowledge_context(package),
            query_text         = package.query,
            context_package    = package,
            model              = self._model,
            chunk_ids_included = [s.chunk_id for s in package.sections],
            intent             = package.intent,
            reasoning_plan     = package.reasoning_plan,
        )

    def generate(
        self,
        prompt_package: PromptPackage,
        *,
        stream_to_stdout: bool = False,
    ) -> StrategyResponse:
        """
        Call Claude with streaming, collect the response, and return StrategyResponse.

        Prompt caching layout
        ─────────────────────
        system[0]          : static SoorgaAI instructions   → cache_control ephemeral
        messages[0].content[0] : knowledge context block     → cache_control ephemeral
        messages[0].content[1] : user query (varies)         → no cache marker
        """
        system = [
            {
                "type":          "text",
                "text":          prompt_package.system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type":          "text",
                        "text":          prompt_package.knowledge_context,
                        "cache_control": {"type": "ephemeral"},
                    },
                    {
                        "type": "text",
                        "text": (
                            f"Query: {prompt_package.query_text}\n\n"
                            "Generate a structured strategy response following the "
                            "six-section format in the system prompt."
                        ),
                    },
                ],
            }
        ]

        collected: list[str] = []

        extra_kwargs: dict = {}
        if self._thinking_budget is not None:
            extra_kwargs["thinking"] = {
                "type":          "enabled",
                "budget_tokens": self._thinking_budget,
            }

        with self._client.messages.stream(
            model      = prompt_package.model,
            max_tokens = self._max_tokens,
            system     = system,
            messages   = messages,
            **extra_kwargs,
        ) as stream:
            for text in stream.text_stream:
                if stream_to_stdout:
                    print(text, end="", flush=True)
                collected.append(text)

            if stream_to_stdout:
                print()

            final = stream.get_final_message()

        usage = final.usage
        return StrategyResponse(
            prompt_package       = prompt_package,
            response_text        = "".join(collected),
            model                = final.model,
            input_tokens         = usage.input_tokens,
            output_tokens        = usage.output_tokens,
            cache_tokens_created = getattr(usage, "cache_creation_input_tokens", 0) or 0,
            cache_tokens_read    = getattr(usage, "cache_read_input_tokens",      0) or 0,
            query                = prompt_package.query_text,
        )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _build_knowledge_context(package: ContextPackage) -> str:
    """
    Format the ContextPackage into a structured text block for the Claude prompt.

    Layout:
        Query / Primary Capability / Primary Layer header
        === CORE KNOWLEDGE ===    — structured/both chunks, grouped by capability
        === AUTOMOTIVE KNOWLEDGE === — structured/both chunks, grouped by capability
        === <OTHER LAYER> KNOWLEDGE === — any extra layers
        === RELATED KNOWLEDGE ===  — semantic-only chunks
    """
    lines: list[str] = [
        f"Query              : {package.query}",
        f"Primary Capability : {package.primary_capability or 'Not detected'}",
        f"Primary Layer      : {package.primary_layer      or 'Not detected'}",
        "",
    ]

    # Core knowledge
    _append_layer_block(lines, "CORE KNOWLEDGE",
                        package.layer_groups.get("Core", []))

    # Automotive knowledge
    _append_layer_block(lines, "AUTOMOTIVE KNOWLEDGE",
                        package.layer_groups.get("Automotive", []))

    # Any additional named layers (Templates, etc.)
    for layer in sorted(package.layer_groups):
        if layer not in ("Core", "Automotive"):
            _append_layer_block(lines, f"{layer.upper()} KNOWLEDGE",
                                package.layer_groups[layer])

    # Related semantic-only knowledge
    if package.related:
        lines.append("=== RELATED KNOWLEDGE ===")
        for s in package.related:
            lines.extend(_format_chunk(s))
        lines.append("")

    return "\n".join(lines)


def _append_layer_block(lines: list[str], label: str,
                        sections: list[KnowledgeSection]) -> None:
    lines.append(f"=== {label} ===")
    if not sections:
        lines.append(f"(No {label.lower()} retrieved for this query.)")
        lines.append("")
        return

    cap_order: list[str] = []
    cap_map: dict[str, list[KnowledgeSection]] = {}
    for s in sections:
        if s.capability not in cap_map:
            cap_order.append(s.capability)
            cap_map[s.capability] = []
        cap_map[s.capability].append(s)

    for cap in cap_order:
        lines.append(f"\nCapability: {cap}")
        for s in cap_map[cap]:
            lines.extend(_format_chunk(s))

    lines.append("")


def _format_chunk(s: KnowledgeSection) -> list[str]:
    return [
        f"\nDocument : {s.document}",
        f"Section  : {s.section}  [Source: {s.chunk_id}]",
        s.content.strip(),
        "---",
    ]


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _build_default_dir() -> Path:
    return _HERE / "automotive" / "enterprise_ai" / "AI_Strategy"


def main() -> None:
    import argparse

    _EMBED_PROVIDERS = ["openai", "huggingface", "ollama"]

    parser = argparse.ArgumentParser(
        description="SoorgaAI Strategy Response Engine — retrieval + Claude reasoning",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--provider",     choices=_EMBED_PROVIDERS, required=True,
                        help="Embedding provider for vector retrieval")
    parser.add_argument("--embed-model",  default=None,
                        help="Embedding model override")
    parser.add_argument("--query", "-q",  default=None,
                        help="Query string (omit for interactive REPL)")
    parser.add_argument("--top-k", "-k",  type=int, default=5,
                        help="Semantic arm: number of results")
    parser.add_argument("--threshold",    type=float, default=0.0,
                        help="Min similarity score for semantic-only chunks")
    parser.add_argument("--claude-model",    default=_DEFAULT_MODEL,
                        help="Claude model ID for response generation")
    parser.add_argument("--max-tokens",      type=int, default=_DEFAULT_MAX_TOKENS,
                        help="Max output tokens for Claude (includes thinking budget)")
    parser.add_argument("--thinking-budget", type=int, default=_DEFAULT_THINKING_BUDGET,
                        help="Extended-thinking token budget (must be < max-tokens)")
    parser.add_argument("--no-thinking",     action="store_true",
                        help="Disable extended thinking (faster, cheaper)")
    parser.add_argument("--persist-dir",  default=_DEFAULT_PERSIST,
                        help="Chroma persistence directory")
    parser.add_argument("--collection",   default=_DEFAULT_COLLECTION,
                        help="Chroma collection name")
    parser.add_argument("--directory",    default=str(_build_default_dir()),
                        help="Knowledge base directory for the CapabilityIndex")
    parser.add_argument("--no-intent-debug", action="store_true",
                        help="Suppress the SoorgaAI Conversation Analysis debug block")
    parser.add_argument("--no-plan-debug", action="store_true",
                        help="Suppress the SoorgaAI Reasoning Planner debug block")
    args = parser.parse_args()

    # ── Build retrieval pipeline ──────────────────────────────────────────
    print(f"Loading capability index from: {args.directory}")
    docs      = MarkdownLoader(args.directory).load()
    cap_index = CapabilityIndex(docs)
    print(f"  {len(docs)} documents  |  {len(cap_index.get_capabilities())} capabilities")
    print()

    print(f"Initialising embeddings: {args.provider}")
    embeddings     = create_embeddings(args.provider, args.embed_model)
    hybrid_engine  = ChromaHybridRetrieval(
        documents       = docs,
        embeddings      = embeddings,
        persist_dir     = args.persist_dir,
        collection_name = args.collection,
    )
    context_builder  = DefaultContextBuilder(similarity_threshold=args.threshold)
    strategy_engine  = ClaudeStrategyResponseEngine(
        model                 = args.claude_model,
        max_tokens            = args.max_tokens,
        thinking_budget_tokens = args.thinking_budget,
        enable_thinking       = not args.no_thinking,
    )

    thinking_status = (
        f"budget={args.thinking_budget} tokens"
        if not args.no_thinking
        else "disabled"
    )
    print(f"Collection '{args.collection}' — {hybrid_engine.count()} chunks indexed")
    print(f"Claude model: {args.claude_model}  |  thinking: {thinking_status}")
    print()

    def _run_query(query: str) -> None:
        print(_DIVIDER)
        print(f"Query: {query!r}")
        print(_DIVIDER)
        print()

        # Intent detection runs BEFORE hybrid retrieval (Sprint 20A).
        intent   = detect_intent(query, debug=not args.no_intent_debug)
        result   = hybrid_engine.retrieve(query, top_k=args.top_k)
        # The reasoning plan (Sprint 20B) is derived inside build() once the
        # primary capability/layer are known.
        package  = context_builder.build(result, intent=intent)
        if package.reasoning_plan is not None and not args.no_plan_debug:
            print_plan(query, package.reasoning_plan)
        prompt   = strategy_engine.build_prompt(package)
        response = strategy_engine.generate(prompt, stream_to_stdout=True)
        strategy_engine.print_response(response, include_text=False)

    if args.query:
        _run_query(args.query)
    else:
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
            _run_query(query)
            print()


if __name__ == "__main__":
    main()
