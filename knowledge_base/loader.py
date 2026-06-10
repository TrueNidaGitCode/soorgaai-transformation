"""
SoorgaAI — Markdown Knowledge Loader

Recursively scans a Markdown knowledge base directory and loads documents
into typed objects with inferred metadata, categorised by subfolder.

Usage (CLI):
    py knowledge_base/loader.py                          # default: AI_Strategy/
    py knowledge_base/loader.py path/to/any/kb/dir
    py knowledge_base/loader.py --metadata               # include per-document metadata
    py knowledge_base/loader.py --catalog                # print knowledge catalog
    py knowledge_base/loader.py --index                  # print capability index
    py knowledge_base/loader.py --query "AI Initiative Leadership"
    py knowledge_base/loader.py --query "Automotive AI Initiative Leadership"

Usage (module):
    from knowledge_base.loader import MarkdownLoader
    docs = MarkdownLoader("knowledge_base/automotive/enterprise_ai/AI_Strategy").load()
"""

from __future__ import annotations

import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Document:
    """A single Markdown knowledge document with inferred metadata."""

    # Core fields
    file_name: str          # e.g. "Automotive_AI_Initiative_Leadership.md"
    relative_path: str      # relative to the loader's base_dir
    category: str           # "Core" | "Automotive" | "Templates" | "Root"
    content: str            # raw Markdown text

    # Metadata — inferred from folder structure and filename
    title: str = field(default="")       # "Automotive AI Initiative Leadership"
    layer: str = field(default="")       # "Automotive"  (mirrors category)
    capability: str = field(default="")  # "AI Initiative Leadership"


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

class MarkdownLoader:
    """
    Recursively loads .md files from a base directory.

    Parameters
    ----------
    base_dir:
        Root directory to scan (e.g. .../AI_Strategy/).
    categories:
        Subfolder names recognised as categories.
        Defaults to Core, Automotive, Templates.
        Files not inside a recognised subfolder are labelled "Root".
    """

    DEFAULT_CATEGORIES: tuple[str, ...] = ("Core", "Automotive", "Templates")

    def __init__(
        self,
        base_dir: str | Path,
        categories: list[str] | None = None,
    ) -> None:
        self.base_dir = Path(base_dir).resolve()
        self.categories = set(categories or self.DEFAULT_CATEGORIES)

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def load(self) -> list[Document]:
        """Scan base_dir recursively and return a sorted list of Documents."""
        if not self.base_dir.exists():
            raise FileNotFoundError(f"Base directory not found: {self.base_dir}")
        if not self.base_dir.is_dir():
            raise NotADirectoryError(f"Not a directory: {self.base_dir}")

        documents: list[Document] = []

        for md_file in sorted(self.base_dir.rglob("*.md")):
            if _is_hidden(md_file):
                continue

            try:
                content = md_file.read_text(encoding="utf-8")
            except OSError as exc:
                print(f"[WARN] Could not read {md_file}: {exc}", file=sys.stderr)
                continue

            rel_path  = md_file.relative_to(self.base_dir)
            category  = self._resolve_category(rel_path)
            title     = _extract_title(md_file.name)
            layer     = category
            capability = _extract_capability(title, layer)

            documents.append(
                Document(
                    file_name=md_file.name,
                    relative_path=str(rel_path),
                    category=category,
                    content=content,
                    title=title,
                    layer=layer,
                    capability=capability,
                )
            )

        return documents

    @staticmethod
    def print_summary(documents: list[Document]) -> None:
        """Print a compact overview: document list, category counts, total."""
        if not documents:
            print("No documents loaded.")
            return

        print("Loaded Documents:")
        for doc in documents:
            print(f"  [{doc.category:<12}] {doc.relative_path}")

        counts = Counter(doc.category for doc in documents)
        print("\nCategory Counts:")
        for category, count in sorted(counts.items()):
            print(f"  {category:<12}: {count}")

        print(f"\nTotal Documents: {len(documents)}")

    @staticmethod
    def print_metadata_summary(documents: list[Document]) -> None:
        """Print per-document metadata inferred from folder structure and filename."""
        if not documents:
            print("No documents loaded.")
            return

        _DIVIDER = "  " + "-" * 50

        print("Document Metadata:")
        for doc in documents:
            print(_DIVIDER)
            print(f"  {doc.file_name}")
            print(f"    title      : {doc.title}")
            print(f"    category   : {doc.category}")
            print(f"    layer      : {doc.layer}")
            print(f"    capability : {doc.capability}")
            print(f"    path       : {doc.relative_path}")

        print(_DIVIDER)
        print(f"\nTotal Documents: {len(documents)}")

    @staticmethod
    def print_catalog(
        documents: list[Document],
        title: str = "SOORGAAI KNOWLEDGE CATALOG",
        layer_order: list[str] | None = None,
        capability_layers: set[str] | None = None,
    ) -> None:
        """
        Print a structured knowledge catalog grouped by layer.

        Parameters
        ----------
        documents:
            Documents returned by load().
        title:
            Catalog heading.
        layer_order:
            Display order for layers. Defaults to Core → Automotive → Templates.
        capability_layers:
            Layers that show a "Capabilities:" sub-heading.
            Defaults to {"Core", "Automotive"}.
        """
        if not documents:
            print("No documents loaded.")
            return

        _layer_order   = layer_order       or ["Core", "Automotive", "Templates"]
        _cap_layers    = capability_layers or {"Core", "Automotive"}
        _SEPARATOR     = "-" * 16

        # Group by layer, preserving load order; skip Root (infrastructure docs)
        groups: dict[str, list[Document]] = {}
        for doc in documents:
            if doc.layer != "Root":
                groups.setdefault(doc.layer, []).append(doc)

        available = [layer for layer in _layer_order if layer in groups]

        print(title)

        for i, layer in enumerate(available):
            print()
            print(layer)
            print()

            if layer in _cap_layers:
                print("Capabilities:")
                print()

            for doc in groups[layer]:
                print(doc.capability)
                print()

            if i < len(available) - 1:
                print(_SEPARATOR)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _resolve_category(self, rel_path: Path) -> str:
        """Return the category for a path relative to base_dir."""
        for part in rel_path.parts[:-1]:   # exclude the filename itself
            if part in self.categories:
                return part
        return "Root"


