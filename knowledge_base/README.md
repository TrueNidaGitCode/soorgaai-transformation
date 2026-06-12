# SoorgaAI Knowledge Base

A retrieval-augmented generation (RAG) pipeline purpose-built for enterprise and automotive AI strategy consulting. It converts a plain-text query into a structured, cited strategy response grounded entirely in the curated knowledge base — no hallucinations, no external data.

---

## Pipeline at a glance

```
  Markdown files
       │
       ▼
  [1] Loader ──────────── Documents + Chunks
       │
       ▼
  [2] Embedding Engine ── Dense vectors (384d or 1536d)
       │
       ▼
  [3] Vector Store ─────── Chroma on-disk index
       │
       ▼
  [4] Hybrid Retrieval ─── Structured arm + Semantic arm → merged + ranked
       │
       ▼
  [5] Context Builder ──── ContextPackage (layered, capability-grouped)
       │
       ▼
  [6] Prompt Builder ───── PromptPackage (system + context + query)
       │
       ▼
  [7] LLM Provider ──────── LLMResponse  (Claude / OpenAI / Gemini / Ollama)
```

Each stage is independently runnable and testable. Stages 1–3 are a one-time build step; stages 4–7 run per query.

---

## Knowledge structure

```
knowledge_base/
  automotive/
    enterprise_ai/
      AI_Strategy/
        Core/           ← Universal AI strategy (industry-agnostic)
        Automotive/     ← Automotive-specific applications
        Templates/      ← Customisable organisation templates
    business_domains/   ← ADAS, SDV, Manufacturing, Infotainment, …
    enterprise_patterns/← CoE, Governance, ROI, Operating Model
    shared/             ← Glossary, Trends, Regulations, Best Practices
```

The folder path determines the metadata injected into every chunk:

| Path segment | Metadata field |
|---|---|
| `Core` / `Automotive` / `Templates` | `layer` |
| Filename (without extension) | `capability` |
| `## heading` inside the file | `section` |

---

## Quick start

### 1 — Install dependencies

```bash
# Core pipeline
pip install chromadb anthropic

# Choose ONE embedding provider:
pip install langchain-openai                              # OpenAI (needs OPENAI_API_KEY)
pip install langchain-community sentence-transformers    # HuggingFace (local, free)
```

### 2 — Set API keys

```bash
# Required for Claude responses
export ANTHROPIC_API_KEY=sk-ant-...

# Required only when using OpenAI embeddings
export OPENAI_API_KEY=sk-...
```

### 3 — Build the vector store (once)

```bash
py knowledge_base/vector_store.py --provider huggingface
# or
py knowledge_base/vector_store.py --provider openai
```

Output: `.chroma/` directory in `knowledge_base/`.

### 4 — Ask a question

```bash
# End-to-end: retrieval → context → Claude response
py knowledge_base/strategy_response_engine.py \
    --provider huggingface \
    --query "How should an automotive OEM build an AI governance framework?"

# Disable extended thinking (faster / cheaper)
py knowledge_base/strategy_response_engine.py \
    --provider huggingface \
    --query "AI CoE structure" \
    --no-thinking
```

### 5 — Use the LLM Abstraction Layer (any provider)

```python
from knowledge_base.context_builder import DefaultContextBuilder
from knowledge_base.embedding_engine import create_embeddings
from knowledge_base.hybrid_retrieval import ChromaHybridRetrieval
from knowledge_base.loader import CapabilityIndex, MarkdownLoader
from knowledge_base.strategy_response_engine import ClaudeStrategyResponseEngine
from knowledge_base.llm import ProviderConfig, ProviderFactory

# Build retrieval pipeline
docs       = MarkdownLoader("knowledge_base/automotive/enterprise_ai/AI_Strategy").load()
embeddings = create_embeddings("huggingface")
retrieval  = ChromaHybridRetrieval(docs, embeddings)
builder    = DefaultContextBuilder(similarity_threshold=0.05)

# Retrieve and build context
result  = retrieval.retrieve("AI governance for automotive", top_k=6)
package = builder.build(result)

# Build the prompt (unchanged from before)
strategy      = ClaudeStrategyResponseEngine(enable_thinking=False)
prompt_package = strategy.build_prompt(package)

# Generate with any provider via the abstraction layer
config   = ProviderConfig(provider="claude", enable_thinking=False)
provider = ProviderFactory.create(config)
response = provider.generate(prompt_package)

print(response.response_text)
print(f"Provider: {response.provider}  Model: {response.model}")
print(f"Latency:  {response.latency:.2f}s")
if response.token_usage:
    print(f"Tokens:   {response.token_usage.input_tokens} in / {response.token_usage.output_tokens} out")
```

---

## Running the tests

```bash
# All LLM abstraction layer tests (no API keys required)
py -m unittest discover -s knowledge_base/tests -p "test_llm_*.py" -v
```

63 tests covering success paths, all four error types, and provider properties for Claude, OpenAI, Gemini, and Ollama.

---

## Detailed documentation

See [ARCHITECTURE.md](ARCHITECTURE.md) for:
- Full component reference with all classes, methods, and parameters
- Pipeline data flow with concrete types at each stage
- LLM provider configuration reference
- CLI flag reference for every module
- Extension guide (adding new providers, new knowledge domains)
