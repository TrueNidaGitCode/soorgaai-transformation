"""
Structural test for strategy_response_engine.py.
Tests build_prompt(), PromptPackage, StrategyResponse, and the context formatter
without making any Claude API calls.
"""
import sys, random, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from knowledge_base.embedding_engine import EmbeddedChunk
from knowledge_base.loader import Document
from knowledge_base.vector_store import ChromaVectorStore
from knowledge_base.hybrid_retrieval import ChromaHybridRetrieval
from knowledge_base.context_builder import DefaultContextBuilder, ContextPackage
from knowledge_base.strategy_response_engine import (
    ClaudeStrategyResponseEngine,
    StrategyResponseEngine,
    PromptPackage,
    StrategyResponse,
    _build_knowledge_context,
    _SYSTEM_PROMPT,
)

print("── Import check ────────────────────────────")
assert issubclass(ClaudeStrategyResponseEngine, StrategyResponseEngine)
print("  ClaudeStrategyResponseEngine is a StrategyResponseEngine ✓")

# ── Mock pipeline setup ───────────────────────────────────────────────────────
class MockEmbeddings:
    def _vec(self, text):
        random.seed(hash(text) & 0xFFFFFFFF)
        v = [random.gauss(0, 1) for _ in range(64)]
        n = sum(x * x for x in v) ** 0.5
        return [x / n for x in v]
    def embed_documents(self, texts): return [self._vec(t) for t in texts]
    def embed_query(self, text):      return self._vec(text)

documents = [
    Document("AI_Initiative_Leadership.md",            "Core/x.md",       "Core",       "", "AI Initiative Leadership",            "Core",       "AI Initiative Leadership"),
    Document("Automotive_AI_Initiative_Leadership.md", "Automotive/x.md", "Automotive", "", "Automotive AI Initiative Leadership", "Automotive", "AI Initiative Leadership"),
    Document("AI_Governance_Framework.md",             "Core/x.md",       "Core",       "", "AI Governance Framework",             "Core",       "AI Governance Framework"),
]

CHUNKS = [
    ("c_ail_c1", "AI Initiative Leadership",            "Core",       "AI Initiative Leadership", "Executive Alignment",
     "Leaders must champion AI initiatives with clear governance and ROI framing."),
    ("c_ail_c2", "AI Initiative Leadership",            "Core",       "AI Initiative Leadership", "Vision",
     "Define a north-star AI vision aligned to enterprise strategy and customer value."),
    ("c_ail_a1", "Automotive AI Initiative Leadership", "Automotive", "AI Initiative Leadership", "OEM Strategy",
     "Automotive OEMs must embed AI into product lines to remain competitive."),
    ("c_gov_1",  "AI Governance Framework",             "Core",       "AI Governance Framework",  "Compliance Standards",
     "Establish cross-functional AI review boards and model risk registers."),
]

mock_emb    = MockEmbeddings()
persist_dir = Path(tempfile.mkdtemp()) / ".chroma"
store       = ChromaVectorStore(persist_dir=persist_dir, collection_name="soorgaai_knowledge")
store.add_chunks([
    EmbeddedChunk(chunk_id=cid, document=doc, layer=layer, capability=cap,
                  section=sec, path=f"kb/{doc}.md", content=content,
                  embedding=mock_emb.embed_documents([content])[0])
    for cid, doc, layer, cap, sec, content in CHUNKS
])

hybrid_engine   = ChromaHybridRetrieval(documents=documents, embeddings=mock_emb,
                                        persist_dir=persist_dir, collection_name="soorgaai_knowledge")
context_builder = DefaultContextBuilder(similarity_threshold=0.0)

# ── Build a context package ───────────────────────────────────────────────────
result  = hybrid_engine.retrieve("AI Initiative Leadership", top_k=4)
package = context_builder.build(result)

print()
print("── build_prompt() ─────────────────────────")
engine = ClaudeStrategyResponseEngine(model="claude-opus-4-8", max_tokens=4096)
prompt = engine.build_prompt(package)

assert isinstance(prompt, PromptPackage)
assert prompt.system_prompt == _SYSTEM_PROMPT
assert len(prompt.knowledge_context) > 100, "knowledge context should be non-trivial"
assert prompt.query_text == package.query
assert prompt.model == "claude-opus-4-8"
assert len(prompt.chunk_ids_included) == len(package.sections)
assert set(prompt.chunk_ids_included) == {s.chunk_id for s in package.sections}
print(f"  PromptPackage built  — {len(prompt.chunk_ids_included)} chunks included ✓")
print(f"  System prompt length : {len(prompt.system_prompt)} chars")
print(f"  Context length       : {len(prompt.knowledge_context)} chars")

# ── Verify knowledge context structure ────────────────────────────────────────
ctx = prompt.knowledge_context
assert "=== CORE KNOWLEDGE ===" in ctx,       "Core section missing"
assert "=== AUTOMOTIVE KNOWLEDGE ===" in ctx, "Automotive section missing"
assert "[Source:" in ctx,                     "chunk_id source tags missing"

# verify all chunk_ids from the package appear in the context
for cid in prompt.chunk_ids_included:
    assert cid in ctx, f"chunk_id {cid} not in knowledge context"

print("  All chunk_ids present in context ✓")
print("  CORE + AUTOMOTIVE sections present ✓")

# ── Verify PromptPackage fields are Claude-ready ──────────────────────────────
assert "Executive Summary" in prompt.system_prompt
assert "Core Perspective"  in prompt.system_prompt
assert "Automotive Perspective" in prompt.system_prompt
assert "Strategic Insights"    in prompt.system_prompt
assert "Recommendations"       in prompt.system_prompt
assert "Sources Used"          in prompt.system_prompt
print("  All six response sections specified in system prompt ✓")
assert "cite" in prompt.system_prompt.lower() or "Cite" in prompt.system_prompt
assert "Not available in the current knowledge base" in prompt.system_prompt
print("  Citation + hallucination guard rules present ✓")

# ── Print full knowledge context for visual inspection ────────────────────────
print()
print("── Knowledge context sent to Claude ────────")
print(prompt.knowledge_context)
print()
print("── All structural assertions passed ✓ ─────")
print("   (No Claude API call was made.)")
print("   Run the CLI with --query to test the full pipeline:")
print("   py knowledge_base/strategy_response_engine.py --provider openai --query 'AI governance'")
