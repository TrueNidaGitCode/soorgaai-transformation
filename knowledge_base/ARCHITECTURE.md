# SoorgaAI Knowledge Base — Architecture & Developer Guide

## Contents

1. [System overview](#1-system-overview)
2. [Data flow: types at each stage boundary](#2-data-flow)
3. [Stage 1 — Loader](#3-stage-1--loader)
4. [Stage 2 — Embedding Engine](#4-stage-2--embedding-engine)
5. [Stage 3 — Vector Store](#5-stage-3--vector-store)
6. [Stage 4 — Hybrid Retrieval](#6-stage-4--hybrid-retrieval)
7. [Stage 5 — Context Builder](#7-stage-5--context-builder)
8. [Stage 6 — Prompt Builder (Strategy Response Engine)](#8-stage-6--prompt-builder)
9. [Stage 7 — LLM Abstraction Layer](#9-stage-7--llm-abstraction-layer)
10. [CLI reference](#10-cli-reference)
11. [Extension guide](#11-extension-guide)
12. [Design decisions and invariants](#12-design-decisions-and-invariants)

---

## 1. System overview

SoorgaAI is a grounded RAG system: every factual claim in the response must be traceable to a specific chunk in the knowledge base, identified by its `chunk_id`. The system enforces this at the prompt level — Claude is instructed to cite `[chunk_id]` for every claim and to respond with "Not available in the current knowledge base." for anything it cannot find.

### Two phases

**Build phase** (run once, or when the knowledge base changes)

```
Markdown files → Loader → EmbeddingEngine → VectorStore → .chroma/
```

**Query phase** (run per question)

```
Query → HybridRetrieval → ContextBuilder → StrategyResponseEngine → LLM → Response
```

### Layer model

The knowledge base uses a three-layer hierarchy:

| Layer | Contents | Example files |
|---|---|---|
| **Core** | Universal enterprise AI strategy | `AI_Governance_Ethics.md`, `Business_Strategy_Alignment.md` |
| **Automotive** | Automotive-specific applications | `Automotive_AI_Governance_Ethics.md`, `Automotive_AI_CoE.md` |
| **Templates** | Customisable org templates | `Company_AI_Strategy_Template.md` |

The retrieval pipeline always presents Core knowledge first, then Automotive, preserving the general-to-specific hierarchy in the final response.

---

## 2. Data flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  Build phase                                                        │
│                                                                     │
│  str (base_dir)                                                     │
│       │  MarkdownLoader.load()                                      │
│       ▼                                                             │
│  list[Document]   ──────────────────────────────┐                  │
│       │  ChunkEngine.chunk()                    │                  │
│       ▼                                         │                  │
│  list[Chunk]                                    │ CapabilityIndex  │
│       │  EmbeddingEngine.embed()                │ (structured arm) │
│       ▼                                         │                  │
│  list[EmbeddedChunk]                            │                  │
│       │  ChromaVectorStore.add_chunks()         │                  │
│       ▼                                         │                  │
│  Chroma index (.chroma/)  ◄────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Query phase                                                        │
│                                                                     │
│  str (query)                                                        │
│       │  ChromaHybridRetrieval.retrieve()                          │
│       │  ┌─────────────────────────────────────────────────────┐   │
│       │  │  Structured arm: CapabilityIndex.query() → metadata  │   │
│       │  │  Semantic arm:   ChromaSemanticSearch.search() → ANN │   │
│       │  │  Merge: dedup by chunk_id, score boost for "both"    │   │
│       │  └─────────────────────────────────────────────────────┘   │
│       ▼                                                             │
│  HybridRetrievalResult                                              │
│       │  DefaultContextBuilder.build()                             │
│       ▼                                                             │
│  ContextPackage   (layer-grouped, capability-ordered, deduplicated) │
│       │  ClaudeStrategyResponseEngine.build_prompt()               │
│       ▼                                                             │
│  PromptPackage    (system prompt + knowledge context + query)       │
│       │  LLMProvider.generate()                                     │
│       ▼                                                             │
│  LLMResponse      (response_text, latency, token_usage, …)         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Stage 1 — Loader

**File:** `knowledge_base/loader.py`

### Purpose

Reads Markdown files from a directory tree, infers metadata (layer, capability) from the folder path and filename, and segments each file into semantic chunks by heading.

### Key types

```python
@dataclass
class Document:
    file_name:     str
    relative_path: str
    category:      str    # top-level folder name
    content:       str    # raw Markdown text
    title:         str    # derived from filename
    layer:         str    # "Core" | "Automotive" | "Templates"
    capability:    str    # e.g. "AI Governance Ethics"

@dataclass
class Chunk:
    document_title: str
    layer:          str
    capability:     str
    section_title:  str   # "## heading" text
    content:        str   # text under the heading
    relative_path:  str
    heading_level:  int   # 1, 2, or 3
```

### Key classes

**`MarkdownLoader(base_dir, categories=None)`**

| Method | Returns | Description |
|---|---|---|
| `load()` | `list[Document]` | Scans `base_dir` recursively, loads all `.md` files |
| `print_summary(docs)` | `None` | Prints layer and capability counts |
| `print_catalog(docs, ...)` | `None` | Prints full document catalogue |

**`CapabilityIndex(documents)`**

Builds a searchable index from the loaded documents. Used by the structured retrieval arm.

| Method | Returns | Description |
|---|---|---|
| `get_capabilities()` | `list[str]` | All unique capability names |
| `find_capability(name)` | `list[Document]` | Exact or substring match |
| `get_capability_layers(name)` | `list[str]` | Layers that cover this capability |
| `query(text)` | `list[Document]` | Case-insensitive keyword match across capability names |

**`ChunkEngine`**

Segments a `Document` into `Chunk` objects by parsing `##` and `###` headings. Used internally by `EmbeddingEngine` and `VectorStore`.

### CLI

```bash
py knowledge_base/loader.py --directory <path> [--metadata] [--catalog] [--index] [--query <text>] [--chunks]
```

---

## 4. Stage 2 — Embedding Engine

**File:** `knowledge_base/embedding_engine.py`

### Purpose

Converts `Chunk` objects to `EmbeddedChunk` objects by generating a dense vector (embedding) for each chunk's content. Provider-agnostic — accepts any LangChain-compatible embeddings object.

### Key types

```python
@dataclass
class EmbeddedChunk:
    chunk_id:   str         # 16-char SHA-256 of (path + section_title)
    document:   str
    layer:      str
    capability: str
    section:    str
    path:       str
    content:    str
    embedding:  list[float] # 384d (HuggingFace) or 1536d (OpenAI)
```

The `chunk_id` is a stable hash — the same document section always produces the same ID.

### Key classes

**`EmbeddingEngine(embeddings)`**

| Method | Returns | Description |
|---|---|---|
| `embed(chunks)` | `list[EmbeddedChunk]` | Batches all texts in a single provider call |
| `print_summary(embedded)` | `None` | Reports chunk count and vector dimension |

**`create_embeddings(provider, model=None)`**

Factory function for the three supported providers:

| provider | Package required | Default model |
|---|---|---|
| `"openai"` | `langchain-openai` | `text-embedding-3-small` |
| `"huggingface"` | `langchain-community` + `sentence-transformers` | `all-MiniLM-L6-v2` |
| `"ollama"` | `langchain-community` + running Ollama server | `nomic-embed-text` |

### CLI

```bash
py knowledge_base/embedding_engine.py --provider openai|huggingface|ollama [--model <name>]
```

---

## 5. Stage 3 — Vector Store

**File:** `knowledge_base/vector_store.py`

### Purpose

Persists `EmbeddedChunk` objects in a Chroma vector database for approximate nearest-neighbour (ANN) search.

**Important:** `add_chunks()` deduplicates by `chunk_id` before upserting — Chroma 1.5+ rejects duplicate IDs in a single batch.

### Key classes

**`ChromaVectorStore(persist_dir=".chroma", collection_name="soorgaai_knowledge")`**

| Method | Returns | Description |
|---|---|---|
| `add_chunks(chunks)` | `None` | Upsert — safe to call repeatedly (idempotent) |
| `get_chunk(chunk_id)` | `EmbeddedChunk \| None` | Retrieve one chunk by ID |
| `count()` | `int` | Total chunks in the collection |
| `persist()` | `None` | No-op for PersistentClient (auto-persists) |
| `print_summary()` | `None` | Reports collection name, count, persist path |

### CLI

```bash
py knowledge_base/vector_store.py --provider huggingface|openai \
    [--persist-dir .chroma] [--collection soorgaai_knowledge]
```

---

## 6. Stage 4 — Hybrid Retrieval

**File:** `knowledge_base/hybrid_retrieval.py`

### Purpose

Combines two retrieval strategies and merges their results:

- **Structured arm:** detects capability keywords in the query using `CapabilityIndex`, then fetches all Chroma chunks for that capability using metadata filters. Score = 0.90 (fixed confidence).
- **Semantic arm:** embeds the query and retrieves the top-k nearest neighbours by cosine similarity. Score = cosine similarity (0–1).
- **Merge:** deduplicates by `chunk_id`. Chunks that appear in both arms receive a +0.10 boost and are tagged `source="both"`. Final list is sorted by score descending.

### Key types

```python
@dataclass
class HybridResult:
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
    query:      str
    structured: list[HybridResult]
    semantic:   list[HybridResult]
    merged:     list[HybridResult]   # deduped + boosted + ranked
```

### Key classes

**`ChromaHybridRetrieval(documents, embeddings, persist_dir, collection_name, structured_limit=20)`**

| Method | Returns | Description |
|---|---|---|
| `retrieve(query, top_k=5)` | `HybridRetrievalResult` | Full hybrid retrieval |
| `count()` | `int` | Chunks in the Chroma collection |
| `print_results(result)` | `None` | Ranked result table |

### Scoring summary

| Source | Score |
|---|---|
| Structured only | 0.90 |
| Semantic only | cosine similarity |
| Both (intersection) | cosine similarity + 0.10 boost |

### CLI

```bash
py knowledge_base/hybrid_retrieval.py --provider huggingface|openai \
    --query "AI governance framework" [--top-k 5]
```

---

## 7. Stage 5 — Context Builder

**File:** `knowledge_base/context_builder.py`

### Purpose

Transforms a `HybridRetrievalResult` into a `ContextPackage` through a six-step pipeline. No LLM is called — this is pure data transformation.

### Six-step pipeline

| Step | Operation |
|---|---|
| 1. Deduplicate | Remove results with duplicate `chunk_id` |
| 2. Threshold filter | Drop semantic-only chunks below `similarity_threshold`; structured and "both" always pass |
| 3. Sort | Priority order: both > structured > semantic; within each group, higher score first |
| 4. Layer grouping | Separate structured/both chunks by layer (Core, Automotive, Templates, …) |
| 5. Capability grouping | Within each layer, group chunks by capability name |
| 6. Section ordering | Within each capability, order by relevance score descending |

### Key types

```python
@dataclass
class KnowledgeSection:
    layer:      str
    capability: str
    document:   str
    section:    str
    chunk_id:   str
    score:      float
    source:     str   # "structured" | "semantic" | "both"
    content:    str

@dataclass
class ContextPackage:
    query:                  str
    primary_capability:     str             # capability of the top-ranked chunk
    primary_layer:          str             # layer of the top-ranked chunk
    retrieved_layers:       list[str]       # unique layers, canonical order
    retrieved_capabilities: list[str]       # unique capabilities, layer order
    total_chunks:           int
    sections:               list[KnowledgeSection]  # flat ordered list
    layer_groups:           dict[str, list[KnowledgeSection]]  # structured/both only
    related:                list[KnowledgeSection]  # semantic-only chunks
```

### Key classes

**`DefaultContextBuilder(similarity_threshold=0.0)`**

| Method | Returns | Description |
|---|---|---|
| `build(result)` | `ContextPackage` | Run the six-step pipeline |
| `print_package(package)` | `None` | Human-readable context view |

### CLI

```bash
py knowledge_base/context_builder.py --provider huggingface|openai \
    --query "AI governance" [--top-k 5] [--threshold 0.05]
```

---

## 8. Stage 6 — Prompt Builder

**File:** `knowledge_base/strategy_response_engine.py`

### Purpose

Converts a `ContextPackage` into a `PromptPackage` ready for Claude, then calls Claude to generate a structured strategy response. Prompt caching and extended thinking are applied automatically.

### Prompt caching layout

```
system[0]              SoorgaAI instructions          → cache_control: ephemeral
messages[0].content[0] Knowledge context block        → cache_control: ephemeral
messages[0].content[1] User query (varies per request) → no cache marker
```

Repeated queries against the same knowledge context hit the cached system and context blocks, reducing cost by ~90%.

### Response format (enforced by system prompt)

Every response must contain these six sections in order:

1. **Executive Summary** — 2–3 sentences directly answering the query
2. **Core Perspective** — insights from Core layer, every claim cited as `[chunk_id]`
3. **Automotive Perspective** — insights from Automotive layer, cited
4. **Strategic Insights** — 3–5 cross-cutting themes, cited
5. **Recommendations** — 3–5 actionable items, each referencing ≥1 `[chunk_id]`
6. **Sources Used** — bulleted list: `- [chunk_id] | Document | Section`

### Key types

```python
@dataclass
class PromptPackage:
    system_prompt:      str
    knowledge_context:  str
    query_text:         str
    context_package:    ContextPackage
    model:              str
    chunk_ids_included: list[str]

@dataclass
class StrategyResponse:
    prompt_package:       PromptPackage
    response_text:        str
    model:                str
    input_tokens:         int
    output_tokens:        int
    cache_tokens_created: int
    cache_tokens_read:    int
    query:                str
```

### Key classes

**`ClaudeStrategyResponseEngine(model, max_tokens, thinking_budget_tokens, enable_thinking)`**

| Parameter | Default | Description |
|---|---|---|
| `model` | `"claude-opus-4-8"` | Claude model ID |
| `max_tokens` | `16000` | Must cover thinking budget + response |
| `thinking_budget_tokens` | `8000` | Extended thinking budget (must be < `max_tokens`) |
| `enable_thinking` | `True` | Toggle extended thinking on/off |

| Method | Returns | Description |
|---|---|---|
| `build_prompt(package)` | `PromptPackage` | Format ContextPackage for Claude |
| `generate(prompt, stream_to_stdout)` | `StrategyResponse` | Call Claude and collect response |
| `respond(package, stream_to_stdout)` | `StrategyResponse` | `build_prompt` + `generate` in one call |
| `print_response(response, include_text)` | `None` | Summary + source traceability table |

### CLI

```bash
py knowledge_base/strategy_response_engine.py \
    --provider huggingface|openai \
    --query "AI governance for automotive" \
    [--top-k 5] [--threshold 0.0] \
    [--claude-model claude-opus-4-8] \
    [--max-tokens 16000] \
    [--thinking-budget 8000] \
    [--no-thinking]
```

---

## 9. Stage 7 — LLM Abstraction Layer

**Files:** `knowledge_base/llm/`

### Purpose

Decouples the pipeline from any specific LLM provider. A `PromptPackage` produced by Stage 6 can be sent to Claude, OpenAI, Gemini, or Ollama using the same interface. All providers return the same `LLMResponse` type. All errors are caught internally — `generate()` never raises.

### Public API

```python
from knowledge_base.llm import LLMProvider, LLMResponse, TokenUsage, ProviderConfig, ProviderFactory
```

### LLMResponse

```python
@dataclass
class LLMResponse:
    provider:      str            # "claude" | "openai" | "gemini" | "ollama"
    model:         str            # actual model ID used
    success:       bool
    response_text: str            # empty string on failure
    latency:       float          # wall-clock seconds
    token_usage:   TokenUsage | None
    error_message: str | None     # human-readable, None on success

@dataclass
class TokenUsage:
    input_tokens:         int
    output_tokens:        int
    cache_tokens_created: int   # Anthropic prompt-cache writes
    cache_tokens_read:    int   # Anthropic prompt-cache reads
```

### ProviderConfig

```python
@dataclass
class ProviderConfig:
    provider:               str          # required
    model:                  str | None   = None    # provider default if None
    api_key:                str | None   = None    # env var if None
    base_url:               str | None   = None    # Ollama only
    max_tokens:             int          = 4096
    timeout:                float        = 60.0
    temperature:            float        = 0.0
    enable_thinking:        bool         = True     # Claude only
    thinking_budget_tokens: int          = 8000     # Claude only; must be < max_tokens
    stream_to_stdout:       bool         = False
```

### Provider reference

| Provider | `provider` key | Default model | SDK required | Env var |
|---|---|---|---|---|
| Anthropic Claude | `"claude"` | `claude-opus-4-8` | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI GPT | `"openai"` | `gpt-4o` | `openai` | `OPENAI_API_KEY` |
| Google Gemini | `"gemini"` | `gemini-1.5-pro` | `google-generativeai` | `GOOGLE_API_KEY` |
| Ollama (local) | `"ollama"` | `llama3.2` | `httpx` (already installed) | — |

### Provider-specific notes

**Claude**
- Uses the Anthropic streaming API with `cache_control: ephemeral` on system prompt and context.
- When `enable_thinking=True`, extended thinking is applied with the configured budget.
- `max_tokens` must be large enough to hold both thinking tokens and the response (default 16000).

**OpenAI**
- Uses the streaming chat completions API.
- Temperature and max_tokens are passed directly; thinking is not supported.

**Gemini**
- Uses `generate_content()` (non-streaming).
- System instructions are passed as `system_instruction` on the `GenerativeModel`.
- When `stream_to_stdout=True`, the full response is printed after generation.

**Ollama**
- Calls the Ollama `/api/chat` HTTP endpoint via `httpx` (no extra SDK required).
- Requires a running Ollama server: `ollama serve`.
- Use `base_url` in `ProviderConfig` for non-default server addresses.

### Error handling

Every error is caught and returned as a failed `LLMResponse`. The `error_message` field provides a human-readable explanation:

| Condition | error_message contains |
|---|---|
| Invalid API key | "Invalid or revoked … API key." |
| Insufficient credits | "Insufficient credits — add credits at …" |
| Rate / quota limit | "… rate limit exceeded" or "quota exceeded" |
| Model not found | "Model not found — check …" |
| Timeout | "Request timed out …" |
| Server unavailable | "Could not connect to …" |

### Usage example

```python
from knowledge_base.llm import ProviderConfig, ProviderFactory

# Claude (with extended thinking)
config   = ProviderConfig(provider="claude", enable_thinking=True, max_tokens=16000)
provider = ProviderFactory.create(config)
response = provider.generate(prompt_package)

# OpenAI
config   = ProviderConfig(provider="openai", model="gpt-4o")
provider = ProviderFactory.create(config)
response = provider.generate(prompt_package)

# Gemini
config   = ProviderConfig(provider="gemini", model="gemini-1.5-pro", temperature=0.2)
provider = ProviderFactory.create(config)
response = provider.generate(prompt_package)

# Ollama (local)
config   = ProviderConfig(provider="ollama", model="llama3.2", base_url="http://localhost:11434")
provider = ProviderFactory.create(config)
response = provider.generate(prompt_package)

# Inspect response
if response.success:
    print(response.response_text)
else:
    print(f"Error: {response.error_message}")
```

---

## 10. CLI reference

Every module can be run standalone as a CLI tool. All modules that query the vector store require `--provider` to select the embedding engine.

| Command | Purpose |
|---|---|
| `py knowledge_base/loader.py --catalog` | Print the full knowledge catalogue |
| `py knowledge_base/embedding_engine.py --provider huggingface` | Test embedding generation |
| `py knowledge_base/vector_store.py --provider huggingface` | Build / rebuild the Chroma index |
| `py knowledge_base/semantic_search.py --provider huggingface --query "..."` | Raw semantic search |
| `py knowledge_base/hybrid_retrieval.py --provider huggingface --query "..."` | Hybrid retrieval result |
| `py knowledge_base/context_builder.py --provider huggingface --query "..."` | Context package view |
| `py knowledge_base/strategy_response_engine.py --provider huggingface --query "..."` | Full end-to-end response |

### Common flags (all query-stage modules)

| Flag | Default | Description |
|---|---|---|
| `--provider` | required | Embedding provider: `openai` \| `huggingface` \| `ollama` |
| `--model` | provider default | Embedding model override |
| `--query` / `-q` | — | Query string; omit for interactive REPL |
| `--top-k` / `-k` | `5` | Number of semantic neighbours to retrieve |
| `--threshold` | `0.0` | Min similarity for semantic-only chunks (`0.05` recommended) |
| `--persist-dir` | `.chroma` (in `knowledge_base/`) | Chroma storage directory |
| `--collection` | `soorgaai_knowledge` | Chroma collection name |
| `--directory` | `AI_Strategy` subfolder | Knowledge base directory |

### Additional flags for `strategy_response_engine.py`

| Flag | Default | Description |
|---|---|---|
| `--claude-model` | `claude-opus-4-8` | Claude model ID |
| `--max-tokens` | `16000` | Maximum output tokens (thinking + response) |
| `--thinking-budget` | `8000` | Extended thinking token budget |
| `--no-thinking` | off | Disable extended thinking |

---

## 11. Extension guide

### Adding a new LLM provider

1. Create `knowledge_base/llm/providers/<name>.py` implementing `LLMProvider`:

```python
from knowledge_base.llm.base import LLMProvider, LLMResponse, TokenUsage
import time

class MyProvider(LLMProvider):
    def __init__(self, config) -> None:
        # import SDK, store config fields
        self._model = config.model or "default-model"

    @property
    def provider_name(self) -> str:
        return "myprovider"

    @property
    def model_name(self) -> str:
        return self._model

    def generate(self, prompt_package) -> LLMResponse:
        t0 = time.perf_counter()
        try:
            # call SDK using:
            #   prompt_package.system_prompt
            #   prompt_package.knowledge_context
            #   prompt_package.query_text
            text = "..."
            return LLMResponse(
                provider="myprovider", model=self._model,
                success=True, response_text=text,
                latency=time.perf_counter() - t0,
            )
        except Exception as exc:
            return LLMResponse(
                provider="myprovider", model=self._model,
                success=False, response_text="",
                latency=time.perf_counter() - t0,
                error_message=str(exc),
            )
```

2. Add one branch in `knowledge_base/llm/factory.py`:

```python
if key == "myprovider":
    from knowledge_base.llm.providers.mymodule import MyProvider
    return MyProvider(config)
```

3. Add unit tests in `knowledge_base/tests/test_llm_myprovider.py` (no SDK installation required — mock the client in `__init__`).

### Adding a new knowledge domain

1. Create a directory under `knowledge_base/automotive/` (or a new top-level sibling).
2. Use `## Section heading` inside each Markdown file — each heading becomes a retrievable chunk.
3. Name files after the capability they represent (`AI_Governance_Ethics.md` → capability `"AI Governance Ethics"`).
4. Rebuild the vector store: `py knowledge_base/vector_store.py --provider huggingface`.

### Adding a new embedding provider

Implement a LangChain-compatible embeddings class that exposes `embed_documents(texts: list[str]) -> list[list[float]]`, then add a branch in `create_embeddings()` in `embedding_engine.py`.

---

## 12. Design decisions and invariants

**No hallucination by design**
The system prompt explicitly forbids Claude from using any knowledge outside the supplied context. If a topic is not covered by a retrieved chunk, the response states "Not available in the current knowledge base." rather than generating plausible-sounding content.

**Chunk IDs are content-addressed**
A `chunk_id` is a 16-character SHA-256 hash of `(relative_path + section_title)`. The same document section always produces the same ID, making IDs stable across rebuilds of the vector store.

**Prompt caching preserves cost efficiency**
The system prompt (≈350 tokens) and the knowledge context block (≈2000–6000 tokens depending on query) are both marked `cache_control: ephemeral`. Repeated queries in the same session serve these blocks from the Anthropic cache at ~10% of the normal input cost.

**generate() never raises**
Every `LLMProvider.generate()` implementation catches all exceptions and returns a failed `LLMResponse`. Callers should check `response.success` before using `response.response_text`.

**Pipeline layers are independently runnable**
Every module has a `main()` and can be run standalone via `py knowledge_base/<module>.py`. This enables step-by-step debugging of any stage without running the full pipeline.

**Build phase is idempotent**
`ChromaVectorStore.add_chunks()` deduplicates by `chunk_id` before calling Chroma `upsert`. Running `vector_store.py` multiple times on the same knowledge base is safe — it will not duplicate data.
