# Svarg — Cross-Product Engineering-Lifecycle Schema

How Svarg's five products (Cob, Aria, Arth, Eame, Yusu) interconnect for a
real customer engagement, and how that connection generalizes across
different engineering methodologies (ASPICE V-Model, a plain V-Model,
Waterfall, and future ones). This is a **design document, not a build
log** — see [ARCHITECTURE.md](ARCHITECTURE.md) for what's actually
implemented today. Nothing in this document is built yet except where
explicitly noted.

## Why this exists

The marketing site describes a 5-product pipeline — strategy → data →
infrastructure → application → integration — but today that's narrative
only. Only Cob has a real backend (a 6-domain AI-strategy blueprint
generator). This document is the conceptual schema for how the other four
products actually connect to a customer's real engineering process, worked
through one concrete automotive use case so it's provably not hand-wavy,
then generalized so the same schema covers any customer's methodology —
not just automotive, and not just ASPICE shops.

## The two-axis model

Two other "stage" concepts already exist elsewhere in this codebase and
must not be confused with what follows:

- The homepage's 7-item **product pipeline** visual (Business Problem → AI
  Blueprint(Cob) → Data Ready(Aria) → AI Infrastructure(Arth) → AI
  Application(Eame) → Enterprise Integration(Yusu) → Working AI Solution).
- The homepage's 5-item **AI maturity** ladder (AI Scramble → ... →
  AI-Fueled Enterprise) — a different axis: organizational readiness, not
  engineering process.

This document introduces a *third*, orthogonal axis: the customer's own
**engineering lifecycle**. It's named **"V&V Stage"** — reusing the exact
vocabulary Eame's own product page already uses ("mapped to your V&V
model") rather than inventing new terminology.

The schema is the composition of two axes:

- **Svarg product pipeline** (Cob / Aria / Arth / Eame / Yusu) — *who* does
  the work.
- **V&V Stage** (Requirements → ... → Validation) — *where* in the
  customer's engineering process the work lands.

A specific engagement is a set of (V&V Stage × product-pipeline) cells that
have actually been built out — today, exactly one cell is fully built:
Integration & System Testing × Eame's Debugging Agent.

## 1. V&V Stage registry — fixed, code-owned

A small, closed taxonomy, not a database collection — adding a stage is a
deliberate product decision, not something that happens at runtime. Same
pattern as `backend/trunida-backend/config/domainRegistry.js`'s `DOMAINS`
array. Reuses Eame's 6 already-shipped stage labels verbatim, plus one
reserved slot for the phase the built product doesn't cover yet:

| Order | V&V Stage | Status |
|---|---|---|
| 1 | Requirements | Built |
| 2 | Architecture & Design | Built |
| 3 | Implementation | Built |
| 4 | Unit Testing | Built |
| 5 | Integration & System Testing | Built — **Debugging Agent, proven** |
| 6 | Acceptance & Validation | Built |
| 7 | Release / Deployment | **Reserved** — no agent yet |

Why the reserved 7th slot: the real KPIT engagement narrative ends
"...Testing and Validation → Vehicle Release," but Eame's Validation Agent
is described as "closing the loop back to where the V began" — the built
product currently stops at Validation. Rather than invent a Release agent
that doesn't exist, the slot is reserved and marked honestly, matching the
same honesty already on Eame's own page ("the Debugging Agent is proven;
the rest are the direction, not a finished catalog").

## 2. Process Model Mapping — admin-curated, open

This is the actual generalization mechanism. A customer's specific
methodology is never hardcoded logic — it's a lookup table translating
that methodology's own phase names/IDs onto the fixed V&V Stage registry
above. This mirrors the admin-curated, draft-then-approve pattern already
used for `CompanyResearchLibrary.capabilityMap` (industry challenge →
company capability → mechanism): open-ended and extendable by an admin
filling out a mapping, not a code change, unlike the closed V&V Stage
registry above.

### ASPICE V-Model

Stage-specific mapping, from the standard Automotive SPICE process
reference (SYS/SWE process groups run the two parallel V-shapes; verify
against your own VDA PAM copy before treating as final):

