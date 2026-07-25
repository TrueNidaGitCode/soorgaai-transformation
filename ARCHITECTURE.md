# SoorgaAI — Architecture

How the system is actually built. For what a customer experiences, see [USER_JOURNEY.md](USER_JOURNEY.md); for the admin tooling, see [ADMIN_JOURNEY.md](ADMIN_JOURNEY.md); for frameworks/libraries/hosting, see [TECH_STACK.md](TECH_STACK.md) (not duplicated here).

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

## Domains

`config/domainRegistry.js`'s `DOMAINS` is the single source of truth for which domains exist and whether they're enabled — both the generation pipeline and the Industry KB generator loop over this same list. Currently all 6 are enabled: AI Use Cases, AI Strategy, Data Readiness, Technology Infrastructure, Skills & Workforce, Governance & Ethics.

Note: `services/strategyCanvasService.js` also has a narrower `LIBRARY_GROUNDED_DOMAINS` constant (`AI_Strategy` + `AI_Use_Cases` only) — this is intentionally a *different, smaller* list, used only by the Company/Enterprise/Vertical library services. Don't confuse the two or try to merge them.

## Known architectural debt (worth knowing, not urgent)

- A parallel Python RAG pipeline exists under `knowledge_base/automotive/` (loader → embedding → vector store → retrieval) but isn't wired into the Node backend — the live path is direct filesystem reads, no embeddings.
- Several frontend pages and backend models belong to an earlier product iteration (assessment/signals) and are no longer linked from the current UI — see User Journey's "Legacy" section.
- `CompanyResearchLibrary.companyNameNormalized` is a *globally* unique index, not scoped by industry — two genuinely different real companies that happen to share a name across industries still can't both exist as separate library entries. Read paths are industry-scoped as a partial mitigation; the index itself hasn't been changed.
