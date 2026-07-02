# AI Use Case Prioritization

## Purpose

AI Use Case Prioritization is the final stage of the pipeline. It takes a use case with a defined value proposition and evaluates it against four scoring dimensions to produce a ranked pilot recommendation. The output is not just a score — it is a clear, justified investment decision that a project manager can present to their program leadership.

Prioritization must be consistent across use cases so that a portfolio of opportunities can be compared on equal terms. A scoring framework applied subjectively defeats its own purpose. This capability defines how each dimension is evaluated, what the scoring thresholds mean, and how the four scores combine into a final recommendation.

---

# Core Principles

Prioritization is a consistent scoring framework applied equally to every use case.

1. Business Value Assessment
2. Technical Feasibility & Data Readiness
3. Organizational Impact & Pilot Recommendation

Together, these three sections define the full scorecard and translate it into an actionable investment decision.

---

# 1. Business Value Assessment

## Definition

Business Value Assessment scores how much measurable business impact the AI use case is expected to deliver, informed by the effort reduction, quality improvement, and knowledge reuse quantification from the Business Value Definition stage.

The score is not an opinion — it is derived from the quantified value targets established in the previous pipeline stage. A use case with a documented 75% reduction in analysis time, a clear quality improvement metric, and a measurable knowledge reuse benefit should score High on business value. A use case where the value has not been clearly defined scores Low regardless of how technically interesting the AI problem is.

Business value is the most important of the four scoring dimensions. It is the primary driver of prioritization decisions. Technically feasible use cases with low business value should not be prioritized.

## Key Principles

* Score business value based on the quantified outcomes from the Business Value Definition stage — not on intuition or stakeholder enthusiasm.
* Apply a three-level scale: High, Medium, or Low.
* High: documented time reduction of 40% or more, clear quality improvement metric, or strategic capability that unlocks multiple downstream use cases.
* Medium: documented time reduction of 15–40%, quality improvement that is measurable but modest, or productivity gain for a small team.
* Low: time reduction below 15%, quality impact not yet quantified, or value limited to convenience rather than business outcome.
* Weight High value use cases significantly in portfolio prioritization — they should be piloted before Medium and Low value alternatives.
* Document the business value justification in one paragraph that can be shared with program leadership.

## Leadership Question

**Based on the quantified outcomes defined in the business value stage, what is the expected business impact of this AI use case — and is that impact significant enough to justify the investment of a pilot?**

---

# 2. Technical Feasibility & Data Readiness

## Definition

Technical Feasibility and Data Readiness scores the degree to which the use case can be built given current AI capabilities, available data, and organizational technical readiness. A use case with perfect business value but no usable data is not ready to pilot.

Technical feasibility evaluates the AI problem type: classification, generation, prediction, summarisation, and recommendation are all well-understood AI patterns with strong tooling support and high feasibility. Problems requiring physical world understanding, real-time decision-making under safety constraints, or novel AI research are lower feasibility.

Data readiness evaluates whether the right data exists in sufficient volume, quality, and accessibility. This is the most common blocker for AI use cases in practice. Teams consistently overestimate how accessible their historical data is, and underestimate how much preparation is needed before it can be used for AI training or configuration.

## Key Principles

* Evaluate the AI problem type separately from the data readiness — a clear AI problem with poor data is still blocked.
* Technical feasibility scale: High (well-understood AI pattern, available tooling, proven in similar contexts), Medium (clear AI pattern but requires customisation or novel combination), Low (requires research or AI capability not yet mature).
* Data readiness scale: High (historical data exists, is accessible, and is in usable format with minimal preparation), Medium (data exists but requires significant cleaning, labelling, or integration work), Low (data is missing, inaccessible, or of insufficient volume).
* Combine technical feasibility and data readiness into a single joint score — both must be at least Medium for the combined score to be Medium.
* A Low data readiness score should trigger a pre-condition: data must be collected and prepared before the use case can be piloted.
* Flag data governance or access constraints as risks, not blockers — they can often be resolved with business ownership.
* Document the data sources that will be used: names of systems, types of records, estimated volume, and access status.

## Leadership Question

**Is this AI use case technically buildable with current tools and techniques — and is the data we need available, accessible, and in sufficient quality and volume to support a pilot?**

---

# 3. Organizational Impact & Pilot Recommendation

## Definition

Organizational Impact scores how significantly the AI use case affects the people, processes, and culture of the organization. A use case that requires large-scale workflow change, significant retraining, cross-team coordination, or senior stakeholder management carries higher organizational impact — and therefore higher delivery risk — than one that augments an individual's existing workflow with minimal process change.

Organizational impact is not a binary good or bad measure. High organizational impact is acceptable for high business value use cases — it simply means the change management workload is proportionally higher and must be planned. Low organizational impact use cases are typically faster to pilot and easier to scale, but may deliver proportionally smaller business value.

The Pilot Recommendation combines all four dimension scores — business value, technical feasibility, data readiness, and organizational impact — into a final, clearly justified decision. The recommendation should name the priority level (High, Medium, Deferred), state the rationale, and identify any pre-conditions that must be met before the pilot can begin.

## Key Principles

* Evaluate organizational impact on three sub-dimensions: workflow change required, people affected, and stakeholder complexity.
* Low impact: augments an individual's task with no workflow change; one team; no senior stakeholder dependency.
* Medium impact: changes a team's workflow; multiple teams involved; requires a program-level sponsor.
* High impact: changes a function-level process; cross-program coordination required; senior leadership visibility needed.
* High impact is a risk factor, not a disqualifier — match the change management investment to the impact level.
* Pilot Recommendation levels: High Priority (pilot immediately), Medium Priority (pilot next quarter), Deferred (pre-conditions must be met first), Not Recommended (business value does not justify investment).
* State pre-conditions explicitly: what must be true before the pilot can begin — data access confirmed, sponsor assigned, baseline metrics recorded.
* The pilot recommendation is the deliverable that leaves this pipeline stage. It must be actionable and defensible.

## Leadership Question

**Considering business value, feasibility, data availability, and organizational impact together — what is our recommendation for this AI use case, and what must be in place before we start the pilot?**
