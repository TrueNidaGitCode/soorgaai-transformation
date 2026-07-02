# Automotive AI Use Case Classification

**Layer:** Automotive
**Extends:** Core/AI_Use_Case_Classification.md
**Version:** 1.0

---

## Purpose

This document applies the Core AI Use Case Classification framework — Productivity AI, Functional AI, and Product AI — to automotive software programs, with concrete examples and classification guidance for the most common automotive AI use cases.

Classification in automotive software delivery is particularly important because the three value categories carry very different implications for safety review, regulatory compliance, and delivery governance. A Product AI use case in an automotive context may be subject to functional safety requirements under ISO 26262 or SOTIF. This distinction must be made early.

> For the universal classification framework, refer to: `Core/AI_Use_Case_Classification.md`

---

## Classification Context in Automotive

Automotive organizations frequently misclassify their AI use cases at the start of a program. The most common error is labelling an internal engineering productivity use case as a Product AI initiative, which triggers safety, compliance, and governance overhead that the use case does not require and cannot support.

The classification framework must be applied before investment decisions are made. The three categories drive very different delivery approaches, stakeholder ownership requirements, and success metrics.

---

## Productivity AI in Automotive

Productivity AI in automotive software programs reduces the time and cognitive effort that engineers, analysts, and testers spend on knowledge-intensive but repetitive tasks within their existing workflows.

### Common Automotive Productivity AI Use Cases

| Use Case | Current Effort | AI Assistance |
|---|---|---|
| Defect pre-analysis and summarisation | 4–8 hours per defect cycle | AI reads, summarises, and classifies incoming defects automatically |
| Requirements review and gap identification | 2–4 hours per document | AI identifies missing attributes, incomplete traceability, and inconsistencies |
| Test case generation from requirements | 3–5 hours per requirement set | AI generates candidate test cases for engineer review |
| Code review pre-screening | 1–2 hours per review | AI flags defect-prone code segments before human review |
| Meeting summary and action item capture | 30–60 minutes per meeting | AI generates structured summaries and tracked action items |
| Release note generation | 2–3 hours per release | AI compiles change summaries from commit and defect records |

### Classification Confirmation — Bug Analysis Example

The bug pre-analysis use case is classified as **Productivity AI** because:

* The activity — reading, understanding, and classifying incoming defects — is already performed by engineers today.
* AI reduces the time engineers spend on this activity, not the nature of the activity itself.
* The beneficiary is the engineering team, not the end customer.
* The data required — historical defects, classifications, assignments — already exists in Jira.
* No workflow redesign is required: AI outputs are reviewed by the engineer before any action is taken.
* Value is measured in hours saved per defect cycle and throughput increase per sprint.

---

## Functional AI in Automotive

Functional AI in automotive software programs improves the quality, consistency, and decision-making capability of an engineering or business function — not just the speed at which existing tasks are completed.

### Common Automotive Functional AI Use Cases

| Use Case | Function Improved | Quality Metric |
|---|---|---|
| Intelligent defect assignment and routing | Defect management function | Assignment accuracy, time-to-first-response |
| Root cause classification at scale | Quality engineering function | Root cause identification accuracy, rework rate |
| Predictive defect risk scoring | Release management function | Defect escape rate, late-stage detection rate |
| Automated requirements completeness scoring | Requirements engineering function | Completeness score, review cycle time |
| Supplier non-conformance classification | Supplier quality function | Classification consistency, escalation accuracy |
| Regression impact prediction | Test engineering function | Missed regression coverage rate |

### Classification Confirmation — Bug Analysis Example

The bug assignment accuracy improvement is classified as **Functional AI** because:

* The goal is not just to do the routing faster — it is to improve the accuracy of assignment decisions across the defect management function.
* The improvement changes process outcomes: fewer misassignments, faster routing, reduced rework from incorrect team handovers.
* The beneficiary is the defect management function, not just individual engineers.
* The value is measured in process quality metrics — assignment accuracy, time-to-resolution — not just hours saved.
* The pilot requires a full defect management cycle to measure quality improvement, not just a sprint.

### Dual Classification — When Both Apply

The bug analysis use case carries both a Productivity AI and a Functional AI classification because it delivers value on two dimensions simultaneously:

* **Productivity AI**: reduces engineer time per defect from 8 hours to 2 hours.
* **Functional AI**: improves assignment accuracy from approximately 55% to 80%+ and improves consistency across engineer experience levels.

When a use case is dual-classified, both sets of success metrics apply. The pilot must measure both: effort reduction AND quality improvement.

---

## Product AI in Automotive

Product AI in automotive software programs embeds AI capabilities into a customer-facing vehicle system, connected service, or engineering tool used by OEM or supplier customers. This category requires the highest level of governance, safety review, and product ownership.

### Common Automotive Product AI Use Cases

| Use Case | Customer Benefit | Key Requirement |
|---|---|---|
| Predictive maintenance alerts in connected vehicles | Customer vehicle uptime | OEM data integration, safety validation |
| AI-assisted vehicle diagnostics for service technicians | Faster fault resolution | Workshop integration, technician UX validation |
| Intelligent ADAS parameter tuning recommendations | Improved ADAS performance | Functional safety review under ISO 26262 |
| AI-powered warranty claim analysis for dealers | Faster dealer resolution | Legal and data privacy compliance |
| Connected vehicle anomaly detection | Proactive customer notification | OEM fleet data access, privacy governance |

### Classification Warning — Not a Starting Point

Product AI use cases in automotive are **not appropriate as first AI use cases** for teams beginning their AI journey. They require:

* Functional safety assessment for any AI that influences vehicle behaviour.
* Data privacy and GDPR compliance for any use case using customer or vehicle field data.
* OEM customer approval for any AI embedded in customer-facing systems.
* Extended validation and testing cycles before any field deployment.

Teams should build demonstrated Productivity and Functional AI capability before proposing Product AI initiatives.
