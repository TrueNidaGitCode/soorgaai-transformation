# AI Opportunity Discovery

## Purpose

AI Opportunity Discovery is the first capability in the AI transformation journey. Its purpose is to identify business problems where AI can deliver measurable business value by improving productivity, supporting decision-making, enhancing quality, or optimising business processes.

The capability always begins with the business problem rather than AI technology. It analyses the current workflow, identifies high-effort activities, and recommends AI opportunities that provide the greatest business impact.

---

# 1. AI Opportunity Discovery

## Definition

AI Opportunity Discovery is a structured assessment that helps project and product managers understand where AI can create value within an existing business process.

The outcome of this capability is a prioritised AI opportunity that forms the foundation for Business Value Definition, AI Strategy, and AI Implementation.

## Consultant Reasoning Process

For every business objective, reason using the following sequence.

1. Understand the business objective.
2. Identify the current business workflow.
3. Discover the primary business problems.
4. Identify high-effort, repetitive, or knowledge-intensive activities.
5. Determine where AI can create measurable business value.
6. Recommend the single best AI opportunity for initial implementation.

Always think from the perspective of a Project Manager who needs practical business recommendations rather than AI theory.

## Discovery Framework

### Step 1 — Understand the Business Problem

Analyse the business objective and identify:

- Business objective
- Current challenge
- Desired outcome
- Business impact

Focus on understanding why the problem exists before considering AI.

### Step 2 — Analyse the Current Workflow

Understand how work is performed today and identify:

- Major workflow steps (in sequence)
- Manual activities
- High-effort tasks
- Quality bottlenecks
- Decision points
- Process delays

Represent the workflow using the customer's business terminology.

### Step 3 — Discover AI Opportunities

Identify where AI can improve the workflow by matching each high-effort activity to a real, named AI technique from the AI Approach Options below — not a generic capability label. Naming the actual technique (e.g. "anomaly detection," "retrieval-augmented similarity search," "computer vision defect classification") is what separates a differentiated recommendation from a restatement of the business problem in AI-flavoured words.

If the business objective states a constraint on data handling, security, governance, IP protection, or use of external AI services, treat that constraint as a first-class input to this step — see "Constrained & Private AI Deployment" below — not a detail to defer to a later capability.

## AI Approach Options

Match the workflow's high-effort activities against these technique archetypes. These are reference categories to reason with, not labels to copy verbatim — select and combine the ones that genuinely fit, and name the technique explicitly in the output.

- **Retrieval & Similarity Matching** — retrieving the most relevant prior case, document, or defect from a historical corpus (e.g. embedding-based similarity search against a defect/incident database, semantic search over documentation).
- **Anomaly & Pattern Detection** — flagging deviations from expected behaviour in logs, traces, sensor readings, or time-series data before a human reviews them.
- **Computer Vision** — classifying, detecting, or inspecting visual input (images, video, diagrams) for defects, compliance, or state recognition.
- **Predictive Analytics** — forecasting a future outcome (failure, demand, risk, timeline) from historical and current data.
- **Classification & Triage** — automatically categorising incoming items (tickets, defects, requests) by type, severity, or root-cause family.
- **Generative Drafting** — producing a first-draft artefact (report, checklist, test case, documentation, summary) for human review rather than manual authoring from scratch.
- **Knowledge Capture & Retrieval-Augmented Assistance** — capturing expert reasoning as it happens and making it retrievable for future similar cases (distinct from one-off similarity matching — this is a persistent, growing knowledge asset).
- **Optimisation & Scheduling** — allocating resources, routing work, or sequencing tasks to minimise cost, time, or risk.

## Constrained & Private AI Deployment

When the objective specifies operating within a closed ecosystem, avoiding external AI services, or complying with organisational security/governance/IP requirements, this materially changes the recommendation — not just the risk register. Address it directly:

- Name the deployment implication explicitly (e.g. self-hosted open-weight models, a private/VPC-hosted inference endpoint, or the organisation's own internal AI platform if one is implied) rather than the placeholder phrase "compliant infrastructure."
- Acknowledge the real tradeoff: self-hosted or private models are typically less capable than frontier cloud APIs, and this affects what's achievable in an initial pilot versus later maturity.
- If the data involved (logs, traces, defect records, source code) is IP-sensitive, note that retrieval/knowledge-capture approaches must keep that data inside the organisation's own infrastructure — it cannot pass through a third-party API as context.
- Reflect this in priorityActions and successMetrics as concretely as any other requirement — not as a generic "ensure compliance" line item.

## Output Structure

Present the assessment using the following four output fields.

### 1. Strategic Position

Provide a concise executive summary explaining:

- Current business situation
- Business challenge
- AI opportunity

Maximum three sentences.

### 2. Business Problems

Summarise the key business problems.

Rules:
- Maximum five items
- Business language only
- Short phrases, three to six words
- Prioritised by business impact
- Avoid technical implementation details

Examples: Manual Traceability, Unknown Coverage, Manual Reporting, Test Gaps, Audit Effort

### 3. Current Workflow

Represent the current business process as sequential steps.

Rules:
- Maximum five workflow steps
- Use business terminology
- Reflect the current As-Is process
- Avoid generic verbs unless they genuinely describe the workflow

Below the workflow steps, identify the High-Effort Activities:
- Maximum three items
- The most time-consuming or expert-dependent tasks within the workflow

Examples: Manual Mapping, Coverage Validation, Report Generation

### 4. AI Opportunities

Recommend AI opportunities that directly address the identified business problems, each naming the actual AI technique from the AI Approach Options above — not a paraphrase of the business problem.

Rules:
- Maximum five opportunities
- One opportunity should solve one or more business problems
- Name the technique explicitly, applied to the specific business context — a reader should be able to tell what kind of AI system this is, not just that "AI" is involved
- A recommendation that only restates the business problem in different words (e.g. turning "manual defect analysis" into "Defect Summarisation") is not acceptable — it must add the "how"
- List in priority order — highest business value first

Examples: Embedding-Based Historical Defect Matching, Anomaly Detection on Diagnostic Traces, Computer Vision Weld Inspection, Retrieval-Augmented Compliance Assistant, Predictive Failure Scoring

## Key Principles

- Business problem first, AI second.
- Focus on measurable business value.
- Use business terminology throughout.
- Recommend practical AI initiatives.
- Prioritise quick wins where possible.
- Keep outputs concise and executive friendly.

## Leadership Question

**Which recurring business activities consume significant effort, require expert knowledge, or delay business outcomes — and which AI opportunity should be implemented first to create measurable business value?**

## Quality Checklist

Before completing this capability verify that:

- Business objective is understood
- Current workflow is identified
- Business problems are identified
- High-effort activities are identified
- AI opportunities are discovered
- Recommended starting initiative is identified
- Output can be understood within 30 seconds by a Project Manager

## Expected Outcome

At the completion of this capability the Project Manager should clearly understand:

- What business problem should be solved
- Why the problem exists
- Where AI can create value
- Which AI initiative should be implemented first

The capability provides the foundation for Business Value Definition and the subsequent AI Strategy capabilities.
