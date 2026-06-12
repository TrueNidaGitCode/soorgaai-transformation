"""
SoorgaAI — Hybrid Retrieval Engine

Combines structured capability retrieval (CapabilityIndex) with semantic vector
retrieval (ChromaSemanticSearch), merges the two result sets, removes duplicates,
re-ranks by score, and returns merged context ready for future LLM integration.

Retrieval pipeline
──────────────────
  1. Structured arm  — detects capability + optional layer from the query text
                       via CapabilityIndex, then fetches all matching chunks from
                       Chroma using metadata filters.
  2. Semantic arm    — generates a query embedding and returns the top-k nearest
                       neighbours from Chroma by cosine similarity.
  3. Merge           — deduplicates by chunk_id; chunks appearing in both arms
                       are tagged "both" and receive a score boost.
  4. Rank            — final list sorted by score descending.

Usage:
    py knowledge_base/hybrid_retrieval.py --provider openai --query "AI governance framework"
    py knowledge_base/hybrid_retrieval.py --provider huggingface --query "predictive maintenance" --top-k 8
    py knowledge_base/hybrid_retrieval.py --provider openai   # interactive REPL

Install:
    pip install chromadb langchain-openai
    # or for HuggingFace:
    pip install chromadb langchain-community sentence-transformers

Note: Run vector_store.py first to populate the Chroma collection.

Usage (module):
    from knowledge_base.hybrid_retrieval import ChromaHybridRetrieval
    from knowledge_base.embedding_engine import create_embeddings
    from knowledge_base.loader import MarkdownLoader

    docs       = MarkdownLoader("knowledge_base/automotive/...").load()
    embeddings = create_embeddings("openai")
    engine     = ChromaHybridRetrieval(docs, embeddings)
    result     = engine.retrieve("AI governance framework", top_k=5)
    engine.print_results(result)
"""

from __future__ import annotations

import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

_HERE = Path(__file__).parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.embedding_engine import create_embeddings
from knowledge_base.loader import CapabilityIndex, Document, MarkdownLoader
from knowledge_base.semantic_search import ChromaSemanticSearch
from knowledge_base.vector_store import _DEFAULT_COLLECTION, _DEFAULT_PERSIST

_PREVIEW_LENGTH   = 200
_STRUCTURED_SCORE = 0.90   # fixed confidence for exact capability matches
_BOTH_BOOST       = 0.10   # bonus when a chunk appears in both arms


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class HybridResult:
    """One ranked entry in a hybrid retrieval response."""
    rank:       int
    chunk_id:   str
    document:   str
    layer:      str
    capability: str
    section:    str
    path:       str
    content:    str
    score:      float
    source:     str   # "structured" | "semantic" | "both"


@dataclass
class HybridRetrievalResult:
    """Full output of a single hybrid retrieval call."""
    query:      str
    structured: list[HybridResult]   # from capability detection
    semantic:   list[HybridResult]   # from vector similarity
    merged:     list[HybridResult]   # deduplicated, re-ranked union


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class HybridRetrieval(ABC):
    """
    Abstract interface for hybrid structured + semantic retrieval.

    Subclass to swap the underlying vector store or capability detection
    strategy. print_results() has a default that satisfies all display
    requirements and may be overridden.
    """

    @abstractmethod
    def retrieve(self, query: str, top_k: int = 5) -> HybridRetrievalResult:
        """Run hybrid retrieval and return the full result."""

    def print_results(self, result: HybridRetrievalResult) -> None:
        """Print structured, semantic, and merged sections to stdout."""
        print(f"Query: {result.query!r}")
        print()
        _print_section("Structured Results", result.structured, show_score=False)
        _print_section("Semantic Results",   result.semantic,   show_score=True)
        _print_section("Merged Results",     result.merged,     show_score=True, show_source=True)


# ---------------------------------------------------------------------------
# Chroma implementation
# ---------------------------------------------------------------------------

