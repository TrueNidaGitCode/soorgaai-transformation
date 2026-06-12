"""
SoorgaAI — Context Builder

Transforms HybridRetrievalResult into a structured ContextPackage ready for
Claude prompt injection. No LLM is called; no content is summarised or altered.

Processing pipeline (six steps)
────────────────────────────────
  1. Deduplicate      — remove any duplicate chunk_ids.
  2. Threshold filter — drop low-confidence semantic-only chunks; structured
                        and "both" chunks are always preserved.
  3. Sort             — priority order: both > structured > semantic;
                        within each group, higher score first.
  4. Layer grouping   — separate structured/both chunks by knowledge layer
                        (Core → Automotive → Templates → …).
  5. Capability grouping — within each layer, group by capability name.
  6. Section ordering — within each capability, order by relevance score.

Output
──────
  ContextPackage:  summary fields + flat `sections` list + `layer_groups`
                   dict + `related` list (semantic-only).
  print_package(): display formatted for human review; mirrors the layout
                   that will be used in future Claude prompt templates.

Usage:
    py knowledge_base/context_builder.py --provider openai --query "AI governance"
    py knowledge_base/context_builder.py --provider huggingface --query "..." \\
        --top-k 8 --threshold 0.05
    py knowledge_base/context_builder.py --provider openai   # interactive REPL

Install:
    pip install chromadb langchain-openai
    # or for HuggingFace:
    pip install chromadb langchain-community sentence-transformers

Note: Run vector_store.py first to populate the Chroma collection.

Usage (module):
    from knowledge_base.context_builder import DefaultContextBuilder
    from knowledge_base.hybrid_retrieval import ChromaHybridRetrieval

    engine  = ChromaHybridRetrieval(docs, embeddings)
    result  = engine.retrieve("AI governance framework", top_k=5)
    builder = DefaultContextBuilder(similarity_threshold=0.05)
    package = builder.build(result)
    builder.print_package(package)
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

from knowledge_base.advisor import ReasoningPlan, build_reasoning_plan, print_plan
from knowledge_base.conversation import IntentResult, detect_intent
from knowledge_base.embedding_engine import create_embeddings
from knowledge_base.hybrid_retrieval import ChromaHybridRetrieval, HybridRetrievalResult
from knowledge_base.loader import CapabilityIndex, MarkdownLoader
from knowledge_base.vector_store import _DEFAULT_COLLECTION, _DEFAULT_PERSIST

_LAYER_ORDER   = ("Core", "Automotive", "Templates")
_SOURCE_ORDER  = {"both": 0, "structured": 1, "semantic": 2}
_DIVIDER       = "=" * 52
_PREVIEW_LEN   = 180


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class KnowledgeSection:
    """
    A single retrieved knowledge chunk with full provenance preserved.

    All fields are passed through unchanged from the hybrid retrieval result
    so that future Claude prompts can reason about source, layer, and score.
    """
    layer:      str
    capability: str
    document:   str
    section:    str
    chunk_id:   str
    score:      float
    source:     str    # "structured" | "semantic" | "both"
    content:    str


@dataclass
class ContextPackage:
    """
    Structured knowledge package for Claude prompt injection.

    Fields
    ──────
    query                   Original user query — passed to Claude as-is.
    primary_capability      Capability of the highest-priority retrieved chunk.
    primary_layer           Layer of the highest-priority retrieved chunk.
    retrieved_layers        Unique layers present, in canonical layer order.
    retrieved_capabilities  Unique capabilities present, ordered by layer then alpha.
    total_chunks            Total chunks after dedup + threshold filter.
    sections                Flat ordered list (both → structured → semantic,
                            then score desc) — the sequence to inject into a prompt.
    layer_groups            dict[layer → sections] for structured/both chunks;
                            enables hierarchical template rendering.
    related                 Semantic-only sections — additional context beyond
                            what capability detection found.
    intent                  Conversation intent detected before retrieval
                            (SoorgaAI Conversation Engine). None when the
                            caller skipped intent detection — fully backward
                            compatible.
    reasoning_plan          Reasoning strategy built from the intent
                            (SoorgaAI AI Advisor). None when no intent was
                            supplied — fully backward compatible.
    """
    query:                  str
    primary_capability:     str
    primary_layer:          str
    retrieved_layers:       list[str]
    retrieved_capabilities: list[str]
    total_chunks:           int
    sections:               list[KnowledgeSection]
    layer_groups:           dict[str, list[KnowledgeSection]] = field(default_factory=dict)
    related:                list[KnowledgeSection]            = field(default_factory=list)
    intent:                 IntentResult | None               = None
    reasoning_plan:         ReasoningPlan | None              = None


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class ContextBuilder(ABC):
    """
    Abstract interface for building a ContextPackage from hybrid retrieval results.

    Subclass to apply custom filtering, re-ranking, or packaging strategies
    without changing the rest of the pipeline. print_package() provides a
    default display that mirrors the future Claude prompt template layout.
    """

    @abstractmethod
    def build(
        self,
        result: HybridRetrievalResult,
        intent: IntentResult | None = None,
        reasoning_plan: ReasoningPlan | None = None,
    ) -> ContextPackage:
        """
        Transform a HybridRetrievalResult into a ContextPackage.

        intent: optional IntentResult detected before retrieval; stored on
        the package unchanged. Omitting it preserves pre-Sprint-20A behaviour.

        reasoning_plan: optional pre-built ReasoningPlan. When omitted but an
        intent is supplied, implementations derive the plan from the intent
        using the primary capability/layer identified during packaging.
        """

    def print_package(self, package: ContextPackage) -> None:
        """Print the context package formatted for human review."""

        # ── Summary header ────────────────────────────────────────────────
        print(_DIVIDER)
        print(f"User Query            : {package.query}")
        if package.intent is not None:
            print(f"Detected Intent       : {package.intent.intent.name}  "
                  f"(confidence={package.intent.confidence:.2f})")
        if package.reasoning_plan is not None:
            print(f"Reasoning Goal        : {package.reasoning_plan.goal}")
        print(f"Primary Capability    : {package.primary_capability or '—'}")
        print(f"Primary Layer         : {package.primary_layer or '—'}")
        print(f"Retrieved Layers      : {', '.join(package.retrieved_layers) or '—'}")
        caps_str = ", ".join(package.retrieved_capabilities) or "—"
        print(f"Retrieved Capabilities: {caps_str}")
        print(f"Total Context Chunks  : {package.total_chunks}")
        print(_DIVIDER)

        # ── Named layer sections (structured + both) ──────────────────────
        printed_any_layer = False
        ordered_layers = [l for l in _LAYER_ORDER if l in package.layer_groups]
        extra_layers   = sorted(l for l in package.layer_groups if l not in _LAYER_ORDER)

        for layer in ordered_layers + extra_layers:
            secs = package.layer_groups[layer]
            if not secs:
                continue
            printed_any_layer = True
            print(layer)
            print()
            _print_capability_groups(secs)
            print(_DIVIDER)

        # ── Related Knowledge (semantic-only) ─────────────────────────────
        if package.related:
            print("Related Knowledge")
            print()
            _print_capability_groups(package.related)
            print(_DIVIDER)

        if not printed_any_layer and not package.related:
            print("  (no context retrieved)")
            print(_DIVIDER)


# ---------------------------------------------------------------------------
# Default implementation
# ---------------------------------------------------------------------------

class DefaultContextBuilder(ContextBuilder):
    """
    Standard six-step Context Builder.

    Parameters
    ----------
    similarity_threshold:
        Minimum score for semantic-only chunks to be included.
        Structured and "both" chunks always pass regardless of score.
        Default 0.0 retains all chunks; raise to 0.05–0.10 to prune noise.
    """

    def __init__(self, similarity_threshold: float = 0.0) -> None:
        self._threshold = similarity_threshold

    # ------------------------------------------------------------------
    # ContextBuilder interface
    # ------------------------------------------------------------------

    def build(
        self,
        result: HybridRetrievalResult,
        intent: IntentResult | None = None,
        reasoning_plan: ReasoningPlan | None = None,
    ) -> ContextPackage:
        """Run the six-step pipeline and return a ContextPackage."""

        # Step 1 — Deduplicate by chunk_id
        seen_ids: set[str] = set()
        deduped: list = []
        for r in result.merged:
            if r.chunk_id not in seen_ids:
                seen_ids.add(r.chunk_id)
                deduped.append(r)

        # Step 2 — Threshold filter (semantic-only only)
        filtered = [
            r for r in deduped
            if r.source != "semantic" or r.score >= self._threshold
        ]

        # Step 3 — Sort: both > structured > semantic, then score desc
        ordered = sorted(
            filtered,
            key=lambda r: (_SOURCE_ORDER.get(r.source, 9), -r.score),
        )

        # Step 4–6 — Convert to KnowledgeSection; build layer/capability groups
        sections = [_to_section(r) for r in ordered]

        layer_groups: dict[str, list[KnowledgeSection]] = {}
        related:      list[KnowledgeSection]            = []

        for s in sections:
            if s.source in ("structured", "both"):
                layer_groups.setdefault(s.layer, []).append(s)
            else:
                related.append(s)

        # Step 5 — Within each layer, sort by capability then score desc
        for secs in layer_groups.values():
            secs.sort(key=lambda s: (s.capability, -s.score))

        # ── Derive summary fields ─────────────────────────────────────────
        primary           = sections[0] if sections else None
        primary_capability = primary.capability if primary else ""
        primary_layer      = primary.layer      if primary else ""

        all_layers = {s.layer for s in sections}
        retrieved_layers = [l for l in _LAYER_ORDER if l in all_layers]
        retrieved_layers += sorted(all_layers - set(_LAYER_ORDER))

        retrieved_capabilities = _ordered_capabilities(sections, retrieved_layers)

        # Sprint 20B — derive the reasoning plan from the detected intent,
        # now that the primary capability/layer are known.
        if reasoning_plan is None and intent is not None:
            reasoning_plan = build_reasoning_plan(
                intent.intent,
                query      = result.query,
                capability = primary_capability,
                layer      = primary_layer,
            )

        return ContextPackage(
            query                  = result.query,
            primary_capability     = primary_capability,
            primary_layer          = primary_layer,
            retrieved_layers       = retrieved_layers,
            retrieved_capabilities = retrieved_capabilities,
            total_chunks           = len(sections),
            sections               = sections,
            layer_groups           = layer_groups,
            related                = related,
            intent                 = intent,
            reasoning_plan         = reasoning_plan,
        )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _to_section(r) -> KnowledgeSection:
    return KnowledgeSection(
        layer      = r.layer,
        capability = r.capability,
        document   = r.document,
        section    = r.section,
        chunk_id   = r.chunk_id,
        score      = r.score,
        source     = r.source,
        content    = r.content,
    )


def _ordered_capabilities(sections: list[KnowledgeSection], layers: list[str]) -> list[str]:
    """Return unique capabilities in layer order, then alphabetical within each layer."""
    seen: set[str] = set()
    caps: list[str] = []
    for layer in layers:
        for s in sorted(sections, key=lambda s: s.capability):
            if s.layer == layer and s.capability not in seen:
                seen.add(s.capability)
                caps.append(s.capability)
    for s in sorted(sections, key=lambda s: s.capability):
        if s.capability not in seen:
            seen.add(s.capability)
            caps.append(s.capability)
    return caps


def _preview(content: str) -> str:
    flat = content.replace("\n", " ").strip()
    return flat[:_PREVIEW_LEN] + "…" if len(flat) > _PREVIEW_LEN else flat


def _print_capability_groups(sections: list[KnowledgeSection]) -> None:
    """Print sections grouped by capability."""
    cap_order: list[str] = []
    cap_map: dict[str, list[KnowledgeSection]] = {}
    for s in sections:
        if s.capability not in cap_map:
            cap_order.append(s.capability)
            cap_map[s.capability] = []
        cap_map[s.capability].append(s)

    for cap in cap_order:
        print(f"  {cap}")
        for s in cap_map[cap]:
            print(f"    [{s.source:<10}]  {s.section}  (score={s.score:.4f}  id={s.chunk_id})")
            print(f"    {_preview(s.content)}")
            print()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _build_default_dir() -> Path:
    return _HERE / "automotive" / "enterprise_ai" / "AI_Strategy"


def main() -> None:
    import argparse

    _PROVIDERS = ["openai", "huggingface", "ollama"]

    parser = argparse.ArgumentParser(
        description="SoorgaAI Context Builder — prepare hybrid retrieval for Claude",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--provider",    choices=_PROVIDERS, required=True,
                        help="Embedding provider")
    parser.add_argument("--model",       default=None,
                        help="Embedding model override")
    parser.add_argument("--query", "-q", default=None,
                        help="Query string (omit for interactive REPL)")
    parser.add_argument("--top-k", "-k", type=int, default=5,
                        help="Semantic arm: number of results")
    parser.add_argument("--threshold",   type=float, default=0.0,
                        help="Min similarity score for semantic-only chunks (0.0 = keep all)")
    parser.add_argument("--persist-dir", default=_DEFAULT_PERSIST,
                        help="Chroma persistence directory")
    parser.add_argument("--collection",  default=_DEFAULT_COLLECTION,
                        help="Chroma collection name")
    parser.add_argument("--directory",   default=str(_build_default_dir()),
                        help="Knowledge base directory for the CapabilityIndex")
    parser.add_argument("--no-intent-debug", action="store_true",
                        help="Suppress the SoorgaAI Conversation Analysis debug block")
    parser.add_argument("--no-plan-debug", action="store_true",
                        help="Suppress the SoorgaAI Reasoning Planner debug block")
    args = parser.parse_args()

    print(f"Loading capability index from: {args.directory}")
    docs      = MarkdownLoader(args.directory).load()
    cap_index = CapabilityIndex(docs)
    print(f"  {len(docs)} documents  |  {len(cap_index.get_capabilities())} capabilities")
    print()

    print(f"Initialising embeddings: {args.provider}")
    embeddings = create_embeddings(args.provider, args.model)

    engine  = ChromaHybridRetrieval(
        documents       = docs,
        embeddings      = embeddings,
        persist_dir     = args.persist_dir,
        collection_name = args.collection,
    )
    builder = DefaultContextBuilder(similarity_threshold=args.threshold)

    print(f"Collection '{args.collection}' — {engine.count()} chunks indexed")
    print()

    def _run_query(query: str) -> None:
        # Intent detection runs BEFORE hybrid retrieval (Sprint 20A).
        intent  = detect_intent(query, debug=not args.no_intent_debug)
        result  = engine.retrieve(query, top_k=args.top_k)
        # The reasoning plan (Sprint 20B) is derived inside build() once the
        # primary capability/layer are known.
        package = builder.build(result, intent=intent)
        if package.reasoning_plan is not None and not args.no_plan_debug:
            print_plan(query, package.reasoning_plan)
        builder.print_package(package)

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
