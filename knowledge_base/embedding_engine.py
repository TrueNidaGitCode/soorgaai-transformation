"""
SoorgaAI — Embedding Engine

Wraps LangChain embeddings to generate one dense vector per knowledge chunk.
Preserves chunk metadata for downstream retrieval (e.g. vector store, RAG).

Usage:
    py knowledge_base/embedding_engine.py --provider openai
    py knowledge_base/embedding_engine.py --provider huggingface
    py knowledge_base/embedding_engine.py --provider huggingface --model all-MiniLM-L6-v2
    py knowledge_base/embedding_engine.py --provider ollama --model nomic-embed-text

Install the relevant package for your provider:
    pip install langchain-openai                                # OpenAI
    pip install langchain-community sentence-transformers       # HuggingFace (local)
    pip install langchain-community                            # Ollama (requires Ollama server)

Usage (module):
    from knowledge_base.embedding_engine import EmbeddingEngine, create_embeddings
    from langchain_openai import OpenAIEmbeddings

    engine   = EmbeddingEngine(OpenAIEmbeddings(model="text-embedding-3-small"))
    embedded = engine.embed(chunks)
    engine.print_summary(embedded)
"""

from __future__ import annotations

import hashlib
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Support both `py knowledge_base/embedding_engine.py` (script) and
# `from knowledge_base.embedding_engine import ...` (module import).
_HERE = Path(__file__).parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from knowledge_base.loader import Chunk, ChunkEngine, MarkdownLoader


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class EmbeddedChunk:
    """A knowledge chunk with its embedding vector and preserved metadata."""

    chunk_id:   str               # 16-char SHA-256 of path + section
    document:   str               # document_title from Chunk
    layer:      str               # "Core" | "Automotive" | "Templates"
    capability: str               # e.g. "AI Initiative Leadership"
    section:    str               # section_title from Chunk
    path:       str               # relative_path from Chunk
    content:    str               # original chunk text
    embedding:  list[float] = field(default_factory=list)  # dense vector


# ---------------------------------------------------------------------------
# Embedding Engine
# ---------------------------------------------------------------------------

class EmbeddingEngine:
    """
    Generates LangChain embeddings for a list of Chunks.

    Provider-agnostic: pass any LangChain-compatible Embeddings object.
    The engine delegates all batching and retry logic to the provider.

    Parameters
    ----------
    embeddings:
        Any object that implements embed_documents(texts: list[str]) -> list[list[float]].
        Standard LangChain Embeddings instances satisfy this interface.
    """

    def __init__(self, embeddings) -> None:
        self._embeddings = embeddings

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def embed(self, chunks: list[Chunk]) -> list[EmbeddedChunk]:
        """
        Generate one embedding per chunk.

        All chunk texts are passed to embed_documents() in a single call so the
        provider can batch API requests internally.

        Returns
        -------
        list[EmbeddedChunk] in the same order as the input chunks.
        """
        if not chunks:
            return []

        texts   = [chunk.content for chunk in chunks]
        vectors = self._embeddings.embed_documents(texts)

        return [
            EmbeddedChunk(
                chunk_id   = _make_chunk_id(chunk),
                document   = chunk.document_title,
                layer      = chunk.layer,
                capability = chunk.capability,
                section    = chunk.section_title,
                path       = chunk.relative_path,
                content    = chunk.content,
                embedding  = vector,
            )
            for chunk, vector in zip(chunks, vectors)
        ]

    def print_summary(self, embedded: list[EmbeddedChunk]) -> None:
        """Print engine statistics and a sample chunk with embedding preview."""
        if not embedded:
            print("No embedded chunks.")
            return

        sample = embedded[0]
        dim    = len(sample.embedding)

        print(f"Total Chunks:        {len(embedded)}")
        print(f"Embedding Model:     {self._model_name()}")
        print(f"Embedding Dimension: {dim}")
        print()
        print("Sample Chunk:")
        print(f"  chunk_id   : {sample.chunk_id}")
        print(f"  document   : {sample.document}")
        print(f"  layer      : {sample.layer}")
        print(f"  capability : {sample.capability}")
        print(f"  section    : {sample.section}")
        print(f"  path       : {sample.path}")
        if sample.embedding:
            preview = ", ".join(f"{v:.6f}" for v in sample.embedding[:4])
            print(f"  embedding  : [{preview}, ...] ({dim}d)")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _model_name(self) -> str:
        """Extract model name from the wrapped embeddings object."""
        for attr in ("model", "model_name", "model_id"):
            if hasattr(self._embeddings, attr):
                return str(getattr(self._embeddings, attr))
        return type(self._embeddings).__name__


