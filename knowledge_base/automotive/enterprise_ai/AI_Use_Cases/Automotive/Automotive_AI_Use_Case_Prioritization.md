# Automotive AI Use Case Prioritization

**Layer:** Automotive
**Extends:** Core/AI_Use_Case_Prioritization.md
**Version:** 1.0

---

## Purpose

This document applies the Core AI Use Case Prioritization framework — Business Value Assessment, Technical Feasibility & Data Readiness, and Organizational Impact & Pilot Recommendation — to automotive software programs, with scoring benchmarks, worked examples, and specific guidance for the automotive engineering context.

Prioritization in automotive programs must account for industry-specific factors: program governance gates, safety review obligations for Product AI, supplier data access constraints, and the multi-stakeholder complexity of OEM-supplier-services delivery chains.

> For the universal prioritization framework, refer to: `Core/AI_Use_Case_Prioritization.md`

---

## Automotive Prioritization Context

Several automotive-specific factors affect how use cases are scored:

* **Program timeline pressure**: AI use cases that can deliver value within the current program cycle are scored higher than those requiring a multi-year data preparation programme.
* **Existing data infrastructure**: Programs using structured tools (Jira, Polarion, DOORS, ALM, Confluence) have high baseline data readiness. Programs with informal, document-based processes have lower data readiness regardless of data volume.
* **Safety and compliance gate**: Product AI use cases in automotive must pass safety assessment before they can be piloted in a live vehicle or customer context. This adds months to the delivery timeline and is a significant organizational impact factor.
* **Supplier program constraints**: Use cases involving supplier data, supplier processes, or supplier system integration carry additional organizational impact due to contractual, access, and governance constraints.

---

## Business Value Assessment in Automotive

### Automotive Business Value Scoring Guide

| Score | Criteria | Automotive Examples |
|---|---|---|
| **High** | Time reduction ≥ 40%, measurable quality improvement with quantified baseline, or strategic capability enabling multiple downstream use cases | Defect pre-analysis (75% time reduction + 25pp accuracy improvement); Test case generation (65% reduction + coverage improvement) |
| **Medium** | Time reduction 15–40%, quality improvement measurable but modest, or productivity gain for a small team | Requirements gap checking (40% review time reduction); Meeting summarisation (80% reduction but low program impact) |
| **Low** | Time reduction < 15%, quality impact not quantified, or value limited to convenience | AI-assisted formatting of existing documents; Basic document search improvement |

### Business Value Assessment — Bug Analysis Example

**Score: High**

Justification:
* Effort reduction: 75% reduction in analysis time per defect cycle (from 8 hours to 2 hours). Across 20–40 defects per sprint, this frees 120–240 hours of engineering capacity.
* Quality improvement: First-assignment accuracy improves from 55% to 80%+, reducing re-assignment rework by approximately 60%.
* Knowledge reuse: Junior engineers perform at 70–80% of senior engineer quality with AI assistance, reducing senior dependency.
* Strategic value: Establishes the data infrastructure and AI delivery capability that enables downstream use cases in root cause prediction and release risk scoring.

---

## Technical Feasibility & Data Readiness in Automotive

### Automotive Technical Feasibility Scoring Guide

| Score | Criteria | Notes |
|---|---|---|
| **High** | Well-understood AI pattern (classification, summarisation, routing); proven in comparable automotive or software contexts; available tooling (LLM APIs, vector search, standard classifiers) | Most defect management, requirements review, and test generation use cases |
| **Medium** | Clear AI pattern but requires custom model training, novel data combination, or integration with non-standard systems | Root cause prediction requiring custom classification; multi-system data fusion |
| **Low** | Requires AI research capability not yet mature; real-time vehicle system integration; physical world understanding | Autonomous system parameter tuning; real-time sensor-based anomaly detection |

### Automotive Data Readiness Scoring Guide

| Score | Criteria | Notes |
|---|---|---|
| **High** | Data exists in structured tools (Jira, Polarion, DOORS, ALM); accessible without data governance constraints; 12+ months of history available; minimal preparation required | Standard automotive software program using structured defect and requirements tools |
| **Medium** | Data exists but requires significant cleaning, de-duplication, or labelling; partial historical coverage; requires integration work across multiple tools | Programs with mixed tool usage; recently migrated tools; sparse historical labelling |
| **Low** | Data is missing, in unstructured format (email, documents), inaccessible due to contractual constraints, or insufficient in volume | Early-stage programs; supplier data with access restrictions; paper-based or informal processes |

### Technical Feasibility & Data Readiness — Bug Analysis Example

