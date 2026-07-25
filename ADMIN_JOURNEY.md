# SoorgaAI — Admin Journey

How a SoorgaAI platform admin (not a customer) curates the knowledge that grounds every company's generation. For the customer-facing side, see [USER_JOURNEY.md](USER_JOURNEY.md). For how it fits together, see [ARCHITECTURE.md](ARCHITECTURE.md).

There is no unified admin nav — each tool below is a standalone page reached by direct URL, gated by `frontend/admin/login.html` (redirects unauthenticated/non-admin users there and back). The backend independently enforces `adminOnly` (`middleware/adminMiddleware.js`) on every route these pages call, so the page-level guard is convenience, not the real security boundary. `frontend/admin/dashboard.html`/`kpi-dashboard.html` are a separate, older "signals" admin surface — unrelated to the tools below.

## The three admin tools

### 1. Company Research Library — `company-library.html`

The core tool: one entry per real company, admin-curated, reused by **every** matching organisation at signup (see `ensureBlueprint()` in Architecture doc).

- **Add a company** — type just the company name. Industry is auto-detected from the name (no picker) via a web-search-grounded call; a sub-vertical tag is optional (for companies whose domain diverges from the generic industry KB, e.g. "Autonomous Fleet Operations" within Automotive).
- **Run Research** — one explicit button click fires real, paid web-search research (OpenAI Responses API + `web_search` tool) that drafts content for every capability section, plus a **Capability Map** (industry challenge → which of the company's own products addresses it, e.g. "Labour shortage → Odin retrofit kits"). Nothing is trusted until reviewed.
- **Review screen** — for the capability currently in focus (see "Focus filter" below), the whole capability's content is shown as one stacked document: Automotive/Industry KB context → Capability Map → Core framework definition → the company's own drafted content — Approve / Edit-then-approve / Discard on each piece.
- **Focus filter** — `FOCUS_CAPABILITIES` in `company-library.js` restricts the sidebar to whichever capability is currently being validated (today: AI Opportunity Discovery only). A one-line array edit brings the next capability into view; empty array shows everything.
- **Industry KB status indicator** — if the detected industry has no KB coverage yet, a banner links straight to tool #3.

### 2. Industry Verticals — `industry-verticals.html`

Reference material for a **sub-vertical within an already-covered industry** — e.g. a company's actual business (autonomous fleet operations) is a meaningful step away from the generic Automotive KB, even though Automotive itself is fully covered. Same shell → research → draft → approve lifecycle as the Company Library, keyed by `(parentIndustry, subVertical)` instead of by company name, so one vertical entry grounds every company tagged with it.

### 3. Industry KB — `industry-kb.html`

Handles the other case: an industry with **no coverage at all**. Auto-created the moment an admin adds a company whose detected industry has never been seen before — e.g. the first semiconductor company creates a "Semiconductor" entry.

- **Nothing generates automatically.** A brand-new industry sits as `pending` — this was a deliberate change after early testing showed a full generation run is a real, non-trivial OpenAI cost (~16 web-search-grounded calls, one per capability across all 6 domains, a few minutes). The detail page shows "Generate Industry KB (~16 calls, real cost)" and waits for an explicit click.
- **Generation** runs serially (not parallel — progress is tracked on one shared document, so concurrent writes would race), producing one full markdown document per capability in a fixed template: Purpose → Business Context → Business Challenges → Workflows → Common High-Effort Activities → Typical Opportunities → Principles → Leadership Question. The model decides how to sub-categorize Business Context/Challenges/Opportunities for the actual industry (e.g. it split Semiconductor into Fabricators/EDA vendors/Equipment suppliers on its own) — nothing is force-fit to the automotive shape.
- **Review** — same draft → Approve/Edit/Discard pattern as the other two tools, one capability at a time, grouped by domain in the sidebar.
- **Approving writes a real `.md` file** to `knowledge_base/automotive/enterprise_ai/{Domain}/{Industry}/{Industry}_{Capability}.md` — the exact path the rest of the system already reads from (`getDomainCapabilityBlueprint()`), so a newly-approved industry works everywhere immediately, with no further code changes or deploys.
- **Reuse**: the next company detected in an already-`ready` (fully published) industry skips generation entirely — zero wasted calls. A dedup step also catches near-duplicate industry labels (e.g. "Semiconductor" vs "Semiconductors" from two different companies) so they don't silently create two competing, half-covered entries for the same real industry.

## Trust model, consistent across all three tools

Nothing admin-facing auto-publishes. Every piece of AI-generated content — a company's section, a capability map row, a sub-vertical's reference material, a whole new industry's KB — lands as a `draftContent`/`draft` field first, tagged with its confidence (`external-research` vs `external-research-limited`, based on how much the search actually surfaced), and only becomes live/generation-safe content after an explicit admin approval. Discard and re-research are always available if a draft isn't good enough.

## A concrete walkthrough: onboarding "Flux Auto" as a new customer

1. Admin opens Company Research Library, types "Flux Auto, Inc." — industry auto-detects as "Automotive" (already fully covered, so no Industry KB step needed).
2. Clicks **Run Research** — real web search drafts all section content plus a 5-row Capability Map (Odin hardware, Odin software platform, fleet dashboard, LiDAR mapping/calibration, on-site installation), each tied to a specific industry challenge it solves.
3. Admin reviews and approves each piece — company sections and the Capability Map.
4. When "Flux Auto, Inc." later signs up as a real customer, `ensureBlueprint()` matches the org name to this library entry and copies the approved content straight into their Enterprise Blueprint — and the approved Capability Map is what lets AI Opportunity Discovery's generation name the *Odin platform* specifically, instead of a generic AI benefit.