# ---------------------------------------------------------------------------
# Provider factory
# ---------------------------------------------------------------------------

# (module_path, class_name, install_hint, model_kwarg)
_PROVIDERS: dict[str, tuple[str, str, str, str]] = {
    "openai": (
        "langchain_openai",
        "OpenAIEmbeddings",
        "pip install langchain-openai",
        "model",
    ),
    "huggingface": (
        "langchain_community.embeddings",
        "HuggingFaceEmbeddings",
        "pip install langchain-community sentence-transformers",
        "model_name",
    ),
    "ollama": (
        "langchain_community.embeddings",
        "OllamaEmbeddings",
        "pip install langchain-community",
        "model",
    ),
}

_DEFAULT_MODELS: dict[str, str] = {
    "openai":      "text-embedding-3-small",
    "huggingface": "all-MiniLM-L6-v2",
    "ollama":      "nomic-embed-text",
}


def create_embeddings(provider: str, model: str | None = None):
    """
    Factory for LangChain Embeddings instances.

    Parameters
    ----------
    provider : str
        "openai" | "huggingface" | "ollama"
    model : str | None
        Model name. Uses the provider default when omitted.

    Returns
    -------
    A LangChain Embeddings instance ready for embed_documents().
    """
    if provider not in _PROVIDERS:
        valid = ", ".join(_PROVIDERS)
        raise ValueError(f"Unknown provider '{provider}'. Choose: {valid}")

    module_path, class_name, install_hint, model_kwarg = _PROVIDERS[provider]
    chosen_model = model or _DEFAULT_MODELS[provider]

    try:
        import importlib
        module = importlib.import_module(module_path)
        cls    = getattr(module, class_name)
    except ImportError as exc:
        raise ImportError(
            f"Provider '{provider}' requires additional packages.\n"
            f"  {install_hint}"
        ) from exc

    return cls(**{model_kwarg: chosen_model})


# ---------------------------------------------------------------------------
# Module-level helper
# ---------------------------------------------------------------------------

def _make_chunk_id(chunk: Chunk) -> str:
    """Return a 16-char reproducible ID derived from path and section title."""
    key = f"{chunk.relative_path}::{chunk.section_title}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _build_default_dir() -> Path:
    return _HERE / "automotive" / "enterprise_ai" / "AI_Strategy"


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="SoorgaAI Embedding Engine",
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
        choices=list(_PROVIDERS),
        required=True,
        help="Embedding provider",
    )
    parser.add_argument(
        "--model",
        default=None,
        help=(
            "Model name override. Defaults: "
            + " | ".join(f"{k}={v}" for k, v in _DEFAULT_MODELS.items())
        ),
    )
    args = parser.parse_args()

    print(f"Loading documents from: {args.directory}")
    docs   = MarkdownLoader(args.directory).load()
    chunks = ChunkEngine(docs).chunk()
    print(f"Documents loaded: {len(docs)}")
    print(f"Chunks generated: {len(chunks)}")
    print()

    print(f"Initialising provider: {args.provider}")
    embeddings_obj = create_embeddings(args.provider, args.model)
    engine         = EmbeddingEngine(embeddings_obj)

    print("Embedding chunks...")
    embedded = engine.embed(chunks)
    print()

    engine.print_summary(embedded)


if __name__ == "__main__":
    main()
