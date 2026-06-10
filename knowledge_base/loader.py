"""
SoorgaAI — Markdown Knowledge Loader

Recursively scans a Markdown knowledge base directory and loads documents
into typed objects, categorised by subfolder.

Usage (CLI):
    py knowledge_base/loader.py                          # default: AI_Strategy/
    py knowledge_base/loader.py path/to/any/kb/dir

Usage (module):
    from knowledge_base.loader import MarkdownLoader
    docs = MarkdownLoader("knowledge_base/automotive/enterprise_ai/AI_Strategy").load()
"""

from __future__ import annotations

import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Document:
    """A single Markdown knowledge document."""

    file_name: str       # e.g. "AI_Initiative_Leadership.md"
    relative_path: str   # relative to the loader's base_dir
    category: str        # "Core" | "Automotive" | "Templates" | "Root"
    content: str         # raw Markdown text


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

            rel_path = md_file.relative_to(self.base_dir)
            documents.append(
                Document(
                    file_name=md_file.name,
                    relative_path=str(rel_path),
                    category=self._resolve_category(rel_path),
                    content=content,
                )
            )

        return documents

    @staticmethod
    def print_summary(documents: list[Document]) -> None:
        """Print a human-readable summary of loaded documents."""
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
# Module-level helper
# ---------------------------------------------------------------------------

def _is_hidden(path: Path) -> bool:
    """Return True if any path component starts with '.'."""
    return any(part.startswith(".") for part in path.parts)


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
    args = parser.parse_args()

    loader = MarkdownLoader(args.directory)
    docs = loader.load()
    MarkdownLoader.print_summary(docs)


if __name__ == "__main__":
    main()