# ---------------------------------------------------------------------------
# Capability Index
# ---------------------------------------------------------------------------

class CapabilityIndex:
    """
    Query index built from a list of Documents, grouped by capability name.

    Excludes Root-layer documents (infrastructure files such as README).

    Example
    -------
    index = CapabilityIndex(docs)
    index.get_capabilities()                         # sorted list of names
    index.find_capability("AI Initiative Leadership") # documents for that cap
    index.get_capability_layers("AI Initiative Leadership")  # ["Core", "Automotive"]
    index.print_summary()
    """

    LAYER_ORDER: tuple[str, ...] = ("Core", "Automotive", "Templates")

    def __init__(self, documents: list[Document]) -> None:
        # capability name -> list of documents that provide it
        self._index: dict[str, list[Document]] = {}
        for doc in documents:
            if doc.layer != "Root":
                self._index.setdefault(doc.capability, []).append(doc)

    # ------------------------------------------------------------------
    # Query API
    # ------------------------------------------------------------------

    def get_capabilities(self) -> list[str]:
        """Return a sorted list of unique capability names."""
        return sorted(self._index)

    def find_capability(self, name: str) -> list[Document]:
        """
        Return all documents that provide the named capability.
        Returns an empty list if the capability is not found.
        """
        return list(self._index.get(name, []))

    def get_capability_layers(self, name: str) -> list[str]:
        """
        Return the layers that contain the named capability, in layer order.
        Returns an empty list if the capability is not found.
        """
        available = {doc.layer for doc in self._index.get(name, [])}
        return [layer for layer in self.LAYER_ORDER if layer in available]

    # ------------------------------------------------------------------
    # Query API
    # ------------------------------------------------------------------

    def query(self, text: str) -> list[Document]:
        """
        Return documents matching the query text.

        The query may optionally start with a layer name to narrow results.

        Examples
        --------
        index.query("AI Initiative Leadership")              # all layers
        index.query("Automotive AI Initiative Leadership")   # Automotive only
        index.query("Governance")                            # substring match
        """
        layer_filter, cap_query = self._parse_query(text)
        return self._match_documents(cap_query, layer_filter)

    def print_query_result(self, text: str) -> None:
        """
        Query the index and print the matched capability with its layers.

        Output includes:
        - The original query
        - Detected layer filter (if any)
        - Each matched capability and which layers contain it
        - The matching document paths
        """
        layer_filter, cap_query = self._parse_query(text)
        docs = self._match_documents(cap_query, layer_filter)

        print(f"Query:  {text.strip()}")

        if layer_filter:
            print(f"Layer:  {layer_filter}")

        if not docs:
            print()
            print("  No matching capability found.")
            return

        # Group results by capability (a substring query may match several)
        matched_caps: dict[str, list[Document]] = {}
        for doc in docs:
            matched_caps.setdefault(doc.capability, []).append(doc)

        for cap, cap_docs in matched_caps.items():
            layers = [l for l in self.LAYER_ORDER if any(d.layer == l for d in cap_docs)]
            print()
            print(f"  Capability : {cap}")
            print(f"  Layers     : {', '.join(layers)}")
            print()
            for doc in cap_docs:
                print(f"    [{doc.layer:<12}] {doc.relative_path}")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _parse_query(self, text: str) -> tuple[str, str]:
        """
        Detect an optional layer prefix in the query text.

        Returns (layer_filter, capability_query).
        layer_filter is an empty string when no layer is detected.

        Example: "Automotive AI Initiative Leadership"
                 → ("Automotive", "AI Initiative Leadership")
        """
        stripped = text.strip()
        for layer in self.LAYER_ORDER:
            prefix = layer + " "
            if stripped.lower().startswith(prefix.lower()):
                return layer, stripped[len(prefix):].strip()
        return "", stripped

    def _match_documents(self, cap_query: str, layer_filter: str) -> list[Document]:
        """
        Return documents whose capability matches cap_query, filtered by layer.

        Matching strategy:
        1. Case-insensitive exact match — tried first.
        2. Case-insensitive substring match — used as fallback.
        """
        query_lower = cap_query.lower()

        # Exact match (case-insensitive)
        for cap, docs in self._index.items():
            if cap.lower() == query_lower:
                if layer_filter:
                    return [d for d in docs if d.layer == layer_filter]
                return list(docs)

        # Substring match (case-insensitive)
        matched: list[Document] = []
        for cap, docs in self._index.items():
            if query_lower in cap.lower():
                if layer_filter:
                    matched.extend(d for d in docs if d.layer == layer_filter)
                else:
                    matched.extend(docs)

        return matched

    # ------------------------------------------------------------------
    # Display
    # ------------------------------------------------------------------

    def print_summary(self) -> None:
        """Print the capability index: each capability with its available layers."""
        capabilities = self.get_capabilities()

        if not capabilities:
            print("No capabilities indexed.")
            return

        print("CAPABILITY INDEX")
        print()
        print(f"Capabilities: {len(capabilities)}")

        for cap in capabilities:
            layers = self.get_capability_layers(cap)
            print()
            print(cap)
            print(f"  Layers: {', '.join(layers)}")


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _is_hidden(path: Path) -> bool:
    """Return True if any path component starts with '.'."""
    return any(part.startswith(".") for part in path.parts)


