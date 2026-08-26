# SoorgaAI — Architecture

How the system is actually built. For what a customer experiences, see [USER_JOURNEY.md](USER_JOURNEY.md); for the admin tooling, see [ADMIN_JOURNEY.md](ADMIN_JOURNEY.md); for frameworks/libraries/hosting, see [TECH_STACK.md](TECH_STACK.md); for how the five products (Cob/Aria/Arth/Eame/Yusu) connect to a customer's own engineering lifecycle, see [PRODUCT_PIPELINE_SCHEMA.md](PRODUCT_PIPELINE_SCHEMA.md) — a design document, not yet implemented (not duplicated here).

## The mental model: five knowledge layers

Every piece of generated content is grounded in some combination of five layers, from most generic to most specific:

| Layer | What it holds | Where it lives | Who writes it |
|---|---|---|---|
| **Core** | Industry-neutral framework definition of a capability (what "AI Opportunity Discovery" *means*, independent of any industry) | Filesystem markdown | Hand-authored |
| **Industry** | Industry-specific overlay — typical challenges, workflows, opportunities for that capability *in that industry* | Filesystem markdown | Hand-authored (Automotive) or AI-generated + admin-approved (every other industry) |
| **Company** | Admin-curated public facts about one real company — reused by every matching org at signup | MongoDB (`CompanyResearchLibrary`) | AI-drafted (web search) + admin-approved |
| **Enterprise** | One organisation's own internal AI strategy document, seeded from Company layer, then written by that org's CTO/admin | MongoDB (`EnterpriseBlueprint`) | Seeded from Company, then org-owned |
| **Project** | Documents a specific user explicitly links to a specific blueprint (e.g. Confluence pages) | MongoDB (`LinkedProjectDocument`) | User-picked |

A capability's generation prompt is built by combining whichever of these layers actually have content — Core is always present, everything else is additive context that degrades gracefully to nothing if absent (a brand-new industry with no Company/Enterprise data still generates, just with less grounding).

## Knowledge base file structure

```
knowledge_base/automotive/enterprise_ai/
  {Domain}/                                    e.g. AI_Use_Cases, AI_Strategy, Data_Readiness,
    Core/                                       Technology_Infrastructure, Skills_Workforce,
      {Domain}_Intelligence_Specification.md    Governance_Security
      {Capability}.md                           (per-capability Core definition)
    {Industry}/                                 e.g. Automotive, Semiconductors, ...
      {Industry}_{Capability}.md                (per-capability Industry overlay)
```

The top-level folder is named `automotive/` for historical reasons only — Core content is industry-neutral, and every other industry's overlay lives as a sibling folder next to `Automotive/` within the same tree (e.g. `AI_Use_Cases/Semiconductors/Semiconductors_AI_Opportunity_Discovery.md`). No code assumes the folder name means anything; `industry` is a plain string parameter throughout `strategyCanvasService.js`.

**Which capabilities exist per domain** is read from each domain's `Core/{Domain}_Intelligence_Specification.md` — specifically a markdown table under "Knowledge Architecture" (`extractCapabilities()`), not headings. 16 capabilities total across 6 domains (3+4+3+3+2+1). Adding a new industry never adds new capabilities — it only adds overlay files for the capabilities that already exist.

**Extraction into prompts**: `extractParagraphText()` flattens a KB markdown file into plain prose for injection into an LLM prompt. It keeps headings and bullet-list text (stripping the markdown markers) and drops only pure metadata lines, tables, and blockquotes — this was a real bug until recently: it used to *skip* every bullet and heading entirely, so any KB file written mostly as bullet lists (which is most of them) was silently truncated to just its opening prose paragraphs before ever reaching the model. Fixed alongside raising the word cap for the Automotive KB from 200 to 1200 words, since the cap alone (with bullets now included) was still cutting content off before it reached the actually-substantive sections.

## Data models (MongoDB)

Grouped by role — see `backend/trunida-backend/models/` for the full set:

