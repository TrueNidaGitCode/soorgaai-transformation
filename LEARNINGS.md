# SoorgaAI — Implementation Learnings & Decisions

This file records non-obvious implementation decisions, assumptions, and deferred items
for future engineers and AI agents picking up this codebase.

---

## v2.2.0 — AI Transformation Workspace

### Decision: Engineering Manager (not Engineering Head)

The EPIC mentions "Engineering Head / Engineering Manager" as an enum value.
We defaulted to **"Engineering Manager"** (per EPIC instruction) because:
- "Engineering Manager" is the more common industry title.
- "Engineering Head" is ambiguous (could be VP, Director, or a regional variant).
- The profile setup form shows: CTO | Engineering Director | Engineering Manager.

If the PO later confirms "Engineering Head" is required, update:
- `models/UserProfile.js` → `enum` array
- `frontend/profile-setup/profile.html` → select option

---

### Decision: Chat-only canvas evolution

Canvas focus area descriptions are only updated through chat — there is no manual
edit UI in v1.0. This was a deliberate choice per the architecture doc:
- Keeps the UX focused: canvas reflects what the AI has learned, not manual input.
- Avoids the complexity of conflict resolution between manual edits and AI updates.

Deferred to v1.1: `POST /api/chat/:domainId/canvas/revert` endpoint.

---

### Decision: AI Strategy focus area IDs and titles

Since the full EPIC appendix was not available, the 5 focus area IDs/titles were defined
as reasonable professional defaults and should be confirmed with the PO:

| ID                       | Title                              |
|--------------------------|------------------------------------|
| vision-alignment         | AI Vision & Business Alignment     |
| investment-prioritization| AI Investment & Prioritization     |
| roadmap-execution        | AI Roadmap & Execution             |
| culture-change           | AI Culture & Change Management     |
| metrics-value            | AI Metrics & Value Tracking        |

If titles need to change, update `data/domainDefinitions.js` ONLY. The canvas docs
in MongoDB will retain whatever titles were used at profile creation time.

---

### Decision: Context window cap

The conversation service retains the **last 10 turns verbatim** and collapses older
history into a rolling summary. This keeps Claude input tokens under ~6,000.
The summarization fires when `turns.length - summaryUpToTurn > 10`.

Tuning knob: `SUMMARY_EVERY` constant in `services/conversationService.js`.

---

### Deferred items (out of scope for v1.0)

| Item | Target |
|------|--------|
| `POST /api/chat/:domainId/canvas/revert` — undo a canvas update | v1.1 |
| Other 6 domain agents (Leadership, Use Cases, etc.) | v1.2+ |
| Manual canvas description editing | v1.2+ |
| Mobile-optimized two-panel layout (currently stacks at <900px) | v1.1 |
| Export canvas + chat transcript to PDF | v1.2+ |
| Multi-user collaboration on shared canvas | v2.0 |

---

### ctaRouter.js change

`/platform/platform.html` → `/workspace/workspace.html` (v2.2.0).
The platform stub remains at `/platform/platform.html` as a legacy page; it is no
longer the primary CTA destination. Unit tests in `frontend/__tests__/ctaRouter.test.js`
were updated to reflect the new route.

---

### Industry Domain options (profile setup)

MVP scope is Automotive sub-domains: General | Diagnostics | Infotainment | ADAS.
Future: Healthcare, Finance, Manufacturing, Retail (matching the assessment engine domains).

---

*Last updated: 2026-06-04*