def _extract_title(file_name: str) -> str:
    """
    Convert a filename into a human-readable title.

    Example: "Automotive_AI_Initiative_Leadership.md" -> "Automotive AI Initiative Leadership"
    """
    return Path(file_name).stem.replace("_", " ")


def _extract_capability(title: str, layer: str) -> str:
    """
    Strip the layer prefix from a title to isolate the core capability name.

    Example: title="Automotive AI Initiative Leadership", layer="Automotive"
             -> "AI Initiative Leadership"

    If the title does not start with the layer name, the full title is returned.
    """
    prefix = f"{layer} "
    if layer and title.startswith(prefix):
        return title[len(prefix):]
    return title


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _build_default_dir() -> Path:
    return (
        Path(__file__).parent
        / "automotive"
        / "enterprise_ai"
        / "AI_Strategy"
    )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="SoorgaAI Markdown Knowledge Loader",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=str(_build_default_dir()),
        help="Directory to scan",
    )
    parser.add_argument(
        "--metadata",
        action="store_true",
        help="Print per-document metadata in addition to the summary",
    )
    parser.add_argument(
        "--catalog",
        action="store_true",
        help="Print a structured knowledge catalog grouped by layer",
    )
    parser.add_argument(
        "--index",
        action="store_true",
        help="Print the capability index with available layers per capability",
    )
    parser.add_argument(
        "--query",
        metavar="TEXT",
        help=(
            'Query the capability index. Optionally prefix with a layer name. '
            'Examples: "AI Initiative Leadership", '
            '"Automotive AI Initiative Leadership", "Governance"'
        ),
    )
    args = parser.parse_args()

    loader = MarkdownLoader(args.directory)
    docs   = loader.load()

    if args.query:
        CapabilityIndex(docs).print_query_result(args.query)
    elif args.catalog:
        MarkdownLoader.print_catalog(docs)
    elif args.index:
        CapabilityIndex(docs).print_summary()
    else:
        MarkdownLoader.print_summary(docs)

    if args.metadata:
        print()
        MarkdownLoader.print_metadata_summary(docs)


if __name__ == "__main__":
    main()