- **Generation targets**: `TransformationBlueprint` (the multi-domain result a signed-in user or guest generates), `CompanyBlueprint` (older per-session single-domain equivalent, still used by some legacy flows), `DomainCanvas` (per-domain scaffold created at profile setup).
- **Layer 3/4/5 content**: `CompanyResearchLibrary`, `IndustryVerticalKnowledge`, `IndustryCapabilityKnowledge` (Company/sub-vertical/whole-new-industry — see Admin Journey), `EnterpriseBlueprint`, `LinkedProjectDocument`.
- **User/org**: `user.js`, `UserProfile`, `CompanyContext`, `EmailOtp`.
- **Knowledge sources**: `KnowledgeDocument`, `KnowledgeSuggestion`, `ConfluenceConnection`, `PersonalConfluenceConnection`.
- **Legacy/assessment product**: `AssessmentSession`, `AssessmentResponse`, `AssessmentReport`, `Conversation`, `UserFeedback` — belong to the earlier "AI Maturity Assessment" product (see User Journey's "Legacy" section), still functional but not part of the current flow.

## Generation pipeline

Every capability's brief goes through `runBriefGeneration()` (`services/blueprintGenerationService.js`), which builds a prompt from whichever layers have content and calls `callLLM()` — a 3-provider failover chain (Gemini → Claude → OpenAI by default, `services/llmService.js`, overridable via `PROVIDER_CHAIN`). One exception:

**AI Opportunity Discovery — the key-differentiator capability** — runs a 2-stage pipeline instead of one call:
1. **Stage 1** reads only the business objective + Core/Industry KB text (deliberately *no* company data yet) and extracts `businessProblems` — matching the intended reasoning order: understand the industry's problems before considering which company product might solve them.
2. **Stage 2** takes those problems plus the company's admin-approved **Capability Map** (`CompanyResearchLibrary.capabilityMap` — "industry challenge → which company product solves it, and how") and generates `aiOpportunities`, each explicitly naming the company's own product when a mapping exists, instead of a generic AI benefit.

Both stages reuse the same `callLLM()` failover — no separate LLM plumbing. Output shape is identical to every other capability's single-call result, so nothing downstream (parsing, the frontend view, the other 3 AI Use Cases capabilities that read `selectedInitiative` off this one's output) needed to change.

## Admin-side content generation (Industry KB)

Covered in depth in [ADMIN_JOURNEY.md](ADMIN_JOURNEY.md) — architecturally, the important points:

- Company/sub-vertical/industry content is all generated the same way: OpenAI's Responses API with the `web_search` server tool (`services/companyResearchService.js`), never invented from the model's own training knowledge alone — every draft is tagged with its confidence based on how much search actually surfaced.
- A whole new industry's KB (16 capability documents) is generated **only on explicit admin trigger**, never automatically on company creation — a deliberate cost control, since each run is ~16 real, paid calls. `IndustryCapabilityKnowledge` tracks per-capability progress so an SSE stream can show live status.
- Approving a capability writes a real `.md` file to the exact path the read side (`getDomainCapabilityBlueprint()`) already expects — the only place any backend service writes into `knowledge_base/` at runtime; everywhere else is read-only.
- Industry-label matching includes a dedup step (exact + singular/plural-tolerant) so near-duplicate detections (e.g. "Semiconductor" vs "Semiconductors") reuse one entry instead of creating two.

## Hybrid retrieval (Node-native)

Three previously-separate, inconsistent relevance mechanisms are being consolidated into one shared retrieval system, used by both blueprint generation and chat — not a revival of the Python pipeline below, a fresh Node-native reimplementation of the same *idea* (structured + semantic, merged), backed by MongoDB Atlas Vector Search (no new infrastructure — already on Atlas) and OpenAI `text-embedding-3-small` embeddings (reuses `OPENAI_API_KEY` — no new key).

- **`models/KnowledgeChunk.js`** — one collection for every retrievable chunk regardless of source (`sourceType: 'kb' | 'confluence'`), tagged with `capabilityId`/`industry`/`orgName` for the structured arm and an `embedding` field for the semantic arm.
- **`services/hybridRetrievalService.js`** — `hybridRetrieve({ queryText?, sourceType, capabilityId?, industry?, orgName?, topK })`. Structured arm: metadata filter, fixed score 0.90, fires **only** on `capabilityId` (a genuine "we already know the exact match" signal — see debt note below). Semantic arm: Atlas `$vectorSearch`, cosine similarity, filtered by a low sanity-floor threshold (0.15) rather than a strict cutoff. Chunks found by both arms get a +0.10 boost and `source: "both"`.
- **`services/embeddingService.js`** — thin OpenAI embeddings wrapper.