class ChromaHybridRetrieval(HybridRetrieval):
    """
    Hybrid retrieval engine backed by Chroma and CapabilityIndex.

    Parameters
    ----------
    documents:
        Documents from MarkdownLoader — used to build CapabilityIndex.
    embeddings:
        Any LangChain-compatible Embeddings object (must implement embed_query).
    persist_dir:
        Chroma directory — must match the one used by ChromaVectorStore.
    collection_name:
        Chroma collection name — must match the one used by ChromaVectorStore.
    structured_limit:
        Cap on chunks returned by the structured arm (per capability match).
    """

    def __init__(
        self,
        documents:        list[Document],
        embeddings,
        persist_dir:      str | Path = _DEFAULT_PERSIST,
        collection_name:  str        = _DEFAULT_COLLECTION,
        structured_limit: int        = 20,
    ) -> None:
        try:
            import chromadb
        except ImportError:
            raise ImportError("Chroma is not installed.\n  Run: pip install chromadb")

        self._index            = CapabilityIndex(documents)
        self._semantic         = ChromaSemanticSearch(embeddings, persist_dir, collection_name)
        self._structured_limit = structured_limit

        # Direct collection reference for metadata-filtered structured queries
        persist_path     = Path(persist_dir).resolve()
        self._client     = chromadb.PersistentClient(path=str(persist_path))
        self._collection = self._client.get_or_create_collection(
            name     = collection_name,
            metadata = {"hnsw:space": "cosine"},
        )

    # ------------------------------------------------------------------
    # HybridRetrieval interface
    # ------------------------------------------------------------------

    def retrieve(self, query: str, top_k: int = 5) -> HybridRetrievalResult:
        """Run both arms, merge, and return the full result."""
        structured = self._structured_retrieve(query)
        semantic   = self._semantic_retrieve(query, top_k)
        merged     = self._merge(structured, semantic)
        return HybridRetrievalResult(
            query=query,
            structured=structured,
            semantic=semantic,
            merged=merged,
        )

    # ------------------------------------------------------------------
    # Private: structured arm
    # ------------------------------------------------------------------

    def _structured_retrieve(self, query: str) -> list[HybridResult]:
        """Detect capability/layer in query text, fetch matching Chroma chunks."""
        layer_filter, cap_query = self._index._parse_query(query)
        matched_docs            = self._index._match_documents(cap_query, layer_filter)

        if not matched_docs:
            return []

        results:    list[HybridResult]    = []
        seen_ids:   set[str]              = set()
        seen_pairs: set[tuple[str, str]]  = set()

        for doc in matched_docs:
            pair = (doc.capability, doc.layer)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)

            # Build Chroma where-filter
            if layer_filter:
                where: dict = {"$and": [
                    {"capability": {"$eq": doc.capability}},
                    {"layer":      {"$eq": doc.layer}},
                ]}
            else:
                where = {"capability": {"$eq": doc.capability}}

            raw = self._collection.get(
                where   = where,
                include = ["documents", "metadatas"],
            )

            for cid, content, meta in zip(
                raw["ids"][:self._structured_limit],
                raw["documents"][:self._structured_limit],
                raw["metadatas"][:self._structured_limit],
            ):
                if cid in seen_ids:
                    continue
                seen_ids.add(cid)
                results.append(HybridResult(
                    rank       = 0,
                    chunk_id   = cid,
                    document   = meta.get("document",   ""),
                    layer      = meta.get("layer",       ""),
                    capability = meta.get("capability",  ""),
                    section    = meta.get("section",     ""),
                    path       = meta.get("path",        ""),
                    content    = content,
                    score      = _STRUCTURED_SCORE,
                    source     = "structured",
                ))

        _assign_ranks(results)
        return results

    # ------------------------------------------------------------------
    # Private: semantic arm
    # ------------------------------------------------------------------

    def _semantic_retrieve(self, query: str, top_k: int) -> list[HybridResult]:
        """Embed query and return top-k Chroma results as HybridResult objects."""
        return [
            HybridResult(
                rank       = r.rank,
                chunk_id   = r.chunk_id,
                document   = r.document,
                layer      = r.layer,
                capability = r.capability,
                section    = r.section,
                path       = r.path,
                content    = r.content,
                score      = r.score,
                source     = "semantic",
            )
            for r in self._semantic.search(query, top_k)
        ]

    # ------------------------------------------------------------------
    # Private: merge & re-rank
    # ------------------------------------------------------------------

    def _merge(
        self,
        structured: list[HybridResult],
        semantic:   list[HybridResult],
    ) -> list[HybridResult]:
        """
        Union both arms, deduplicate by chunk_id, and rank by score.

        Chunks present in both arms are tagged "both" and receive a
        _BOTH_BOOST bonus on top of whichever arm scored them higher.
        """
        merged: dict[str, HybridResult] = {}

        for r in structured:
            merged[r.chunk_id] = r

        for r in semantic:
            if r.chunk_id in merged:
                existing      = merged[r.chunk_id]
                boosted_score = min(1.0, max(existing.score, r.score) + _BOTH_BOOST)
                merged[r.chunk_id] = HybridResult(
                    rank       = 0,
                    chunk_id   = existing.chunk_id,
                    document   = existing.document,
                    layer      = existing.layer,
                    capability = existing.capability,
                    section    = existing.section,
                    path       = existing.path,
                    content    = existing.content,
                    score      = boosted_score,
                    source     = "both",
                )
            else:
                merged[r.chunk_id] = r

        ranked = sorted(merged.values(), key=lambda r: r.score, reverse=True)
        _assign_ranks(ranked)
        return ranked

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    def count(self) -> int:
        """Return the number of chunks in the Chroma collection."""
        return self._semantic.count()


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

