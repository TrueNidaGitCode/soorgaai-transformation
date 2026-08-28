# Self-Hosted Model Setup (Privacy Path)

How to run Svarg's defect-matching capability (Eame) entirely on a
self-hosted model server instead of OpenAI/Anthropic/Gemini's cloud APIs —
the fix for the first of the three privacy gaps identified for Pattern A
(see [PRODUCT_PIPELINE_SCHEMA.md](PRODUCT_PIPELINE_SCHEMA.md)): where
inference happens. Nothing sent to the model or embedding server described
here leaves wherever that server is actually running.

**Scope**: this proves the mechanism for one capability (defect matching),
not per-customer provisioning automation — that's separate, later work
once this is validated. It also doesn't touch where *data* lives (still
MongoDB Atlas) or multi-tenant isolation — those are the other two privacy
gaps, tracked separately.

**Prerequisite**: a machine to run the model server on. Ollama runs on
CPU (slow) or GPU (fast) — a laptop is enough to prove this works; a real
GPU instance is what you'd actually deploy for a customer.

## 1. Install Ollama

Follow [ollama.com](https://ollama.com) for your OS. Confirm it's running:
```bash
ollama --version
```

## 2. Pull a chat model

```bash
ollama pull llama3.2:3b
```
Starting suggestion — small enough to run on CPU for a first test. Swap
for anything larger once you have real GPU hardware (`qwen2.5:7b` or a
bigger model are both fine); the model name just needs to match
`SELFHOSTED_MODEL` below.

## 3. Pull an embedding model

```bash
ollama pull nomic-embed-text
```
768 dimensions, lightweight, well-supported. This is the dimension the
migration script and `SELFHOSTED_EMBEDDING_DIMENSIONS` default to below —
if you pick a different embedding model, check its actual output
dimension and set that env var to match.

## 4. Confirm the OpenAI-compatible endpoint is live

Ollama exposes an OpenAI-compatible API automatically once it's running,
at `http://localhost:11434/v1` by default. Quick check:
```bash
curl http://localhost:11434/v1/models
```

## 5. Set environment variables

Add to `backend/trunida-backend/.env` (or Railway's variables, for a real
deployment):
```env
# LLM (root-cause synthesis)
LLM_PROVIDER=selfhosted
SELFHOSTED_BASE_URL=http://localhost:11434/v1
SELFHOSTED_MODEL=llama3.2:3b
# SELFHOSTED_API_KEY not needed for Ollama — leave unset

# Embeddings (retrieval)
EMBEDDING_PROVIDER=selfhosted
SELFHOSTED_EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_MODEL=nomic-embed-text
SELFHOSTED_EMBEDDING_DIMENSIONS=768
```

`LLM_PROVIDER=selfhosted` forces every LLM call through the self-hosted
provider exclusively (no cloud fallback) — the honest way to test this,
rather than `PROVIDER_CHAIN` which would silently fall back to a cloud
provider on any self-hosted failure and mask whether it's actually
working.

## 6. Run the one-time migration

```bash
cd backend/trunida-backend
node scripts/migrate_embedding_provider.mjs
```
This re-embeds every defect record under the new provider and rebuilds
the Atlas Search index at 768 dimensions (see the script's own comments —
required because switching embedding providers changes the vector space,
and the old 1536-dimension index/chunks are incompatible with it).

## 7. Test it

Restart the backend, then use either:
- `frontend/defect-matching/defect-matching.html` directly, or
- `frontend/pipeline-demo/pipeline-demo.html`'s Window 6 chat

Same already-proven flow — describe a new defect, confirm it returns a
sensible match and root-cause suggestion, now generated entirely by the
model running on your own machine.

## Rolling back

Unset `LLM_PROVIDER` and `EMBEDDING_PROVIDER` (or set
`EMBEDDING_PROVIDER=openai`), then re-run
`node scripts/migrate_embedding_provider.mjs` again to rebuild the index
back at 1536 dimensions against OpenAI's embeddings.
