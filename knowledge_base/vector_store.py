"""
SoorgaAI — Vector Store

Persists EmbeddedChunk objects in a Chroma vector database.

VectorStore is an abstract interface — ChromaVectorStore is the default
implementation. Future backends (Pinecone, Weaviate, Qdrant, etc.) only
need to implement the four methods defined by the interface.

Usage:
    py knowledge_base/vector_store.py --provider openai
    py knowledge_base/vector_store.py --provider huggingface
    py knowledge_base/vector_store.py --provider huggingface --persist-dir .chroma

Install:
    pip install chromadb langchain-openai
    # or for HuggingFace:
    pip install chromadb langchain-community sentence-transformers

Note: add .chroma/ to .gitignore — vector store data should not be committed.

Usage (module):
    from knowledge_base.vector_store import ChromaVectorStore
    store = ChromaVectorStore(persist_dir=".chroma")
    store.add_chunks(embedded_chunks)
    store.print_summary()
    chunk = store.get_chunk("25c4649e381b1f11")
"""

from __future__ import annotations

import sys
from abc import ABC, abstractmethod
from pathlib import Path

# Support both script and module import
_HERE = Path(__file__).parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.embedding_engine import EmbeddedChunk, EmbeddingEngine, create_embeddings
from knowledge_base.loader import ChunkEngine, MarkdownLoader


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class VectorStore(ABC):
    """
    Abstract interface for persisting and retrieving embedded knowledge chunks.

    Implementations must provide four operations:
    - add_chunks   : upsert EmbeddedChunk objects
    - get_chunk    : retrieve one chunk by ID
    - count        : total stored chunks
    - persist      : flush pending writes (may be a no-op for auto-persisting backends)

    To replace Chroma with a different backend, subclass VectorStore and
    implement these four methods. The rest of the pipeline is backend-agnostic.
    """

    @abstractmethod
    def add_chunks(self, chunks: list[EmbeddedChunk]) -> None:
        """Upsert embedded chunks — safe to call multiple times."""

    @abstractmethod
    def get_chunk(self, chunk_id: str) -> EmbeddedChunk | None:
        """Return the EmbeddedChunk for chunk_id, or None if not found."""

    @abstractmethod
    def count(self) -> int:
        """Return the total number of chunks in the store."""

    @abstractmethod
    def persist(self) -> None:
        """Flush any pending writes to durable storage."""

    @abstractmethod
    def print_summary(self) -> None:
        """Print a human-readable summary of the store state."""


# ---------------------------------------------------------------------------
# Chroma implementation
# ---------------------------------------------------------------------------

_DEFAULT_COLLECTION = "soorgaai_knowledge"
_DEFAULT_PERSIST    = str(_HERE / ".chroma")