| V&V Stage | ASPICE process area(s) |
|---|---|
| Requirements | SWE.1 — Software Requirements Analysis |
| Architecture & Design | SWE.2 — Software Architectural Design, SWE.3 — Detailed Design |
| Implementation | SWE.3 — Unit Construction |
| Unit Testing | SWE.4 — Software Unit Verification |
| Integration & System Testing | SWE.5 — Software Integration & Integration Test, SYS.4 — System Integration & Integration Test |
| Acceptance & Validation | SWE.6 — Software Qualification Test, SYS.5 — System Qualification Test |
| Release / Deployment | *(reserved — no ASPICE area assigned yet)* |

Plus a **cross-cutting** set that applies continuously across every stage
rather than at one point on the V — not force-mapped onto a single row:
ACQ (customer-supplier agreement), SUP (quality assurance, verification,
configuration & problem-resolution management — e.g. SUP.9), MAN
(project/risk management), REU (reuse), PIM (process improvement).

### Simple V-Model

No process IDs, same shape — a straight 1:1 onto the same 6 V&V Stages, no
sub-splitting:

Requirements → Design → Code → Unit Test → Integration Test → Acceptance
Test.

### Waterfall

Same underlying stage set, presented linearly instead of V-shaped:

Requirements → Design → Implementation → Testing → Deployment →
Maintenance.

("Testing" in a simple waterfall's coarser phase model spans Unit Testing
+ Integration & System Testing + Acceptance & Validation; "Deployment"
maps to the reserved Release / Deployment stage.)

### Extending to a new methodology

Adding a 4th methodology (Agile/SAFe, or a customer's own homegrown
process) means adding one new mapping entry to this table — no schema
change, no new code path.

## 3. Product-role rule

One rule, applied uniformly — not different treatment per product. Both
Eame's and Yusu's own marketing copy already describe this in prose:

> "Cob defines the strategy. Aria prepares the data. Arth provides the
> model and compute. Eame is what turns all three into an agent... Yusu
> wires it into the tools your team already uses."

**Cob acts once, above the V&V Stage loop.** Its job is not "act at Stage
1" — it's to *select which V&V Stage(s) get an agent built at all*. This
matches Cob's real, already-built backend: the 2-stage `businessProblems →
aiOpportunities` pipeline, referencing `CompanyResearchLibrary.
capabilityMap` (industry challenge → company capability → mechanism). For
a given customer, Cob's output ranks which of the 6 V&V Stages is worth
building an agent for next.

**Aria → Arth → Eame → Yusu is one uniform sub-pipeline, repeated once per
V&V Stage Cob selected:**

```
Cob (once)
  └─ selects & ranks V&V Stage(s)
        │
        ▼  (repeated per selected stage)
      Aria  → prepares the data that stage's agent needs
        │
        ▼
      Arth  → provisions the model/compute that stage's agent needs
        │
        ▼
      Eame  → the purpose-built agent that executes the stage
        │
        ▼
      Yusu  → delivers the agent's output into the team's existing tool