**Technical Feasibility: High**

* The core AI pattern — multi-label classification, entity extraction, and structured summarisation from text — is well-understood and fully supported by current LLM APIs and retrieval-augmented generation (RAG) tooling.
* Similar use cases have been successfully deployed in comparable software engineering and IT service management contexts.
* No novel AI research is required. The use case can be built using standard retrieval and classification tooling integrated with the existing Jira API.

**Data Readiness: High**

* Jira contains the full defect history: titles, descriptions, severity ratings, current assignments, resolved-by teams, and resolution notes.
* Historical data volume: typically 3–5+ years of defect records in active automotive programs — more than sufficient for retrieval-augmented classification.
* Data access: Jira API is accessible with standard program credentials. No special data governance approval required for internal program data.
* Data quality: defect descriptions vary in quality but historical resolution data provides reliable ground truth for classification and routing.

**Combined Score: High — no pre-conditions blocking the pilot.**

---

## Organizational Impact & Pilot Recommendation in Automotive

### Automotive Organizational Impact Scoring Guide

| Score | Criteria | Automotive Examples |
|---|---|---|
| **Low** | Single team workflow augmentation; no process redesign; no cross-team coordination; sponsor is the team lead | Meeting summarisation; individual code review assistance; release note generation |
| **Medium** | Multiple teams involved; workflow adjustment required; program-level sponsor needed; moderate change management | Defect pre-analysis (engineering + QA teams); requirements gap checking (systems + software teams) |
| **High** | Function-level process change; cross-program or OEM-supplier coordination; senior sponsor required; Product AI safety review | Defect routing redesign at program level; supplier quality AI integration; Product AI in vehicle systems |

### Pilot Design Guidance for Automotive Programs

| Pilot Scope | What It Means | When to Use |
|---|---|---|
| Single team, one sprint | AI augments one engineer role for one sprint cycle | Productivity AI use cases; initial feasibility validation |
| One workflow, one program cycle | AI processes all inputs for one complete defect management or test cycle | Functional AI use cases; quality measurement requires full cycle |
| Cross-team, one quarter | AI is integrated into a shared workflow across teams | Medium-high organizational impact; requires program sponsor |
| Program-wide deployment | AI is part of the standard delivery process | Post-pilot production deployment; success metrics validated |

### Pilot Recommendation — Bug Analysis Example

**Organizational Impact: Medium**

* The defect pre-analysis use case affects the engineering team (defect analysts) and the QA/quality function (assignment accuracy improvement).
* Workflow adjustment is required: the process must be updated to include AI pre-analysis as a standard step before human review.
* A program-level sponsor is needed to authorize the workflow change and communicate expectations to both teams.
* No cross-supplier or OEM coordination is required for the pilot scope.

---

**Pilot Recommendation: HIGH PRIORITY**

**Summary Scorecard:**

| Dimension | Score | Key Evidence |
|---|---|---|
| Business Value | High | 75% effort reduction + 25pp accuracy improvement + knowledge reuse |
| Technical Feasibility | High | Well-understood LLM classification and RAG pattern; proven in comparable contexts |
| Data Readiness | High | Jira defect history available; no access constraints; 3–5 year historical data volume |
| Organizational Impact | Medium | Two teams affected; workflow adjustment required; program sponsor needed |

**Recommendation:**

This use case is approved for immediate pilot. The business value is high, the AI approach is technically proven, and the required data is immediately accessible. Organizational impact is manageable with a program-level sponsor and clear communication of the workflow change to both teams.

**Pre-conditions before pilot start:**

1. Program sponsor identified and briefed (responsible for authorizing workflow change).
2. Baseline metrics recorded: current time-per-defect-analysis, current first-assignment accuracy rate.
3. Jira API access confirmed for the pilot team's project.
4. Pilot measurement plan agreed: 20 defects minimum in pilot group and comparison group.
5. Engineer participation agreed: at least 4 engineers participating in the AI-assisted workflow for the pilot sprint.

**Pilot Duration:** Two sprint cycles (recommended) to accumulate sufficient defect volume for statistical validity of quality metrics.

**Success Criteria:**
* Time reduction: average defect analysis time reduced from 8 hours to ≤ 3 hours per cycle.
* Assignment accuracy: first-assignment accuracy ≥ 72% (current baseline: 55%).
* Engineer satisfaction: positive qualitative feedback from ≥ 3 of 4 participating engineers.

**Next Steps after Successful Pilot:**
* Expand to full program team.
* Extend scope to root cause prediction (next use case in the pipeline).
* Begin data collection for defect risk scoring use case.