class ChromaVectorStore(VectorStore):
    """
    Chroma-backed VectorStore using chromadb >= 0.4.0.

    PersistentClient writes are automatically durable after each upsert,
    so persist() is a no-op kept for interface compatibility.

    Parameters
    ----------
    persist_dir:
        Directory for Chroma's on-disk index (created if absent).
    collection_name:
        Name of the Chroma collection.
    """

    def __init__(
        self,
        persist_dir:     str | Path = _DEFAULT_PERSIST,
        collection_name: str        = _DEFAULT_COLLECTION,
    ) -> None:
        try:
            import chromadb
        except ImportError:
            raise ImportError(
                "Chroma is not installed.\n  Run: pip install chromadb"
            )

        self._persist_dir     = Path(persist_dir).resolve()
        self._collection_name = collection_name
        self._persist_dir.mkdir(parents=True, exist_ok=True)

        self._client     = chromadb.PersistentClient(path=str(self._persist_dir))
        self._collection = self._client.get_or_create_collection(
            name     = collection_name,
            metadata = {"hnsw:space": "cosine"},
        )

    # ------------------------------------------------------------------
    # VectorStore interface
    # ------------------------------------------------------------------

    def add_chunks(self, chunks: list[EmbeddedChunk]) -> None:
        """Upsert EmbeddedChunks — re-entrant and idempotent."""
        if not chunks:
            return

        # Chroma 1.5+ rejects duplicate IDs within a single batch.
        # Keep the first occurrence of each chunk_id before upserting.
        seen: set[str] = set()
        unique: list[EmbeddedChunk] = []
        for c in chunks:
            if c.chunk_id not in seen:
                seen.add(c.chunk_id)
                unique.append(c)
        chunks = unique

        self._collection.upsert(
            ids        = [c.chunk_id for c in chunks],
            embeddings = [c.embedding for c in chunks],
            documents  = [c.content  for c in chunks],
            metadatas  = [
                {
                    "document":   c.document,
                    "layer":      c.layer,
                    "capability": c.capability,
                    "section":    c.section,
                    "path":       c.path,
                }
                for c in chunks
            ],
        )

    def get_chunk(self, chunk_id: str) -> EmbeddedChunk | None:
        """Return the EmbeddedChunk matching chunk_id, or None."""
        result = self._collection.get(
            ids     = [chunk_id],
            include = ["embeddings", "documents", "metadatas"],
        )

        if not result["ids"]:
            return None

        meta = result["metadatas"][0]
        raw  = result["embeddings"][0]

        return EmbeddedChunk(
            chunk_id   = result["ids"][0],
            document   = meta["document"],
            layer      = meta["layer"],
            capability = meta["capability"],
            section    = meta["section"],
            path       = meta["path"],
            content    = result["documents"][0],
            embedding  = [float(v) for v in raw] if raw is not None else [],
        )

    def count(self) -> int:
        """Return the number of chunks in the collection."""
        return self._collection.count()

    def persist(self) -> None:
        """No-op: PersistentClient writes are automatically durable."""

    def print_summary(self) -> None:
        """Print vector store statistics."""
        stored = self.count()
        ids    = self._collection.get(include=[], limit=1)["ids"]
        sample = ids[0] if ids else "—"

        print("Vector Store Summary:")
        print()
        print(f"  Chunks Stored:        {stored}")
        print(f"  Collection Name:      {self._collection_name}")
        print(f"  Persistence Location: {self._persist_dir}")
        print(f"  Sample Chunk ID:      {sample}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _build_default_dir() -> Path:
    return _HERE / "automotive" / "enterprise_ai" / "AI_Strategy"


def main() -> None:
    import argparse

    _PROVIDERS = ["openai", "huggingface", "ollama"]

    parser = argparse.ArgumentParser(
        description="SoorgaAI Vector Store — load, embed, and persist knowledge chunks",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=str(_build_default_dir()),
        help="Knowledge base directory to scan",
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
        "--persist-dir",
        default=_DEFAULT_PERSIST,
        help="Directory for Chroma on-disk storage",
    )
    parser.add_argument(
        "--collection",
        default=_DEFAULT_COLLECTION,
        help="Chroma collection name",
    )
    args = parser.parse_args()

    # ── Pipeline ──────────────────────────────────────────────────────
    print(f"[1/4] Loading documents from: {args.directory}")
    docs   = MarkdownLoader(args.directory).load()
    chunks = ChunkEngine(docs).chunk()
    print(f"      Documents: {len(docs)}  |  Chunks: {len(chunks)}")
    print()

    print(f"[2/4] Embedding chunks with provider: {args.provider}")
    embeddings_obj = create_embeddings(args.provider, args.model)
    engine         = EmbeddingEngine(embeddings_obj)
    embedded       = engine.embed(chunks)
    dim = len(embedded[0].embedding) if embedded else 0
    print(f"      Embedded: {len(embedded)} chunks  |  Dimension: {dim}d")
    print()

    print(f"[3/4] Storing in Chroma: {args.persist_dir}")
    store = ChromaVectorStore(
        persist_dir     = args.persist_dir,
        collection_name = args.collection,
    )
    store.add_chunks(embedded)
    store.persist()
    print(f"      Collection '{args.collection}' — {store.count()} chunks stored")
    print()

    print("[4/4] Summary")
    store.print_summary()


if __name__ == "__main__":
    main()
