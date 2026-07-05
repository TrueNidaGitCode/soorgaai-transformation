# SoorgaAI — Capability Build Playbook

**Purpose:** Step-by-step guide to add a new capability to any domain. Follow this for every new capability across AI Strategy, AI Use Cases, Data Readiness, and future domains.

---

## What You Are Building

Each capability requires four deliverables:

| # | Deliverable | Who Creates | Where It Lives |
|---|-------------|-------------|----------------|
| 1 | Core Asset KB file | You (content) | `knowledge_base/automotive/enterprise_ai/[Domain]/Core/` |
| 2 | Automotive Layer KB file | You (content) | `knowledge_base/automotive/enterprise_ai/[Domain]/Automotive/` |
| 3 | UI template PDF | You (design in Gamma or Figma) | Shared with Claude for implementation |
| 4 | Backend + Frontend wiring | Claude (code) | `blueprintGenerationService.js` + `blueprintWorkspace.js` + `domain.css` |

---

## Part 1 — Core Asset KB File

### File path

```
knowledge_base/automotive/enterprise_ai/[Domain]/Core/[CapabilityName].md
```

Example: `Core/Critical_Data_Identification.md`

### Required structure (exact heading format)

```markdown
# [Capability Name]

## Purpose

[1–2 paragraphs: what this capability does and why it matters for PMs]

---

# 1. [Capability Name]

## Definition

[2–3 sentences: what the AI analyses, what it produces]

## Framework

[Intro sentence]

### 1. [Framework Dimension]

[Description]

**Typical examples**

- item
- item

---

### 2. [Framework Dimension]

...

## Key Principles

- **[Principle]** — [explanation]
- **[Principle]** — [explanation]

## Leadership Question

**[The question the capability answers for a PM or CTO]**

---

# [Other Section Title]

[Non-rendered content — used as LLM context only]
```

### Critical parser rules

| Rule | Requirement |
|------|-------------|
| Document title | `# [Capability Name]` — non-numbered h1, no digit |
| Pillar trigger | `# 1. [Capability Name]` — **must** have `# digit. ` prefix |
| Sub-sections | `## Definition`, `## Framework`, `## Key Principles`, `## Leadership Question` |
| Framework items | `### 1. Name`, `### 2. Name`, etc. |
| LLM-only sections | Any additional `# Non-numbered Title` after the pillar (e.g., `# Decision Criteria`, `# AI Reasoning Process`, `# Blueprint Output`) |

**The numbered pillar heading `# 1. [Name]` is mandatory.** Without it, `parsePillarSections()` finds zero pillars and the capability produces no section card.

### What NOT to use as a pillar heading

```markdown
# Capability Card           ← WRONG — not numbered, wrong name
## 1. [Name]                ← WRONG — ## is not h1
# 1 [Name]                  ← WRONG — missing period after digit
```

---

## Part 2 — Automotive Layer KB File

### File path

```
knowledge_base/automotive/enterprise_ai/[Domain]/Automotive/Automotive_[CapabilityName].md
```

Example: `Automotive/Automotive_Critical_Data_Identification.md`

### Required structure (exact heading format)

```markdown
# Automotive Layer – [Capability Name]

## Purpose

[1–2 paragraphs: what automotive context this layer adds]

> For the universal framework, refer to: `Core/[CapabilityName].md`

---

## [Capability Name] in Automotive

[1–2 sentences introducing the automotive-specific definition]

### 1. [Framework Dimension]

[Automotive-specific detail for this dimension]

**Typical examples**

- item
- item

---

### 2. [Framework Dimension]

...

## Automotive Best Practices

- [Practice]
- [Practice]

---

## [Other Sections]

[Common tools, engineering context, expected outcome, etc.]
```

### Critical parser rule

The `## [Capability Name] in Automotive` heading is the **exact trigger** for `findIndustryMatch()`. 

- The heading must use `##` (h2), not `#` or `###`
- The capability name must match the Core pillar title exactly (case-insensitive, but keep the same wording)
- The phrase `in Automotive` must follow the name

```markdown
## Critical Data Identification in Automotive    ← CORRECT
# Critical Data Identification in Automotive     ← WRONG — h1 not h2
## Critical Data in Automotive                   ← WRONG — name doesn't match pillar
```

Without this heading, no automotive context is injected into the LLM prompt.

---

