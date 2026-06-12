"""
SoorgaAI — Semantic Search Engine

Retrieves semantically similar knowledge chunks from an existing Chroma collection.
Validates retrieval quality without any LLM integration.

Usage:
    py knowledge_base/semantic_search.py --provider openai --query "What is AI strategy?"
    py knowledge_base/semantic_search.py --provider huggingface --query "enterprise AI readiness" --top-k 10
    py knowledge_base/semantic_search.py --provider openai               # interactive REPL

Install:
    pip install chromadb langchain-openai
    # or for HuggingFace:
    pip install chromadb langchain-community sentence-transformers

Note: Run vector_store.py first to populate the Chroma collection.

Usage (module):
    from knowledge_base.semantic_search import ChromaSemanticSearch
    from knowledge_base.embedding_engine import create_embeddings

    embeddings = create_embeddings("openai")
    engine     = ChromaSemanticSearch(embeddings)
    results    = engine.search("AI governance framework", top_k=5)
    engine.print_results(results, "AI governance framework")
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
from knowledge_base.vector_store import _DEFAULT_COLLECTION, _DEFAULT_PERSIST

_PREVIEW_LENGTH = 220


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class SearchResult:
    """One ranked result returned by a semantic search query."""

    rank:       int
    chunk_id:   str
    document:   str
    layer:      str
    capability: str
    section:    str
    path:       str
    content:    str
    score:      float   # cosine similarity: 1.0 = identical, 0.0 = orthogonal


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class SemanticSearch(ABC):
    """
    Abstract interface for semantic chunk retrieval.

    Subclass this to swap the vector backend (Pinecone, Weaviate, Qdrant, …).
    Only search() must be implemented; print_results() has a default that
    satisfies all display requirements and can be overridden if needed.
    """

    @abstractmethod
    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Return top_k chunks ranked by semantic similarity to query."""

    def print_results(self, results: list[SearchResult], query: str) -> None:
        """Print ranked results to stdout."""
        if not results:
            print(f"No results found for: {query!r}")
            return

        print(f"Query  : {query!r}")
        print(f"Results: {len(results)}")
        print()

        for r in results:
            preview = r.content.replace("\n", " ").strip()
            if len(preview) > _PREVIEW_LENGTH:
                preview = preview[:_PREVIEW_LENGTH] + "…"

            print(f"  [{r.rank}]  score={r.score:.4f}   chunk_id={r.chunk_id}")
            print(f"       Document   : {r.document}")
            print(f"       Layer      : {r.layer}")
            print(f"       Capability : {r.capability}")
            print(f"       Section    : {r.section}")
            print(f"       Preview    : {preview}")
            print()


# ---------------------------------------------------------------------------
# Chroma implementation
# ---------------------------------------------------------------------------

class ChromaSemanticSearch(SemanticSearch):
    """
    Semantic search backed by an existing Chroma PersistentClient collection.

    Connects to the same persist_dir and collection_name used by ChromaVectorStore
    so no data migration is required — both classes share the same on-disk index.

    Parameters
    ----------
    embeddings:
        Any LangChain-compatible Embeddings object (must implement embed_query).
    persist_dir:
        Chroma directory — must match the one used when storing chunks.
    collection_name:
        Chroma collection name — must match the one used when storing chunks.
    """

    def __init__(
        self,
        embeddings,
        persist_dir:     str | Path = _DEFAULT_PERSIST,
        collection_name: str        = _DEFAULT_COLLECTION,
    ) -> None:
        try:
            import chromadb
        except ImportError:
            raise ImportError("Chroma is not installed.\n  Run: pip install chromadb")

        self._embeddings      = embeddings
        self._persist_dir     = Path(persist_dir).resolve()
        self._collection_name = collection_name

        self._client     = chromadb.PersistentClient(path=str(self._persist_dir))
        self._collection = self._client.get_or_create_collection(
            name     = collection_name,
            metadata = {"hnsw:space": "cosine"},
        )

    # ------------------------------------------------------------------
    # SemanticSearch interface
    # ------------------------------------------------------------------

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Embed query and return top_k closest chunks ranked by cosine similarity."""
        total = self._collection.count()
        if total == 0:
            return []

        n      = min(top_k, total)
        vector = self._embeddings.embed_query(query)

        raw = self._collection.query(
            query_embeddings = [vector],
            n_results        = n,
            include          = ["documents", "metadatas", "distances"],
        )

        results = []
        for rank, (cid, doc, meta, dist) in enumerate(
            zip(
                raw["ids"][0],
                raw["documents"][0],
                raw["metadatas"][0],
                raw["distances"][0],
            ),
            start=1,
        ):
            # Chroma cosine distance = 1 − cosine_similarity  (range 0 … 2)
            # → cosine_similarity = 1 − distance              (range −1 … 1)
            score = 1.0 - dist

            results.append(SearchResult(
                rank       = rank,
                chunk_id   = cid,
                document   = meta.get("document",   ""),
                layer      = meta.get("layer",       ""),
                capability = meta.get("capability",  ""),
                section    = meta.get("section",     ""),
                path       = meta.get("path",        ""),
                content    = doc,
                score      = score,
            ))

        return results

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    def count(self) -> int:
        """Return the number of chunks in the collection."""
        return self._collection.count()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    import argparse

    _PROVIDERS = ["openai", "huggingface", "ollama"]

    parser = argparse.ArgumentParser(
        description="SoorgaAI Semantic Search — query the knowledge base",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--provider",
        choices=_PROVIDERS,
        required=True,
        help="Embedding provider",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Embedding model override (uses provider default if omitted)",
    )
    parser.add_argument(
        "--query", "-q",
        default=None,
        help="Search query — omit to enter interactive mode",
    )
    parser.add_argument(
        "--top-k", "-k",
        type=int,
        default=5,
        help="Number of results to return",
    )
    parser.add_argument(
        "--persist-dir",
        default=_DEFAULT_PERSIST,
        help="Chroma persistence directory (must match vector_store.py)",
    )
    parser.add_argument(
        "--collection",
        default=_DEFAULT_COLLECTION,
        help="Chroma collection name (must match vector_store.py)",
    )
    args = parser.parse_args()

    print(f"Initialising embeddings: {args.provider}")
    embeddings = create_embeddings(args.provider, args.model)

    engine = ChromaSemanticSearch(
        embeddings      = embeddings,
        persist_dir     = args.persist_dir,
        collection_name = args.collection,
    )

    stored = engine.count()
    print(f"Collection '{args.collection}' — {stored} chunks indexed")
    print()

    if args.query:
        results = engine.search(args.query, top_k=args.top_k)
        engine.print_results(results, args.query)
    else:
        # Interactive REPL
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
            results = engine.search(query, top_k=args.top_k)
            engine.print_results(results, query)


if __name__ == "__main__":
    main()