```

**Arth's role for a v1 trial is trivial**: assign a frontier LLM
identifier to the engagement — no real provisioning logic needed yet.
Consistent with, not new relative to, Arth's existing "frontier by
default, sovereign as gated exception" marketing positioning.

This is why Integration & System Testing (Debugging) is the only "proven"
stage today: it's the one stage where all four legs of the sub-pipeline
were actually built end-to-end, not a different category of product
involvement from the other five stages — just further along.

## 4. Document-Need Profiles — what each stage's agent actually needs

Before Aria can "prepare the data," something has to define *what data*.
This is a fixed, code-owned registry — same pattern as the V&V Stage
registry above — stating which document *types* each stage's agent needs
to reason well. Explicitly a Svarg-defined constant, not admin-curated:
this doesn't vary by customer, only by stage.

Sketched from each stage's real Eame catalog copy (`eame.html`), using a
6-type vocabulary reused across stages rather than inventing one type per
stage — `requirements`, `architecture`, `standard`, `code`, `test_case`,
`bug_ticket`:

| V&V Stage | Agent | Needs (docTypes) | Why |
|---|---|---|---|
| Requirements | Requirements Agent | requirements, standard | Checks completeness/consistency/traceability — needs the requirements themselves and a norm to check against. |
| Architecture & Design | Design Review Agent | requirements, architecture, standard | "Reviews architecture and design decisions **against requirements and standards**" — explicit in the product copy. |
| Implementation | Code Agent | requirements, architecture, code | "Understands legacy code, assists with implementation" — needs the code plus the context it's implementing against. |
| Unit Testing | Unit Test Agent | requirements, code, test_case | Generates/reviews unit tests **against the implementation** — needs code, plus existing test cases to review. |
| Integration & System Testing | Debugging Agent (proven) | requirements, test_case, bug_ticket, architecture, code | Matches failed tests to historical defects — needs the widest set of any stage. |
| Acceptance & Validation | Validation Agent | requirements, test_case | "Checks final behavior **against the original requirements**, closing the loop back to where the V began." |

Two things this generalization confirms, not assumes:
- **`requirements` is universal** — every stage needs it, which matches
  ASPICE's own bi-directional traceability emphasis (SUP.10) rather than
  being an artifact of this design.
- **`code` is needed by 3 of 6 stages** (Implementation, Unit Testing,
  Debugging), not just Debugging — confirming code ingestion is a
  foundational, cross-cutting need, not a Debugging special case (see
  section 7 below).

## 5. Cob's gap-report mechanism

After Opportunity Discovery ranks a V&V Stage (already-shipped behavior —
Cob's real 2-stage `businessProblems → aiOpportunities` pipeline), Cob
diffs that stage's Document-Need Profile against the actual classified
`docType`s of what the user has linked so far, producing a gap report:

> "Debugging needs requirements + test_case + bug_ticket + architecture +
> code; you've linked requirements + architecture; missing test_case,
> bug_ticket, code."

This gap report is what Aria consumes (section 6) — the "Data Readiness
domain" hand-off.

**Implementation note, not building yet**: this requires extending the
existing `docType` enum (`architecture, requirements, design,
presentation, meeting_notes, other` — real today, but only on the
org-wide `KnowledgeDocument` path) to add `test_case`, `bug_ticket`,
`code`, `standard`. It also requires fixing a real gap found during
research: `LinkedProjectDocument`'s personal per-blueprint linking path
already calls `classifyDocument` but currently discards the result — the
model has no `docType` field. The gap-report diff needs `docType`
persisted on both the org-wide and personal paths, not just one.

## 6. Aria closes the gap

Aria's job, formalized: read Cob's gap report, and close it — either by
connecting more/different sources, or by transforming what already exists
into the shape the stage's agent needs (e.g. structuring a raw
bug-tracker export, extracting relevant code context). Output: a
"stage-ready dataset" confirming what's now available against the
Document-Need Profile.

**Degrades gracefully, doesn't block.** This matches the existing KB
philosophy already documented in [ARCHITECTURE.md](ARCHITECTURE.md)
("Core always present, everything else additive, degrades gracefully to
nothing if absent"). A gap report informs the user; it never prevents
Eame from instantiating an agent with partial data — quality varies with
completeness, but nothing hard-blocks.

## 7. Code ingestion — a new, cross-cutting source

Section 4 showed code is needed by half the built stages, not just
Debugging — so it's designed in now rather than deferred. Reuses the
existing Confluence dual-path pattern exactly, rather than inventing a
new integration shape (the codebase already solved "let a user connect
an external source, org-wide or personal" twice):

- **`GitHubConnection`** (org-wide, admin-gated OAuth, mirrors
  `ConfluenceConnection`) and **`PersonalGitHubConnection`** (per-user,
  mirrors `PersonalConfluenceConnection`) — same encrypted-token,
  discovered-repos-then-selected-repos shape.
- The frontend already has a disabled "GitHub — Coming soon" card on
  `frontend/profile-setup/profile.html` — the natural place this gets
  enabled.

**Two open questions, deliberately not resolved here** (see "Open
questions for review" below):
- Unlike a Confluence page (one embedding per page), code's
  extraction/matching unit needs more thought — file-level? diff/blame
  near historical defects? Something else?
- `standard` (design/coding standards) is a new doc type with no obvious
  existing source — where would it come from?

## 8. Worked example — KPIT, Debugging Agent, end to end

Real automotive customer (KPIT, delivering for CARIAD/BMW/Mercedes),
grounded in real seeded content
(`backend/trunida-backend/scripts/update_operating_model.mjs`,
`update_ai_roi.mjs`):

1. **Cob** ranks "Integration & System Testing" as the highest-value V&V
   Stage, referencing KPIT's real described pain point — "the integration,
   system validation, and release phases of the V-Model are the highest
   cost phases of KPIT's fixed-price delivery" — against its
   `capabilityMap`.
2. **Aria** prepares historical defect/triage data. This data doubles as
   `SUP.9` (Problem Resolution Management) history, not just test data —
   worth naming both process areas in the mapping since it makes the
   ASPICE tagging demonstrably more complete to an ASPICE-literate
   reviewer.
3. **Arth** provisions the model/compute the matching task needs.
4. **Eame**'s Debugging Agent — "matches failed tests against historical
   defects to suggest a likely root cause" — tagged `{SWE.5, SYS.4,
   SUP.9}`. The one agent in the catalog that's actually proven on a real
   engineering case, not conceptual.
5. **Yusu** delivers the suggested root cause into KPIT's existing
   ticketing/IDE tool — not a separate portal that gets ignored.

Every other V&V Stage (Requirements, Architecture & Design, Implementation,
Unit Testing, Acceptance & Validation) follows the identical five-step
shape once Cob ranks it next and the Aria/Arth/Eame/Yusu sub-pipeline gets
built out for it.

## 9. Fast-follow: MongoDB schema sketch

**Not implemented — a sketch only**, to make a future build fast, not a
spec to build against verbatim. Modeled on the real, already-shipped
pattern in `backend/trunida-backend/models/CompanyResearchLibrary.js`
(embedded sub-schemas, `{ _id: false }`, a stable `*Id` slug plus a display
`*Name`, draft/approved split for admin-curated content):

```js
// backend/trunida-backend/config/vvStageRegistry.js
// Closed set — same shape/pattern as DOMAINS in domainRegistry.js
export const VV_STAGES = [
  { stageId: 'requirements',       stageName: 'Requirements',              order: 1, status: 'built' },
  { stageId: 'architecture-design',stageName: 'Architecture & Design',     order: 2, status: 'built' },
  { stageId: 'implementation',     stageName: 'Implementation',            order: 3, status: 'built' },
  { stageId: 'unit-testing',       stageName: 'Unit Testing',              order: 4, status: 'built' },
  { stageId: 'integration-system', stageName: 'Integration & System Testing', order: 5, status: 'built' },
  { stageId: 'validation',         stageName: 'Acceptance & Validation',   order: 6, status: 'built' },
  { stageId: 'release-deployment', stageName: 'Release / Deployment',      order: 7, status: 'reserved' },
];
```

```js
// models/ProcessModel.js — new collection, admin-curated (open set)
// One document per named methodology (ASPICE V-Model, Simple V-Model,
// Waterfall, or a customer-specific one an admin adds later).
{
  processModelId: String,        // e.g. 'aspice-v-model'
  name:           String,        // display name
  shape:          'v-model' | 'waterfall',
  stageMapping: [{
    customerPhaseLabel: String,  // e.g. 'Software Integration & Integration Test'
    customerPhaseId:    String,  // e.g. 'SWE.5' — empty for Simple V-Model
    vvStageId:          String,  // FK into VV_STAGES
    scope: 'stage-specific' | 'cross-cutting',
  }],
}
```

```js
// models/UseCaseEngagement.js — one per customer/objective
{
  orgName:         String,
  processModelId:  String,       // FK into ProcessModel
  cobOpportunityRef: ObjectId,   // links back to Cob's TransformationBlueprint/aiOpportunities output

  // Embedded, one per V&V Stage Cob selected — the uniform sub-pipeline
  stageOpportunities: [{
    vvStageId: String,
    rank:      Number,
    ariaDataPrep:      { /* what data this stage's agent needs, source, status */ },
    arthProvisioning:  { /* what model/compute this stage's agent needs */ },
    eameAgent:         { agentType: String, proven: Boolean },
    yusuDelivery:       { targetTool: String },
  }],
}
```

## Open questions for review

1. Does the ASPICE SWE/SYS/SUP mapping in section 2 match your own VDA PAM
   knowledge? It's grounded in standard ASPICE structure but is worth a
   direct check against the reference you actually use with customers.
2. Is the KPIT worked example (section 8) directionally accurate to what
   you'd actually tell that account? It's grounded in real seeded content
   in the two scripts cited, but you know the relationship better than
   this codebase does.
3. Is "V&V Stage" the right term to standardize on, given it's also
   customer-facing on the Eame product page — or should the internal
   schema term differ from the external marketing term?
4. Code ingestion's extraction/matching unit (section 7) — file-level?
   diff/blame near historical defects? Something else? Not designed yet.
5. Where would `standard` (design/coding standards, section 4) documents
   actually come from — uploaded once at org setup, or linked per-blueprint
   like everything else?