## Part 3 — Domain Specification File Update

Each domain has a spec file (e.g., `Core/Data_Readiness_Intelligence_Specification.md`) that contains the capability table `extractCapabilities()` reads.

### Required table format

```markdown
| Domain                          | Primary Objective                    |
| ------------------------------- | ------------------------------------ |
| [Capability Name]               | [One sentence: what it does]         |
| [Capability Name 2]             | [One sentence]                       |
```

### Critical rule

The first column header **must** be `| Domain |`. The parser regex is `\| Domain\s*\|` and will not match `| Capability |`, `| Name |`, or any other label.

The capability names in the table must exactly match:
- The `# 1. [Name]` heading in the Core file
- The key you will use in `SECTION_TEMPLATES`
- The string you will use in `buildSectionCard()` routing

---

## Part 4 — Backend: SECTION_TEMPLATES Entry

### File

```
backend/trunida-backend/services/blueprintGenerationService.js
```

### Where to add

Find the closing `};` of the `SECTION_TEMPLATES` object (the last entry ends with `},` then `};`). Add your entry **before** the `};`.

### Template pattern

```js
'[Capability Name]': {
  promptInstruction: `
SECTION-SPECIFIC EXTRAS — "[Capability Name]" sections only:

5. [fieldName] ([count or shape])
   [What the LLM should generate for this field.]
   Each item: { "field1": "...", "field2": "...", ... }

6. [fieldName2]
   [Description]
   Object: { "key1": [...], "key2": [...] }

7. [fieldName3] (exactly N items)
   [Description]
   Each item: { "text": "...", "priority": "HIGH|MEDIUM|LOW" }

   Add all to the brief object:
   "[fieldName]": [...], "[fieldName2]": {...}, "[fieldName3]": [...]`,
},
```

### Rules for writing the promptInstruction

- Fields 1–4 are standard (strategicPosition, priorityActions, successMetrics, leadershipValidation) — do not define them here
- Start custom fields at **5**
- Always specify exact count when needed (`exactly 7 items`, `exactly 3 items`)
- Always specify the data shape as a JSON example inline
- Use `"HIGH|MEDIUM|LOW"` pipe syntax to constrain enum values
- End with the `Add all to the brief object:` summary line listing all field names

---

## Part 5 — Backend: parseBriefOutput Normalization

### Where to add

In `parseBriefOutput()`, find the comment block:

```js
// ── AI Use Cases parsers ───────────────────────────────────────────────
```

Add a new comment block after the last AI Use Cases parser block and before `return {`:

```js
// ── [Domain]: [Capability Name] parsers ──────────────────────────────────
```

### Normalization patterns by field type

**Array of objects:**
```js
const raw[FieldName] = Array.isArray(b.[fieldName]) ? b.[fieldName] : [];
const [fieldName] = raw[FieldName]
  .filter(x => x && typeof x === 'object' && String(x.[keyField] || '').trim())
  .map(x => ({
    [keyField]:  String(x.[keyField]  || '').trim(),
    [field2]:    String(x.[field2]    || '').trim(),
    [enumField]: String(x.[enumField] || 'DEFAULT').trim(),
  }))
  .slice(0, [maxCount]);
```

**Object with array values:**
```js
const raw[FieldName] = b.[fieldName] && typeof b.[fieldName] === 'object' ? b.[fieldName] : {};
const [fieldName] = {
  key1: Array.isArray(raw[FieldName].key1) ? raw[FieldName].key1.map(String).filter(Boolean) : [],
  key2: Array.isArray(raw[FieldName].key2) ? raw[FieldName].key2.map(String).filter(Boolean) : [],
};
```

**Object with number values:**
```js
const raw[FieldName] = b.[fieldName] && typeof b.[fieldName] === 'object' ? b.[fieldName] : {};
const [fieldName] = {
  count:      parseInt(raw[FieldName].count,      10) || 0,
  confidence: parseInt(raw[FieldName].confidence, 10) || 0,
};
```

**Simple string:**
```js
const [fieldName] = typeof b.[fieldName] === 'string' ? b.[fieldName].trim() : '';
```

**Simple string array:**
```js
const [fieldName] = Array.isArray(b.[fieldName])
  ? b.[fieldName].map(String).filter(Boolean).slice(0, [max]) : [];
```

### Add spread to the return block