**Migration status** (deliberately phased, not a single cutover):
1. ✅ Shared module built and validated in isolation against real KB content — zero production impact, nothing wired in yet at this stage.
2. ✅ **Live**: `services/connectedKnowledgeService.js` (Confluence-sourced context for both `getConnectedKnowledgeContext` and `preloadConnectedKnowledgeMap`) now queries `hybridRetrieve` instead of a naive keyword-overlap heuristic. Same external function signatures — no caller changed except one `await` that was missing for the now-necessarily-async `.get()` (real semantic search can't be synchronous the way keyword overlap was). `services/confluenceExtractionService.js` embeds every newly-extracted page into `KnowledgeChunk` non-blocking, right after it's marked `extracted`.
3. ✅ **Live**: `services/blueprintSuggestService.js`'s multi-capability relevance check (chat, `allCapabilitySections`) now ranks candidates via `rankByRelevance()` instead of dumping all 16. This one is architecturally different from step 2 — the content is one user's current blueprint state, ephemeral and per-request, so it's ranked on-the-fly (embed query + all candidates in one batched call, cosine similarity computed locally) rather than persisted into `KnowledgeChunk`/Atlas. Falls back to the full unfiltered list on any ranking failure, so a bad request never regresses below pre-Phase-3 behavior. Validated: 16 realistic candidates, `topK=5` correctly kept the 5 most plausible and excluded the other 11, including every genuinely unrelated one.
   - Note: `readRelatedCapabilityContent` (the separate P5 "related capability knowledge" block, sent on every message regardless of mode) is still unfiltered and still scoped to the legacy `AI_STRATEGY_PATH` only — out of scope for this phase, tracked as a separate item, not fixed here.
4. **Deliberately not migrating**: `services/strategyCanvasService.js`'s KB capability+industry lookup for blueprint generation stays a direct filesystem read. A fixed, enumerable 16-capability taxonomy has no ambiguity for retrieval to resolve — the structured arm's metadata-filter certainty is equivalent, not superior, to a direct lookup there, so there's no reason to route it through the extra layer.

**Two lessons from testing, worth not re-learning**: a scoping field (org, source type) must never by itself trigger the structured arm the way an exact match key (capability) does — it matches nearly everything, not something specific, and this was caught twice (once per field) before Confluence went live. And OpenAI's embedding model clusters short business-style text tightly (0.66–0.79 cosine similarity was observed *between topically unrelated real documents* in testing) — a strict similarity threshold is not a reliable exclusion mechanism at this scale; ranking + a topK cap does the real work, matching the original Python architecture's own default of an effectively-off threshold.

**Explicitly out of scope, deferred by decision, not oversight**: citation-per-claim enforcement (the original Python design's `[chunk_id]` requirement and mandatory "Sources Used" section). Nothing built here touches response generation at all — retrieved context is injected into prompts exactly like every other context source in the product, none of which enforce citations today. Retrieval quality was the priority; citation-tracing is a separate, real piece of future work if traceability becomes a requirement.

## Domains

`config/domainRegistry.js`'s `DOMAINS` is the single source of truth for which domains exist and whether they're enabled — both the generation pipeline and the Industry KB generator loop over this same list. Currently all 6 are enabled: AI Use Cases, AI Strategy, Data Readiness, Technology Infrastructure, Skills & Workforce, Governance & Ethics.

Note: `services/strategyCanvasService.js` also has a narrower `LIBRARY_GROUNDED_DOMAINS` constant (`AI_Strategy` + `AI_Use_Cases` only) — this is intentionally a *different, smaller* list, used only by the Company/Enterprise/Vertical library services. Don't confuse the two or try to merge them.

## Known architectural debt (worth knowing, not urgent)

- A separate, older Python RAG pipeline exists under `knowledge_base/` (loader → embedding → Chroma vector store → hybrid retrieval → citation-enforced response, documented in `knowledge_base/ARCHITECTURE.md`) — built first (June 2026), abandoned after ~2 days in favor of the Node backend, never wired to it, no shared code. It predates 5 of the current 6 domains (scoped only to AI Strategy) and isn't a dependency of the Hybrid retrieval section above, which is a fresh Node-native build, not a revival of this pipeline.
- The Node feature that would most benefit from real retrieval — the chat advisor's cross-capability relevance — doesn't have it yet (see Hybrid retrieval, migration status above), and is also, separately, the one place two different implementations of "the advisor" exist, only one of them reachable — see User Journey's "Legacy" section for the orphaned-advisor note.
- Several frontend pages and backend models belong to an earlier product iteration (assessment/signals) and are no longer linked from the current UI — see User Journey's "Legacy" section.
- `CompanyResearchLibrary.companyNameNormalized` is a *globally* unique index, not scoped by industry — two genuinely different real companies that happen to share a name across industries still can't both exist as separate library entries. Read paths are industry-scoped as a partial mitigation; the index itself hasn't been changed.