def _assign_ranks(results: list[HybridResult]) -> None:
    for i, r in enumerate(results, start=1):
        r.rank = i


def _preview(content: str) -> str:
    flat = content.replace("\n", " ").strip()
    return flat[:_PREVIEW_LENGTH] + "…" if len(flat) > _PREVIEW_LENGTH else flat


def _print_section(
    title:       str,
    results:     list[HybridResult],
    show_score:  bool = True,
    show_source: bool = False,
) -> None:
    header = f"{title} ({len(results)})"
    print(header)
    print("-" * len(header))

    if not results:
        print("  (none)")
        print()
        return

    for r in results:
        score_part  = f"  score={r.score:.4f}" if show_score  else ""
        source_part = f"  [{r.source}]"        if show_source else ""
        print(f"  [{r.rank}]{score_part}  chunk_id={r.chunk_id}{source_part}")
        print(f"       Document   : {r.document}")
        print(f"       Layer      : {r.layer}")
        print(f"       Capability : {r.capability}")
        print(f"       Section    : {r.section}")
        print(f"       Preview    : {_preview(r.content)}")
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
        description="SoorgaAI Hybrid Retrieval Engine — structured + semantic search",
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
    parser.add_argument("--persist-dir", default=_DEFAULT_PERSIST,
                        help="Chroma persistence directory")
    parser.add_argument("--collection",  default=_DEFAULT_COLLECTION,
                        help="Chroma collection name")
    parser.add_argument("--directory",   default=str(_build_default_dir()),
                        help="Knowledge base directory for the CapabilityIndex")
    args = parser.parse_args()

    print(f"Loading capability index from: {args.directory}")
    docs       = MarkdownLoader(args.directory).load()
    cap_index  = CapabilityIndex(docs)
    print(f"  {len(docs)} documents  |  {len(cap_index.get_capabilities())} capabilities")
    print()

    print(f"Initialising embeddings: {args.provider}")
    embeddings = create_embeddings(args.provider, args.model)

    engine = ChromaHybridRetrieval(
        documents       = docs,
        embeddings      = embeddings,
        persist_dir     = args.persist_dir,
        collection_name = args.collection,
    )
    print(f"Collection '{args.collection}' — {engine.count()} chunks indexed")
    print()

    if args.query:
        result = engine.retrieve(args.query, top_k=args.top_k)
        engine.print_results(result)
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
            result = engine.retrieve(query, top_k=args.top_k)
            engine.print_results(result)
            print()


if __name__ == "__main__":
    main()