In the `return { ... }` inside `parseBriefOutput()`, add entries after the `spokeNodes` spread:

```js
// [Domain]: [Capability Name] extras
...(datasets.length          ? { datasets }        : {}),
...(recommendations.length   ? { recommendations } : {}),
...(coverageSummary.someKey  ? { coverageSummary } : {}),
...((obj.key1.length || obj.key2.length) ? { obj } : {}),
```

Use the guard that makes sense for each field type — arrays check `.length`, objects check a required key, strings check truthiness.

---

## Part 6 — Frontend: Renderer Function

### File

```
frontend/domain/blueprintWorkspace.js
```

### Where to add

Add the renderer function immediately before `function buildSectionCard(...)`. Each capability gets its own comment block and function.

### Function name pattern

```
build[CapabilityName]Layout(section)
```

Remove spaces and use PascalCase. Examples:
- `Critical Data Identification` → `buildCriticalDataLayout`
- `AI Data Readiness` → `buildAIDataReadinessLayout`
- `Data Architecture Readiness` → `buildDataArchitectureLayout`

### Function skeleton

```js
// ── [Domain] — [Capability Name] ────────────────────────────────────────────

function build[Name]Layout(section) {
  const b     = section.brief || {};
  const [field1] = b.[field1] || [];
  const [field2] = b.[field2] || {};
  const [field3] = b.[field3] || [];

  const wrap = document.createElement('div');
  wrap.className = '[prefix]-view';

  // Strategic position (standard — include in every renderer)
  if (b.strategicPosition) {
    const pos = document.createElement('p');
    pos.className = '[prefix]-view__position';
    pos.textContent = b.strategicPosition;
    wrap.appendChild(pos);
  }

  // --- Build your layout here based on the PDF template ---
  // Left panel, right panel, bottom bar, etc.

  return wrap;
}
```

### CSS class prefix convention

Pick a 3-letter prefix that abbreviates the capability. Add it to every class in this renderer and in the CSS. Examples:

| Capability | Prefix |
|-----------|--------|
| Critical Data Identification | `cdi-` |
| AI Data Readiness | `adr-` |
| Data Architecture Readiness | `dar-` |

### Common layout patterns from existing renderers

| Layout | Example | Use when |
|--------|---------|----------|
| Two-column grid | `cdi-body` (Critical Data Identification) | Left cards + right panel |
| KPI stat tiles | `bp-kpis` (Vision) | 3 headline numbers |
| Horizontal flow | `opp-discovery` pipeline | Multi-step process |
| 2×2 matrix | `pri-matrix-grid` (Prioritization) | 4-quadrant scoring |
| Card row | `pri-dim-cards` | 3–4 equal cards |
| Pillar bullets | `com-pillars` (Commitment) | 3–4 themed lists |

---

## Part 7 — Frontend: Routing

### Where to add

In `buildSectionCard()`, find the last `else if` before the catch-all `else { card.appendChild(buildBriefGrid(section)); }`:

```js
    } else if (section.title === 'AI Use Case Prioritization') {
      card.appendChild(buildPrioritizationView(section));
    } else if (section.title === 'Critical Data Identification') {
      card.appendChild(buildCriticalDataLayout(section));
    } else {
      card.appendChild(buildBriefGrid(section));
    }
```

Add your new entry following the same pattern. The `section.title` string must match:
- Exactly what appears in the `# 1. [Name]` heading of the Core file
- Exactly what you used as the key in `SECTION_TEMPLATES`

---

## Part 8 — Frontend: CSS

### File

```
frontend/domain/domain.css
```

### Where to add

Append at the end of the file, with a comment header:

```css
/* ── [Domain] — [Capability Name] ─────────────────────────────────────────── */

.[prefix]-view { ... }
```

### Dark theme values (use consistently)

```css
/* Backgrounds */
background: rgba(255,255,255,0.04);   /* card surface */
background: rgba(255,255,255,0.03);   /* subtle row */

/* Borders */
border: 1px solid rgba(255,255,255,0.08);   /* default */
border: 1px solid rgba(92,197,167,0.3);     /* teal accent */

/* Text */
color: #fff;                          /* primary heading */
color: rgba(255,255,255,0.7);         /* secondary text */
color: rgba(255,255,255,0.55);        /* body text */
color: rgba(255,255,255,0.4);         /* tertiary / muted */
color: rgba(255,255,255,0.35);        /* labels / metadata */

/* Accent (teal) */
color: #5CC5A7;
background: rgba(92,197,167,0.18);
box-shadow: 0 0 22px rgba(92,197,167,0.28);

/* Priority badge colours */
HIGH:   background rgba(239,68,68,0.2);   color #f87171;
MEDIUM: background rgba(234,179,8,0.18);  color #fbbf24;
LOW:    background rgba(92,197,167,0.15); color #5CC5A7;

/* Status badge colours */
AVAILABLE: rgba(92,197,167,0.12)  / #5CC5A7
MISSING:   rgba(239,68,68,0.12)   / #f87171
PARTIAL:   rgba(234,179,8,0.12)   / #fbbf24
```

### Responsive rule (add at the bottom of each block)

```css
@media (max-width: 900px) {
  .[prefix]-body {
    grid-template-columns: 1fr;
  }
}
```

---

## Checklist — One Capability End to End

Work through this list top to bottom. Each step must be complete before the next.

### Content (you do this)

- [ ] Core Asset KB file created at `Core/[Name].md`
  - [ ] `# [Name]` document title (non-numbered)
  - [ ] `## Purpose` section
  - [ ] `# 1. [Name]` numbered pillar heading
  - [ ] `## Definition`, `## Framework`, `## Key Principles`, `## Leadership Question` sub-sections
  - [ ] LLM-only sections (`# Decision Criteria`, `# Blueprint Output`, etc.) after the pillar
- [ ] Automotive Layer KB file created at `Automotive/Automotive_[Name].md`
  - [ ] `# Automotive Layer – [Name]` document title
  - [ ] `## Purpose` section
  - [ ] `## [Name] in Automotive` trigger heading (h2, exact match)
  - [ ] `### ` subsections for each framework dimension
  - [ ] `## Automotive Best Practices` section
- [ ] Domain Spec file updated
  - [ ] New row added to the `| Domain |` table
  - [ ] Capability name exactly matches Core pillar heading
- [ ] UI template PDF created and shared with Claude

### Code (Claude does this with PDF template)

- [ ] `SECTION_TEMPLATES['[Name]']` entry added to `blueprintGenerationService.js`
  - [ ] All custom fields defined with types, counts, and JSON shapes
- [ ] Normalization blocks added to `parseBriefOutput()` for each new field
- [ ] New field spreads added to the `return { brief: { ... } }` block
- [ ] `build[Name]Layout(section)` renderer function added to `blueprintWorkspace.js`
- [ ] Routing `else if (section.title === '[Name]')` added to `buildSectionCard()`
- [ ] CSS block added to `domain.css` with consistent dark-theme values

---

## Common Mistakes and Fixes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Capability doesn't appear in blueprint | Spec table uses `\| Capability \|` header | Change to `\| Domain \|` |
| Section renders as a plain brief grid | Core file missing `# 1. [Name]` numbered pillar | Add numbered pillar h1 |
| No automotive context in generation | Automotive file missing `## [Name] in Automotive` | Add exact h2 match heading |
| Renderer never called | `section.title` in routing doesn't match Core pillar heading | Align strings exactly |
| LLM returns no custom fields | `SECTION_TEMPLATES` key doesn't match section title | Align key with section title |
| parseBriefOutput strips custom fields | Missing spread entries in return block | Add spread for each new field |

---

## File Path Quick Reference

```
knowledge_base/
└── automotive/
    └── enterprise_ai/
        └── [Domain]/
            ├── Core/
            │   ├── [Domain]_Intelligence_Specification.md   ← capability table (| Domain |)
            │   ├── [Capability1].md                         ← # 1. [Name] required
            │   └── [Capability2].md
            └── Automotive/
                ├── Automotive_[Capability1].md              ← ## [Name] in Automotive required
                └── Automotive_[Capability2].md

backend/trunida-backend/services/
└── blueprintGenerationService.js
    ├── SECTION_TEMPLATES                                    ← add new key entry
    └── parseBriefOutput()                                   ← add normalizers + return spreads

frontend/domain/
├── blueprintWorkspace.js
│   ├── build[Name]Layout(section)                          ← add renderer before buildSectionCard
│   └── buildSectionCard() → else if routing               ← add title match
└── domain.css                                              ← append CSS block at end
```
