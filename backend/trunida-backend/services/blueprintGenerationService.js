/**
 * SoorgaAI — Blueprint Generation Service (PI 26.3 Sprint 1)
 *
 * Supports three generation pipelines controlled by blueprintConfig.js:
 *
 *   Essay pipeline  (generate.essay = true)
 *     LLM call 1 → section.content  (long-form prose per section)
 *     LLM call 2 → section.brief    (structured extraction from essay)
 *
 *   Brief pipeline  (generate.essay = false)  ← active
 *     LLM call 1 → section.brief    (direct structured generation)
 *
 *   CTO extras      (generate.ctoExtras = true)  ← active
 *     Injected into whichever brief call runs above
 *     Adds template-specific fields e.g. strategicPillars for Vision sections
 *
 * Called fire-and-forget from the controller; updates CompanyBlueprint in
 * MongoDB as each capability completes so the SSE stream can poll live status.
 */

import CompanyBlueprint        from '../models/CompanyBlueprint.js';
import TransformationBlueprint  from '../models/TransformationBlueprint.js';
import CompanyContext            from '../models/CompanyContext.js';
import UserProfile               from '../models/UserProfile.js';
import { generate }              from './llmService.js';
import {
  getCapabilities,
  getCapabilityBlueprint,
  getDomainCapabilities,
  getDomainCapabilityBlueprint,
} from './strategyCanvasService.js';
import { BLUEPRINT_CONFIG }       from '../config/blueprintConfig.js';
import { enabledDomains, getDomain } from '../config/domainRegistry.js';
import { getCapabilityEnterpriseContext, preloadEnterpriseContextMap } from './enterpriseBlueprintService.js';

// ── Company profile helpers ───────────────────────────────────────────────────

async function loadCompanyProfile(userId) {
  try {
    const [profile, ctx] = await Promise.all([
      UserProfile.findOne({ userId }).lean(),
      CompanyContext.findOne({ userId }).lean(),
    ]);
    return {
      companyName: profile?.orgName        || 'Your Organisation',
      orgName:     profile?.orgName        || '',
      role:        profile?.role           || 'Executive',
      industry:    profile?.industryDomain || 'Automotive',
      contextDoc:  ctx?.content            || '',
    };
  } catch {
    return { companyName: 'Your Organisation', orgName: '', role: 'Executive', industry: 'Automotive', contextDoc: '' };
  }
}

// ── Section template config ───────────────────────────────────────────────────
// Declares which section titles get extra LLM-generated fields (CTO view).
// Add a new entry here when a new slide template needs section-specific data.
// Only injected when BLUEPRINT_CONFIG.generate.ctoExtras = true.

const SECTION_TEMPLATES = {

  Vision: {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Vision" sections only:

5. strategicPillars (exactly 3 items)
   Extract 3 distinct strategic themes from the strategicPosition as named pillars.
   Each item: { "title": "<2–4 word noun phrase>", "description": "<1 outcome sentence>", "businessImpactTag": "<1–3 word impact label>" }
   Example tags: "Engineering Velocity", "Release Predictability", "Cost Reduction"

6. kpiHighlights (exactly 3 items)
   Extract 3 hero success metrics to display as large-number KPI cards.
   Each item: { "value": "<number with unit e.g. 75%, 4+, 2×, 18mo>", "label": "<2–4 word metric name>", "description": "<1 short sentence, ≤8 words>" }
   Values must be specific and quantified. Labels must be scannable in 1 second.

7. timelineSteps (exactly 4 items)
   Condense the 4 most critical priority actions into short 3–5 word action labels for a horizontal timeline.
   Each item is a plain string. Must be directive and scannable.
   Example: ["Define 3-Year AI Vision", "Establish Measurable Outcomes", "Deploy AI Council", "Assign Accountable Owners"]

   Add all three to the brief object for Vision sections:
   "strategicPillars": [...], "kpiHighlights": [...], "timelineSteps": [...]`,
  },

  Alignment: {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Alignment" sections only:

5. kpiHighlights (exactly 3 items)
   Extract 3 measurable alignment outcomes to display as stacked large-number metrics.
   Each item: { "value": "<number with unit e.g. 90%, 100%, 4+>", "label": "<2–5 word metric name>", "description": "" }
   Values must reflect leadership, stakeholder, or governance alignment targets.
   Example: { "value": "90%", "label": "Leadership Alignment Score", "description": "" }

6. alignmentInitiatives (exactly 4 items)
   Extract 4 concrete alignment initiatives — the first 3 will display as equal cards, the 4th as a full-width card.
   Each item: { "title": "<3–6 word initiative name>", "description": "<2–3 sentences explaining what it is and why it matters>" }
   Examples: "Common AI Vocabulary & Learning", "Cross-Functional AI Workshops", "Executive Ownership Framework", "AI Program Liaisons"

7. spokeNodes (5–6 items)
   Identify the key stakeholder groups that must align around the AI transformation agenda.
   Each item is a plain string, 2–5 words. These will be rendered as nodes on a spoke wheel diagram.
   Examples: ["Technology Leadership", "Engineering Teams", "Business Stakeholders", "Architecture & Platform Teams", "Delivery & Program Management", "Customer Representatives"]

   Add all three to the brief object for Alignment sections:
   "kpiHighlights": [...], "alignmentInitiatives": [...], "spokeNodes": [...]`,
  },

  'Business-Led Roadmap': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Business-Led Roadmap" sections only:

5. funnelStages (exactly 4 items)
   Estimate a realistic AI opportunity funnel showing how ideas narrow from ideation to production.
   Each item: { "count": "<number as string e.g. '15'>", "label": "<stage label>" }
   Stages in order (widest to narrowest):
   [0] Total AI ideas/opportunities identified
   [1] Ideas formally evaluated for feasibility
   [2] Ideas prioritized and approved for development
   [3] Ideas deployed to production
   Example: [{"count":"15","label":"AI Ideas"},{"count":"8","label":"Evaluated"},{"count":"4","label":"Prioritized"},{"count":"2","label":"Production Deployments"}]
   Use realistic numbers for the company's context and maturity level.

6. kpiHighlights (exactly 3 items)
   Extract 3 business outcome KPIs reflecting the roadmap's measurable impact.
   Each item: { "value": "<number with unit>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Example: { "value": "100%", "label": "Initiatives Linked to Business Priorities", "description": "Every AI initiative tied to a named business objective." }

   Add both to the brief object:
   "funnelStages": [...], "kpiHighlights": [...]`,
  },

  'Strategic Roadmap Design': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Strategic Roadmap Design" sections only:

5. matrixQuadrants (exactly 4 items in this order)
   Classify AI initiatives into a 2×2 Business Impact vs Readiness prioritization matrix.
   Order: [0] Quick Wins (High Impact, High Readiness), [1] Strategic Bets (High Impact, Low Readiness), [2] Fill-ins (Low Impact, High Readiness), [3] Defer (Low Impact, Low Readiness)
   Each item: { "title": "<quadrant name>", "initiatives": ["<initiative 1>", "<initiative 2>"] }
   "initiatives" should be 1–3 short initiative names (3–6 words each). Defer may have ["Future consideration"].

6. quarterlyPlan (exactly 4 items)
   Sequence the Quick Wins and Strategic Bets initiatives across 4 quarters.
   Each item: { "quarter": "Q1" | "Q2" | "Q3" | "Q4", "initiatives": ["<initiative 1>", "<initiative 2>"] }
   Q1–Q2 should contain Quick Wins; Q3–Q4 should contain Strategic Bets and scale-up work.

7. kpiHighlights (exactly 3 items)
   Extract 3 roadmap execution success metrics.
   Each item: { "value": "<number with unit e.g. 100%, <10%, 4>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add all three to the brief object:
   "matrixQuadrants": [...], "quarterlyPlan": [...], "kpiHighlights": [...]`,
  },

  Commitment: {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Commitment" sections only:

5. commitmentPillars (exactly 3 items)
   Extract 3 executive commitment themes (e.g. Investment, Governance, Leadership Engagement).
   Each item: { "title": "<1–3 word pillar name>", "actions": ["<action item 1>", "<action item 2>", "<action item 3>"] }
   Actions must be concrete, scannable 3–8 word bullet items describing what leaders commit to doing.
   IMPORTANT: Never use "CTO" as a pillar title — use "Leadership" instead.
   Example: { "title": "Investment", "actions": ["AI skill development funding", "AI tooling investments", "25% increase in AI initiative budget"] }

6. governanceNodes (exactly 4 items)
   Identify the 4 governance roles/bodies forming the oversight structure.
   Each item: { "title": "<role or body name>", "description": "<1 sentence on their responsibility>" }
   IMPORTANT: Never use "CTO" as a node title — use "Leadership Oversight" instead.
   Example: { "title": "Leadership Oversight", "description": "Executive sponsorship and strategic direction for AI transformation." }

7. kpiHighlights (exactly 3 items)
   Extract 3 concrete commitment outcomes as large-number KPI cards.
   Each item: { "value": "<number with unit e.g. 25%, 100%, 85%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Example: { "value": "25%", "label": "Increase in AI Initiative Funding", "description": "Year-over-year budget growth committed by leadership." }

   Add all three to the brief object for Commitment sections:
   "commitmentPillars": [...], "governanceNodes": [...], "kpiHighlights": [...]`,
  },

  'Solution-Centric Organization': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Solution-Centric Organization" sections only:

5. solutionPortfolio (exactly 3 items)
   Define 3 AI solutions that directly implement the Strategic Position stated above for this section.
   Solutions MUST be derived from the Strategic Position text — name each solution after a specific AI initiative, capability, or workflow described in that text.
   Each item: { "name": "<2–4 word solution name>", "businessOwner": "<role title e.g. Diagnostics Program Lead>", "deliveryTeam": "<teams comma-separated e.g. AI/ML Engineering, Domain Engineering>", "kpis": ["<KPI metric 1>", "<KPI metric 2>"] }
   Do NOT use generic names like "AI Platform" or "Data Services" — every solution name must reflect the company's specific engineering context.
   Example for an automotive engineering services company with a diagnostics objective: { "name": "AI Defect Triage", "businessOwner": "Engineering Delivery Lead", "deliveryTeam": "AI/ML Engineering, Domain Engineering", "kpis": ["Triage Effort Reduction", "Classification Accuracy"] }

6. kpiHighlights (exactly 3 items)
   Extract 3 portfolio-level success metrics showing organizational alignment and dependency reduction.
   Each item: { "value": "<number with unit e.g. 100%, 30%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Example: { "value": "100%", "label": "Solutions Linked to Business Outcomes", "description": "Every AI initiative tied to a named business outcome." }

   Add both to the brief object:
   "solutionPortfolio": [...], "kpiHighlights": [...]`,
  },

  'Cross-Functional Delivery Teams': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Cross-Functional Delivery Teams" sections only:

5. teamRoles (5 to 7 items)
   Define the key roles forming the cross-functional AI delivery team structure.
   Each item: { "title": "<role name>", "description": "<1 sentence on their specific responsibility>" }
   Include roles such as: Product Owner, Business Lead, Data/AI Specialist, Engineering Lead, Domain Expert, Architect, QA/Test.
   Descriptions must reflect the company's industry context (e.g. automotive engineering, vehicle software).

6. kpiHighlights (exactly 3 items)
   Extract 3 team effectiveness metrics reflecting delivery speed and onboarding outcomes.
   Each item: { "value": "<number with unit e.g. +3, 20%, 100%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Example: { "value": "20%", "label": "Cycle Time Reduction", "description": "Faster delivery through cross-functional collaboration." }

   Add both to the brief object:
   "teamRoles": [...], "kpiHighlights": [...]`,
  },

  'End-to-End Ownership': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "End-to-End Ownership" sections only:

5. lifecycleStages (exactly 6 items)
   Define the 6 stages of the AI solution lifecycle ownership loop in order.
   Stages must be: Idea, Build, Test, Deploy, Monitor, Improve
   Each item: { "stage": "<stage name>", "teamResponsibility": "<1–2 key roles e.g. Product Owner, Business Lead>", "keyActivities": "<5–10 word activity description>" }
   Example: { "stage": "Deploy", "teamResponsibility": "Engineering Lead, DevOps", "keyActivities": "Release to production with minimal risk" }

6. kpiHighlights (exactly 3 items)
   Extract 3 ownership continuity metrics (e.g. single-team ownership, incident resolution speed, improvement cycles).
   Each item: { "value": "<number with unit e.g. 100%, 40%, 2+>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Example: { "value": "40%", "label": "Faster Incident Resolution", "description": "Single-team ownership accelerates fixes and learning." }

   Add both to the brief object:
   "lifecycleStages": [...], "kpiHighlights": [...]`,
  },

  // ── AI ROI capability ──────────────────────────────────────────────────────

  'Financial Performance': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Financial Performance" sections only:

5. waterfallItems (exactly 6 items, in this order)
   A value waterfall showing the ROI progression from investment to return.
   Items must be in this fixed sequence: Initial Investment, Automation Savings, Productivity Gains, Revenue Growth, Financial Return, Total
   Each item: { "category": "<category name>", "value": "<numeric string e.g. -8, 2>", "type": "negative|positive|total", "description": "<1 short sentence describing this value element, ≤12 words>" }
   Rules: Initial Investment must use type "negative"; Total must use type "total"; all others use "positive".
   Values should be realistic relative numbers in $M that show a clear investment-to-return progression; Total value should roughly equal the sum of all positive values minus the absolute investment.
   Example item: { "category": "Automation Savings", "value": "2", "type": "positive", "description": "Reduced manual effort and faster process throughput." }

6. kpiHighlights (exactly 3 items)
   Three headline financial performance KPIs.
   Each item: { "value": "<number with unit e.g. 25%, 3×, $2M>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "waterfallItems": [...], "kpiHighlights": [...]`,
  },

  'Operational Excellence': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Operational Excellence" sections only:

5. sdlcStages (exactly 5 items, in this order)
   The five SDLC stages showing how AI enhances each phase.
   Stages must be in this fixed sequence: Plan, Develop, Test, Deploy, Operate
   Each item: { "stage": "<stage name>", "aiTool": "<AI tool or capability name e.g. AI Planning Assistant, AI Copilot>", "description": "<1 sentence on how AI improves this stage, ≤12 words>" }
   Example item: { "stage": "Plan", "aiTool": "AI Planning Assistant", "description": "Intelligent resource allocation and proactive risk assessment at scale." }

6. kpiHighlights (exactly 3 items)
   Three delivery performance metrics demonstrating operational improvement.
   Each item: { "value": "<number with unit e.g. 40%, 2×, 50%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "sdlcStages": [...], "kpiHighlights": [...]`,
  },

  'Customer Value': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Customer Value" sections only:

5. flywheelStages (exactly 5 items)
   A self-reinforcing customer value flywheel where each stage feeds the next.
   Stages should follow this progression concept: better experience → higher adoption → more engagement → higher satisfaction → recurring revenue (adapt names to the company context).
   Each item: { "name": "<stage name, 2–4 words>", "points": ["<characteristic or outcome 1>", "<characteristic or outcome 2>", "<characteristic or outcome 3>"] }
   Example item: { "name": "Better Experience", "points": ["Faster issue resolution", "Personalised AI support", "Intuitive interfaces"] }

6. kpiHighlights (exactly 3 items)
   Three customer value or satisfaction success metrics.
   Each item: { "value": "<number with unit e.g. 30%, 90%, 15%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "flywheelStages": [...], "kpiHighlights": [...]`,
  },

  // ── AI Governance & Ethics capability ─────────────────────────────────────

  'Data Privacy & Security': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Data Privacy & Security" sections only:

5. securityPillars (exactly 4 items)
   Four security-by-design pillars that protect AI delivery.
   Cover these domains: pipeline/DevSecOps security, data protection/PII masking, access control, continuous monitoring.
   Each item: { "name": "<pillar name, 3–5 words>", "points": ["<security practice 1>", "<security practice 2>", "<security practice 3>"] }
   Example item: { "name": "DevSecOps Pipelines", "points": ["Automated vulnerability scanning", "Secure code review gates", "Container image hardening"] }

6. kpiHighlights (exactly 3 items)
   Three security or compliance success metrics.
   Each item: { "value": "<number with unit e.g. 100%, 0 breaches, 99.9%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "securityPillars": [...], "kpiHighlights": [...]`,
  },

  'Ethical AI Guidelines': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Ethical AI Guidelines" sections only:

5. ethicsPillars (exactly 4 items)
   Four responsible AI pillars forming the ethics framework.
   Pillars should cover: Fairness, Explainability, Transparency, Accountability (adapt names/content to company context).
   Each item: { "name": "<pillar name e.g. Fairness, Explainability>", "points": ["<practice or principle 1>", "<practice or principle 2>", "<practice or principle 3>"] }
   Example item: { "name": "Fairness", "points": ["Bias testing across demographic groups", "Diverse training data validation", "Regular fairness audits"] }

6. kpiHighlights (exactly 3 items)
   Three ethics governance or fairness metrics.
   Each item: { "value": "<number with unit e.g. 100%, 0, 100%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "ethicsPillars": [...], "kpiHighlights": [...]`,
  },

  'Model Validation & Monitoring': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Model Validation & Monitoring" sections only:

5. modelLifecycleStages (exactly 6 items, in this order)
   The six stages of the AI model lifecycle monitoring loop.
   Stages must be in this fixed sequence: Train, Validate, Deploy, Monitor, Detect Drift, Retrain
   Each item: { "stage": "<stage name>", "points": ["<key activity or practice 1>", "<key activity 2>", "<key activity 3>"] }
   Example item: { "stage": "Validate", "points": ["Performance benchmarking against baselines", "Bias and fairness checks", "Edge case stress testing"] }

6. kpiHighlights (exactly 3 items)
   Three model governance or reliability metrics.
   Each item: { "value": "<number with unit e.g. 100%, 48-hour, 95%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "modelLifecycleStages": [...], "kpiHighlights": [...]`,
  },

  'Regulatory Compliance': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Regulatory Compliance" sections only:

5. complianceControls (exactly 4 items)
   Four compliance control categories forming the AI compliance framework.
   Cover these domains: audit trails and logging, documentation standards, delivery gate reviews, third-party validation/certification.
   Each item: { "name": "<control category name, 3–5 words>", "points": ["<control practice 1>", "<control practice 2>", "<control practice 3>"] }
   Example item: { "name": "Audit Trails & Logging", "points": ["Immutable decision audit logs", "Full data lineage tracking", "Automated compliance reporting"] }

6. kpiHighlights (exactly 3 items)
   Three regulatory compliance or audit success metrics.
   Each item: { "value": "<number with unit e.g. 100%, 0 findings, 100%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "complianceControls": [...], "kpiHighlights": [...]`,
  },

  'Trust & Adoption': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Trust & Adoption" sections only:

5. adoptionStages (exactly 5 items)
   A self-reinforcing trust and adoption flywheel.
   Stages should follow this progression: trust building → adoption → active usage → business value realisation → confidence/advocacy (adapt names to company context).
   Each item: { "name": "<stage name, 1–3 words e.g. Trust, Adoption, Usage>", "points": ["<stage characteristic or outcome 1>", "<characteristic 2>", "<characteristic 3>"] }
   Example item: { "name": "Trust", "points": ["Transparent AI decision explanations", "Consistent model reliability", "Stakeholder communication programme"] }

6. kpiHighlights (exactly 3 items)
   Three adoption or change management success metrics.
   Each item: { "value": "<number with unit e.g. 90%, 85%, 80%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "adoptionStages": [...], "kpiHighlights": [...]`,
  },

  // ── AI Use Cases domain ───────────────────────────────────────────────────

  'AI Opportunity Discovery': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Opportunity Discovery" sections only:

5. businessProblems (4 to 6 items)
   The key business and engineering challenges this company faces that create AI opportunities.
   Each item is a plain string, 3–6 words. Must be specific to the company's industry and context.
   Example: ["Manual Defect Analysis", "Knowledge Concentration Risk", "Slow Requirements Review", "Inconsistent Test Coverage"]

6. workflowSteps (3 to 5 items)
   The major steps in the current workflow where AI can assist, in left-to-right order.
   Each item is a plain string, 1–3 words.
   Example: ["Analyze", "Review", "Classify"]

7. highEffortActivities (2 to 4 items)
   The most time-consuming or expert-dependent activities within the current workflow.
   Each item is a plain string, 1–3 words.
   Example: ["Validate", "Assign", "Document"]

8. aiOpportunities (4 to 6 items)
   The specific AI capabilities matched to the company's high-effort activities.
   Each item is a plain string, 2–4 words. Must be specific to the company context — not generic.
   Example: ["Defect Summarisation", "Intelligent Classification", "Knowledge Retrieval", "Smart Assignment", "Risk Prediction"]

   Add all four to the brief object:
   "businessProblems": [...], "workflowSteps": [...], "highEffortActivities": [...], "aiOpportunities": [...]`,
  },

  'Business Value Definition': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Business Value Definition" sections only:

JOURNEY RULE: Look up the primary AI initiative named in the "Primary AI Classification" or strategicPosition of the previous capability in the TRANSFORMATION JOURNEY block.
The strategicPosition, all value categories, KPIs, and insight MUST be specific to that named initiative (e.g. "AI Traceability Mapping reduces manual traceability effort by...").
Do NOT describe generic AI value — describe the value of THIS specific initiative for this company.

5. valueCategories (exactly 4 items in this fixed order)
   Each card explains how the primary named initiative creates value in one dimension for this company.
   Order: [0] Engineering Productivity, [1] Engineering Excellence, [2] Project & Operational Performance, [3] Customer & Product Value
   Each item: { "title": "<category name>", "focus": "<short phrase specific to this initiative, e.g. 'Automate traceability mapping'>", "outcomes": ["<outcome 1>", "<outcome 2>", "<outcome 3>", "<outcome 4>"] }
   "outcomes" must be 4 concise initiative-specific expected outcomes (3–6 words each).
   "focus" must be short and initiative-specific (max 6 words).

6. kpiPills (exactly 6 items)
   Short metric names for the primary measurable KPIs for THIS named initiative. Each item is a short string (2–5 words) in title case. Make every KPI specific to what this initiative measures.

7. businessValueInsight (1–2 sentences)
   Name the initiative explicitly. State its primary business outcome and how success will be measured for this company.

   Add all to the brief object:
   "valueCategories": [...], "kpiPills": [...], "businessValueInsight": "..."`,
  },

  'AI Implementation Prioritization': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Implementation Prioritization" sections only:

JOURNEY RULE: This capability answers "which AI initiative should we implement first?"
Use ONLY the initiatives from the "Identified AI Opportunities" list in the TRANSFORMATION JOURNEY block — do NOT invent new initiatives.
Place the primary classified initiative (from Capability 2) in its correct quadrant — Quick Wins if high value + high feasibility, Strategic Bets if high value + lower feasibility.
Distribute the remaining identified opportunities across the other quadrants based on their relative value and feasibility.

5. recommendedStartingPoint (1 sentence)
   Name the specific AI initiative that should be implemented first (from the identified opportunities list) and state why it offers the best balance of business value and implementation feasibility.

6. priorityQuadrants (exactly 4 items in this fixed order)
   Distribute ALL identified AI opportunities from Capability 1 across the 2×2 matrix. Use ONLY initiatives from the "Identified AI Opportunities" journey context — do not add unrelated ones.
   Order: [0] Strategic Bets (High Value, Low Feasibility), [1] Quick Wins (High Value, High Feasibility), [2] Fill-ins (Low Value, Low Feasibility), [3] Avoid (Low Value, High Feasibility)
   Each item: { "id": "<strategic-bets|quick-wins|fill-ins|avoid>", "label": "<quadrant name>", "initiatives": ["<initiative name from identified list>"] }
   The "Avoid" quadrant may remain empty ([]) if all identified opportunities have positive value.

7. dimensionCards (exactly 4 items in this fixed order)
   Assess the RECOMMENDED STARTING INITIATIVE (from item 5) across the four dimensions. Bullets must be specific to that initiative and this company.
   Order: [0] Business Value, [1] Implementation Feasibility, [2] Strategic Alignment, [3] Organizational Readiness
   Each item: { "title": "<dimension name>", "bullets": ["<assessment 1>", "<assessment 2>", "<assessment 3>"] }
   Bullets must be concise 2–4 word labels specific to this initiative and company context.

8. prioritizationInsight (1 sentence)
   Name the recommended initiative explicitly. State why implementing it first builds momentum and prepares the organization for AI transformation.

   Add all to the brief object:
   "recommendedStartingPoint": "...", "priorityQuadrants": [...], "dimensionCards": [...], "prioritizationInsight": "..."`,
  },

  'AI Use Case Classification': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Use Case Classification" sections only:

JOURNEY RULE: Review the "Identified AI Opportunities" list in the TRANSFORMATION JOURNEY block.
Select the FIRST listed opportunity as the primary initiative to classify.
The strategicPosition MUST open by naming this initiative explicitly (e.g. "AI Traceability Mapping is classified as...").
All classification rationale and outcomes must be specific to that named initiative — not a generic description of the company.

5. primaryClassification
   Classify the primary initiative identified above.
   Object: { "name": "Productivity AI" | "Functional AI" | "Product AI", "rationale": "<1 sentence explaining why THIS specific initiative belongs to this classification>", "businessOutcome": "<1 sentence on the primary business outcome THIS initiative will deliver>" }

6. secondaryClassification (include only if a second classification clearly applies — otherwise omit or set to null)
   Object: { "name": "Productivity AI" | "Functional AI" | "Product AI", "rationale": "<1 sentence>", "businessOutcome": "<1 sentence>" }

7. transformationImplication (1 sentence)
   A concise insight explaining how classifying THIS specific initiative guides the next steps: business value assessment, prioritization, and implementation planning.

   Add all to the brief object:
   "primaryClassification": {...}, "secondaryClassification": {...} or null, "transformationImplication": "..."`,
  },

  'Critical Data Identification': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Critical Data Identification" sections only:

5. datasets (exactly 7 items)
   Identify the 7 critical datasets required for this AI use case, one per data category.
   Each item: { "name": "<dataset name, 2–4 words>", "purpose": "<1 sentence, ≤10 words>", "priority": "HIGH|MEDIUM|LOW", "availability": "AVAILABLE|MISSING|PARTIAL", "category": "Business|Product|System|Engineering|Operational|Supporting|Relationships" }

6. relationshipMap
   Classify the identified datasets into 4 relationship roles.
   Object: { "dataSource": ["<dataset 1>", "<dataset 2>"], "dependentData": ["..."], "relatedData": ["..."], "targetData": ["..."] }
   dataSource = primary input datasets; dependentData = derived metrics/features; relatedData = contextual/reference data; targetData = final model outputs.

7. recommendations (exactly 3 items)
   The 3 highest-priority data collection or preparation actions for this project.
   Each item: { "text": "<action, ≤12 words>", "priority": "HIGH|MEDIUM|LOW" }

8. coverageSummary
   Object: { "criticalDatasets": <number 1–7>, "missingData": <number 0–7>, "confidence": <number 0–100> }
   criticalDatasets = total datasets identified; missingData = count with availability MISSING or PARTIAL; confidence = estimated % confidence that identified data is sufficient.

   Add all to the brief object:
   "datasets": [...], "relationshipMap": {...}, "recommendations": [...], "coverageSummary": {...}`,
  },

  'AI Data Preparation': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Data Preparation" sections only:

5. inputDatasets (up to 4 items)
   The key datasets from the previous step that are being prepared for AI.
   Each item: { "name": "<dataset name, 2–4 words>", "status": "AVAILABLE|MISSING|IN PROGRESS" }

6. pipelineStages (exactly 4 items, fixed order: Raw Data, Quality Check, Standardization, Integration)
   The current preparation status of each pipeline stage for this project's data.
   Each item: { "stage": "Raw Data|Quality Check|Standardization|Integration", "status": "Completed|Needs Attention|In Progress|Pending" }

7. prepRecommendations (exactly 3 items)
   The 3 highest-priority data preparation actions for this project.
   Each item: { "text": "<action, ≤12 words>", "priority": "HIGH|MEDIUM|LOW", "effort": "LOW|MEDIUM|HIGH", "impact": "<expected outcome, ≤8 words>" }

8. dataStats
   Key data health metrics for this project.
   Object: { "missingData": <count 0–10>, "dataQuality": <score 0–100>, "traceability": <score 0–100> }

9. readinessSummary
   Four dimension readiness scores as percentages (0–100).
   Object: { "quality": <0–100>, "standardization": <0–100>, "integration": <0–100>, "aiReadiness": <0–100> }

   Add all to the brief object:
   "inputDatasets": [...], "pipelineStages": [...], "prepRecommendations": [...], "dataStats": {...}, "readinessSummary": {...}`,
  },

  'Data Architecture Enablement': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Data Architecture Enablement" sections only:

5. projectSystems (up to 4 items)
   The engineering or project systems containing data relevant to this AI use case.
   Each item: { "name": "<system name, 2–4 words>", "connectionStatus": "Connected|Partial|Disconnected" }

6. archRecommendations (up to 4 items)
   The highest-priority architecture improvement actions for this project.
   Each item: { "title": "<action, ≤6 words>", "impact": "High|Medium|Low", "effort": "Low|Medium|High" }

7. archStats
   Key architecture health metrics for this project.
   Object: { "architectureReadiness": <0–100>, "automation": <0–100>, "connectedSystems": <count>, "disconnectedSystems": <count> }

8. healthTimeline (exactly 4 items, fixed order: Source Systems, Integration, AI Data Hub, AI Application)
   Current health status of each architecture layer for this project.
   Each item: { "stage": "Source Systems|Integration|AI Data Hub|AI Application", "status": "<1-line description, ≤6 words>", "health": "Healthy|Needs Attention|Pending|Critical" }

   Add all to the brief object:
   "projectSystems": [...], "archRecommendations": [...], "archStats": {...}, "healthTimeline": [...]`,
  },

  'System Integration & Architecture': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "System Integration & Architecture" sections only:

5. integrationReadiness (number 0–100)
   The overall system integration readiness score as a percentage for this AI use case.

6. connectedSystems (exactly 4 items)
   The 4 key systems that must integrate with this AI solution.
   Each item: { "name": "<system name, 2–4 words>", "integrationMethod": "<e.g. REST API|Database|Webhook|Event Queue|Direct Integration>", "status": "CONNECTED|PARTIAL|MISSING", "healthIndicator": "Healthy|Degraded|Offline" }
   Rule: CONNECTED = fully integrated or ready, PARTIAL = partially integrated, MISSING = not yet integrated.

7. integrationSummary
   Summary of integration health across 4 key dimensions for this AI use case.
   Object: { "integration": "<Ready|Partial|Needs Improvement|Missing>", "automation": "<Ready|Partial|Needs Improvement|Missing>", "reliability": "<High|Medium|Low>", "scalability": "<Good|Moderate|Poor>" }

   Add all to the brief object:
   "integrationReadiness": <number>, "connectedSystems": [...], "integrationSummary": {...}`,
  },

  'AI Platform Readiness': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Platform Readiness" sections only:

5. platformReadiness (number 0–100)
   The overall AI platform readiness score as a percentage for this AI use case.

6. capabilityAssessment (exactly 4 items)
   The 4 most critical platform capability areas relevant to this AI use case.
   Each item: { "name": "<capability name, 2–5 words>", "score": <0–100>, "status": "READY|PARTIAL|MISSING" }
   Rule: READY = score ≥ 75, PARTIAL = score 40–74, MISSING = score < 40.

7. platformStack (exactly 6 items, in this fixed order)
   Readiness assessment for each layer of the AI platform stack.
   Each item: { "layer": "AI Applications|AI Model & Prompt Management|Knowledge & Retrieval Services|AI Deployment & Automation|AI Monitoring & Evaluation|AI Development Environment", "score": <0–100>, "status": "READY|PARTIAL|MISSING" }
   Use EXACTLY these layer names. Rule: READY = score ≥ 75, PARTIAL = score 40–74, MISSING = score < 40.

8. platformRecommendations (exactly 3 items)
   The 3 highest-priority actions to improve platform readiness for this AI use case.
   Each item: { "text": "<action, ≤10 words>", "priority": "HIGH|MEDIUM|LOW", "benefit": "<expected outcome, ≤8 words>" }

9. platformSummary
   Summary status of the 4 key platform areas for this AI use case.
   Object: { "development": "<Ready|Partial|Needs Improvement|Missing>", "knowledge": "<Ready|Partial|Needs Improvement|Missing>", "deployment": "<Ready|Partial|Needs Improvement|Missing>", "monitoring": "<Ready|Partial|Needs Improvement|Missing>" }

   Add all to the brief object:
   "platformReadiness": <number>, "capabilityAssessment": [...], "platformStack": [...], "platformRecommendations": [...], "platformSummary": {...}`,
  },

  'AI Compute & Deployment Strategy': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Compute & Deployment Strategy" sections only:

5. deploymentReadiness (number 0–100)
   The overall deployment readiness score as a percentage reflecting how prepared the infrastructure is for this AI use case.

6. workloadProfile (exactly 4 items)
   Profile of the distinct AI workloads required by this use case, covering different processing modes.
   Each item: { "workloadType": "<2–4 word workload name>", "computeRequirement": "Low|Medium|High|Very High", "performanceRequirement": "<e.g. Low Latency|High Throughput|Batch Processing|Real-time>", "scalabilityRequirement": "Low|Moderate|High|Critical", "priority": "LOW|MEDIUM|HIGH|CRITICAL" }
   Priority must reflect engineering importance. One item should be CRITICAL.

7. deploymentRecommendations (exactly 3 items)
   The top 3 AI-recommended deployment actions to maximise compute fit and operational confidence.
   Each item: { "text": "<recommendation, ≤8 words>", "impact": "High|Medium|Low", "reason": "<1 sentence explaining why, ≤12 words>" }

8. deploymentScores
   Key deployment quality metrics for this AI use case.
   Object: { "computeFit": <0–100>, "deploymentConfidence": <0–100>, "estimatedScalability": "Low|Moderate|High|Critical" }

9. deploymentKpis
   Summary deployment KPIs for the recommended strategy.
   Object: { "compute": "<e.g. GPU|CPU|TPU|Mixed>", "deployment": "<e.g. Cloud|Hybrid|Edge|On-Premise>", "latency": "<e.g. Low|Medium|High>", "scalability": "<e.g. Low|Moderate|High|Critical>" }

   Add all to the brief object:
   "deploymentReadiness": <number>, "workloadProfile": [...], "deploymentRecommendations": [...], "deploymentScores": {...}, "deploymentKpis": {...}`,
  },

  'AI Engineering Enablement': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Engineering Enablement" sections only:

5. engineeringReadiness (number 0–100)
   The overall engineering readiness score as a percentage for this AI use case.

6. engineeringCapabilities (exactly 5 items, in this fixed order)
   Assessment of the 5 key engineering capability areas for this AI use case.
   Each item: { "name": "Development Environment|Workflow|Testing|Deployment|Monitoring", "status": "READY|PARTIAL|ATTENTION", "score": <0–100> }
   Use EXACTLY these names in this order. Rule: READY = score ≥ 75, PARTIAL = score 50–74, ATTENTION = score < 50.

7. engineeringLifecycle (exactly 6 items, in this fixed order)
   Readiness and automation level for each stage of the AI engineering lifecycle.
   Each item: { "stage": "Plan|Develop|Test|Deploy|Monitor|Improve", "readiness": <0–100>, "automation": "High|Medium|Low" }
   Use EXACTLY these stage names in this order. Readiness must reflect realistic engineering maturity for this AI use case.

8. engineeringRecommendations (exactly 3 items)
   The 3 highest-priority actions to improve engineering enablement for this AI use case.
   Each item: { "text": "<action, ≤10 words>", "priority": "HIGH|MEDIUM|LOW", "businessImpact": "Significant|Moderate|Minor" }

9. automationStats
   Key automation metrics summarising the engineering delivery capability for this AI use case.
   Object: { "automation": "<percentage e.g. 85%>", "testing": "<percentage e.g. 92%>", "deployment": "<Ready|Partial|Not Ready>" }

10. engineeringSummary
    Summary health status of the 4 key engineering areas for this AI use case.
    Object: { "development": "<Ready|Strong|Partial|Needs Attention>", "testing": "<Ready|Strong|Partial|Needs Attention>", "deployment": "<Ready|Strong|Partial|Needs Attention>", "continuousImprovement": "<Good|Strong|Partial|Needs Attention>" }

   Add all to the brief object:
   "engineeringReadiness": <number>, "engineeringCapabilities": [...], "engineeringLifecycle": [...], "engineeringRecommendations": [...], "automationStats": {...}, "engineeringSummary": {...}`,
  },

  // ── Skills & Workforce domain ─────────────────────────────────────────────

  'AI Skills Assessment': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Skills Assessment" sections only:

5. skillsReadiness (number 0–100)
   The overall skills readiness score as a percentage for this AI use case.

6. requiredSkills (4 to 6 items)
   The most critical skills required for this AI use case across all four categories.
   Each item: { "name": "<skill name, 2–4 words>", "category": "Business|AI & Data|Engineering|Domain", "priority": "High|Medium|Low", "availability": "Available|Partial|Missing" }
   Include at least one skill per category. Priority must reflect criticality to delivery.

7. skillsMatrix (exactly 4 items, fixed order: Business Skills, AI & Data Skills, Engineering Skills, Domain Expertise)
   Each item: { "category": "Business Skills|AI & Data Skills|Engineering Skills|Domain Expertise", "readiness": <0–100>, "required": <count 1–10>, "missing": <count 0–5> }
   "missing" must be ≤ "required". Readiness reflects realistic skill availability for this project.

8. skillsRecommendations (exactly 3 items)
   Each item: { "title": "<action, 2–5 words>", "priority": "High|Medium|Low", "expectedBenefit": "<outcome, ≤8 words>" }

9. skillsStats
   Object: { "available": <count of skills marked Available>, "gaps": <count of Partial or Missing skills>, "critical": <count of High-priority Missing skills> }

10. skillsCategorySummary (exactly 4 items, fixed order: Business, AI & Data, Engineering, Domain)
    Each item: { "category": "Business|AI & Data|Engineering|Domain", "status": "Ready|Strong|Partial|Needs Improvement" }

   Add all to the brief object:
   "skillsReadiness": <number>, "requiredSkills": [...], "skillsMatrix": [...], "skillsRecommendations": [...], "skillsStats": {...}, "skillsCategorySummary": [...]`,
  },

  'AI Team Readiness': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Team Readiness" sections only:

5. teamReadiness (number 0–100)
   The overall team readiness score as a percentage for this AI use case.

6. requiredRoles (4 to 6 items)
   The key project roles required to deliver this AI use case.
   Each item: { "name": "<role name, 2–4 words>", "responsibility": "<primary responsibility, ≤6 words>", "availability": "Available|Partial|Missing", "priority": "High|Medium|Low" }
   Cover all four role categories: business leadership, AI specialists, engineering, domain expertise.

7. teamRecommendations (exactly 3 items)
   Each item: { "title": "<action, 2–5 words>", "priority": "High|Medium|Low", "impact": "<outcome, ≤8 words>" }

8. teamStats
   Object: { "required": <total roles count>, "available": <count of Available roles>, "missing": <count of Missing or Partial roles> }

9. teamCoverageSummary (exactly 4 items, fixed order: Business, AI, Engineering, Domain)
   Each item: { "category": "Business|AI|Engineering|Domain", "status": "Ready|Strong|Needs Support|Missing" }

   Add all to the brief object:
   "teamReadiness": <number>, "requiredRoles": [...], "teamRecommendations": [...], "teamStats": {...}, "teamCoverageSummary": [...]`,
  },

  'AI Learning & Adoption': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Learning & Adoption" sections only:

5. adoptionReadiness (number 0–100)
   The overall adoption readiness score as a percentage for this AI use case.

6. learningPillars (exactly 4 items, fixed order: AI Literacy, Engineering Learning, AI Tool Adoption, Human-AI Collaboration)
   Each item: { "name": "AI Literacy|Engineering Learning|AI Tool Adoption|Human-AI Collaboration", "description": "<focus phrase, ≤5 words>", "status": "Ready|In Progress|Not Started" }

7. adoptionLifecycle (exactly 5 items, fixed order: Awareness, Learning, Experimentation, Integration, Mastery)
   Each item: { "stage": "Awareness|Learning|Experimentation|Integration|Mastery", "currentStatus": "<2–4 word status>", "readiness": <0–100>, "keyActivities": ["<≤5 word activity>", "<≤5 word activity>", "<≤5 word activity>"] }
   Readiness values must increase stage by stage — Mastery must be 100.

8. adoptionRecommendations (exactly 3 items)
   Each item: { "title": "<action, 2–5 words>", "priority": "High|Medium|Low", "expectedOutcome": "<outcome, ≤5 words>" }

9. adoptionStats
   Object: { "teamsTrained": <count>, "toolsAdopted": <count>, "adoptionRate": "<percentage e.g. 68%>" }

10. adoptionReadinessSummary (exactly 4 items, fixed order: AI Literacy, Tool Adoption, Collaboration, Knowledge Sharing)
    Each item: { "category": "AI Literacy|Tool Adoption|Collaboration|Knowledge Sharing", "status": "Ready|In Progress|Emerging|Developing" }

   Add all to the brief object:
   "adoptionReadiness": <number>, "learningPillars": [...], "adoptionLifecycle": [...], "adoptionRecommendations": [...], "adoptionStats": {...}, "adoptionReadinessSummary": [...]`,
  },

};

// ── Shared output parser ──────────────────────────────────────────────────────
// Normalises and validates the brief JSON returned by any LLM call.

function parseBriefOutput(rawSections, validTitles) {
  return rawSections
    .map(s => {
      const b  = s.brief || {};
      const lv = b.leadershipValidation || {};

      const rawPillars = Array.isArray(b.strategicPillars) ? b.strategicPillars : [];
      const strategicPillars = rawPillars
        .filter(p => p && typeof p === 'object' && String(p.title || '').trim())
        .map(p => ({
          title:             String(p.title             || '').trim(),
          description:       String(p.description       || '').trim(),
          businessImpactTag: String(p.businessImpactTag || '').trim(),
        }))
        .slice(0, 3);

      const rawKpi = Array.isArray(b.kpiHighlights) ? b.kpiHighlights : [];
      const kpiHighlights = rawKpi
        .filter(k => k && typeof k === 'object' && String(k.value || '').trim())
        .map(k => ({
          value:       String(k.value       || '').trim(),
          label:       String(k.label       || '').trim(),
          description: String(k.description || '').trim(),
        }))
        .slice(0, 3);

      const timelineSteps = Array.isArray(b.timelineSteps)
        ? b.timelineSteps.map(String).filter(Boolean).slice(0, 4)
        : [];

      const rawInitiatives = Array.isArray(b.alignmentInitiatives) ? b.alignmentInitiatives : [];
      const alignmentInitiatives = rawInitiatives
        .filter(i => i && typeof i === 'object' && String(i.title || '').trim())
        .map(i => ({
          title:       String(i.title       || '').trim(),
          description: String(i.description || '').trim(),
        }))
        .slice(0, 4);

      const rawFunnelStages = Array.isArray(b.funnelStages) ? b.funnelStages : [];
      const funnelStages = rawFunnelStages
        .filter(f => f && typeof f === 'object' && String(f.count || '').trim())
        .map(f => ({
          count: String(f.count || '').trim(),
          label: String(f.label || '').trim(),
        }))
        .slice(0, 4);

      const rawMatrixQuadrants = Array.isArray(b.matrixQuadrants) ? b.matrixQuadrants : [];
      const matrixQuadrants = rawMatrixQuadrants
        .filter(q => q && typeof q === 'object' && String(q.title || '').trim())
        .map(q => ({
          title:       String(q.title || '').trim(),
          initiatives: Array.isArray(q.initiatives) ? q.initiatives.map(String).filter(Boolean) : [],
        }))
        .slice(0, 4);

      const rawQuarterlyPlan = Array.isArray(b.quarterlyPlan) ? b.quarterlyPlan : [];
      const quarterlyPlan = rawQuarterlyPlan
        .filter(p => p && typeof p === 'object' && String(p.quarter || '').trim())
        .map(p => ({
          quarter:     String(p.quarter || '').trim(),
          initiatives: Array.isArray(p.initiatives) ? p.initiatives.map(String).filter(Boolean) : [],
        }))
        .slice(0, 4);

      const rawCommitmentPillars = Array.isArray(b.commitmentPillars) ? b.commitmentPillars : [];
      const commitmentPillars = rawCommitmentPillars
        .filter(p => p && typeof p === 'object' && String(p.title || '').trim())
        .map(p => ({
          title:   String(p.title || '').trim(),
          actions: Array.isArray(p.actions) ? p.actions.map(String).filter(Boolean) : [],
        }))
        .slice(0, 3);

      const rawGovernanceNodes = Array.isArray(b.governanceNodes) ? b.governanceNodes : [];
      const governanceNodes = rawGovernanceNodes
        .filter(n => n && typeof n === 'object' && String(n.title || '').trim())
        .map(n => ({
          title:       String(n.title       || '').trim(),
          description: String(n.description || '').trim(),
        }))
        .slice(0, 4);

      const rawSolutionPortfolio = Array.isArray(b.solutionPortfolio) ? b.solutionPortfolio : [];
      const solutionPortfolio = rawSolutionPortfolio
        .filter(s => s && typeof s === 'object' && String(s.name || '').trim())
        .map(s => ({
          name:          String(s.name          || '').trim(),
          businessOwner: String(s.businessOwner || '').trim(),
          deliveryTeam:  String(s.deliveryTeam  || '').trim(),
          kpis:          Array.isArray(s.kpis) ? s.kpis.map(String).filter(Boolean) : [],
        }))
        .slice(0, 3);

      const rawTeamRoles = Array.isArray(b.teamRoles) ? b.teamRoles : [];
      const teamRoles = rawTeamRoles
        .filter(r => r && typeof r === 'object' && String(r.title || '').trim())
        .map(r => ({
          title:       String(r.title       || '').trim(),
          description: String(r.description || '').trim(),
        }))
        .slice(0, 7);

      const rawLifecycleStages = Array.isArray(b.lifecycleStages) ? b.lifecycleStages : [];
      const lifecycleStages = rawLifecycleStages
        .filter(s => s && typeof s === 'object' && String(s.stage || '').trim())
        .map(s => ({
          stage:              String(s.stage              || '').trim(),
          teamResponsibility: String(s.teamResponsibility || '').trim(),
          keyActivities:      String(s.keyActivities      || '').trim(),
        }))
        .slice(0, 6);

      // ── AI ROI parsers ─────────────────────────────────────────────────────

      const rawWaterfallItems = Array.isArray(b.waterfallItems) ? b.waterfallItems : [];
      const waterfallItems = rawWaterfallItems
        .filter(it => it && typeof it === 'object' && String(it.category || '').trim())
        .map(it => ({
          category:    String(it.category    || '').trim(),
          value:       String(it.value       || '0').trim(),
          type:        ['negative', 'positive', 'total'].includes(it.type) ? it.type : 'positive',
          description: String(it.description || '').trim(),
        }))
        .slice(0, 6);

      const rawSdlcStages = Array.isArray(b.sdlcStages) ? b.sdlcStages : [];
      const sdlcStages = rawSdlcStages
        .filter(s => s && typeof s === 'object' && String(s.stage || '').trim())
        .map(s => ({
          stage:       String(s.stage       || '').trim(),
          aiTool:      String(s.aiTool      || '').trim(),
          description: String(s.description || '').trim(),
        }))
        .slice(0, 5);

      function parsePillarBullets(arr) {
        return (Array.isArray(arr) ? arr : [])
          .filter(it => it && typeof it === 'object' && String(it.name || '').trim())
          .map(it => ({
            name:   String(it.name || '').trim(),
            points: Array.isArray(it.points) ? it.points.map(String).filter(Boolean) : [],
          }));
      }

      const flywheelStages    = parsePillarBullets(b.flywheelStages).slice(0, 5);

      // ── AI Governance & Ethics parsers ────────────────────────────────────

      const securityPillars   = parsePillarBullets(b.securityPillars).slice(0, 4);
      const ethicsPillars     = parsePillarBullets(b.ethicsPillars).slice(0, 4);
      const complianceControls = parsePillarBullets(b.complianceControls).slice(0, 4);
      const adoptionStages    = parsePillarBullets(b.adoptionStages).slice(0, 5);

      // ── AI Use Cases parsers ───────────────────────────────────────────────

      const rawValueCategories = Array.isArray(b.valueCategories) ? b.valueCategories : [];
      const valueCategories = rawValueCategories
        .filter(c => c && typeof c === 'object' && String(c.title || '').trim())
        .map(c => ({
          title:    String(c.title || '').trim(),
          focus:    String(c.focus || '').trim(),
          outcomes: Array.isArray(c.outcomes) ? c.outcomes.map(String).filter(Boolean).slice(0, 4) : [],
        }))
        .slice(0, 4);

      const kpiPills = Array.isArray(b.kpiPills)
        ? b.kpiPills.map(String).filter(Boolean).slice(0, 6) : [];

      const businessValueInsight = typeof b.businessValueInsight === 'string'
        ? b.businessValueInsight.trim() : '';

      const recommendedStartingPoint = typeof b.recommendedStartingPoint === 'string'
        ? b.recommendedStartingPoint.trim() : '';

      const rawPriorityQuadrants = Array.isArray(b.priorityQuadrants) ? b.priorityQuadrants : [];
      const priorityQuadrants = rawPriorityQuadrants
        .filter(q => q && typeof q === 'object' && String(q.label || '').trim())
        .map(q => ({
          id:          String(q.id    || '').trim(),
          label:       String(q.label || '').trim(),
          initiatives: Array.isArray(q.initiatives) ? q.initiatives.map(String).filter(Boolean) : [],
        }))
        .slice(0, 4);

      const rawDimensionCards = Array.isArray(b.dimensionCards) ? b.dimensionCards : [];
      const dimensionCards = rawDimensionCards
        .filter(d => d && typeof d === 'object' && String(d.title || '').trim())
        .map(d => ({
          title:   String(d.title || '').trim(),
          bullets: Array.isArray(d.bullets) ? d.bullets.map(String).filter(Boolean) : [],
        }))
        .slice(0, 4);

      const prioritizationInsight = typeof b.prioritizationInsight === 'string'
        ? b.prioritizationInsight.trim() : '';

      const primaryClassification = b.primaryClassification && typeof b.primaryClassification === 'object'
        ? { name: String(b.primaryClassification.name || '').trim(), rationale: String(b.primaryClassification.rationale || '').trim(), businessOutcome: String(b.primaryClassification.businessOutcome || '').trim() }
        : null;

      const secondaryClassification = b.secondaryClassification && typeof b.secondaryClassification === 'object'
        ? { name: String(b.secondaryClassification.name || '').trim(), rationale: String(b.secondaryClassification.rationale || '').trim(), businessOutcome: String(b.secondaryClassification.businessOutcome || '').trim() }
        : null;

      const transformationImplication = typeof b.transformationImplication === 'string'
        ? b.transformationImplication.trim() : '';

      const businessProblems     = Array.isArray(b.businessProblems)
        ? b.businessProblems.map(String).filter(Boolean).slice(0, 6) : [];
      const workflowSteps        = Array.isArray(b.workflowSteps)
        ? b.workflowSteps.map(String).filter(Boolean).slice(0, 5) : [];
      const highEffortActivities = Array.isArray(b.highEffortActivities)
        ? b.highEffortActivities.map(String).filter(Boolean).slice(0, 4) : [];
      const aiOpportunities      = Array.isArray(b.aiOpportunities)
        ? b.aiOpportunities.map(String).filter(Boolean).slice(0, 6) : [];

      const rawModelLifecycleStages = Array.isArray(b.modelLifecycleStages) ? b.modelLifecycleStages : [];
      const modelLifecycleStages = rawModelLifecycleStages
        .filter(s => s && typeof s === 'object' && String(s.stage || '').trim())
        .map(s => ({
          stage:  String(s.stage || '').trim(),
          points: Array.isArray(s.points) ? s.points.map(String).filter(Boolean) : [],
        }))
        .slice(0, 6);

      // ── Data Readiness: Critical Data Identification parsers ──────────────────

      const rawDatasets = Array.isArray(b.datasets) ? b.datasets : [];
      const datasets = rawDatasets
        .filter(d => d && typeof d === 'object' && String(d.name || '').trim())
        .map(d => ({
          name:         String(d.name         || '').trim(),
          purpose:      String(d.purpose      || '').trim(),
          priority:     String(d.priority     || 'MEDIUM').trim(),
          availability: String(d.availability || 'UNKNOWN').trim(),
          category:     String(d.category     || '').trim(),
        }))
        .slice(0, 7);

      const rawRelMap = b.relationshipMap && typeof b.relationshipMap === 'object' ? b.relationshipMap : {};
      const relationshipMap = {
        dataSource:    Array.isArray(rawRelMap.dataSource)    ? rawRelMap.dataSource.map(String).filter(Boolean)    : [],
        dependentData: Array.isArray(rawRelMap.dependentData) ? rawRelMap.dependentData.map(String).filter(Boolean) : [],
        relatedData:   Array.isArray(rawRelMap.relatedData)   ? rawRelMap.relatedData.map(String).filter(Boolean)   : [],
        targetData:    Array.isArray(rawRelMap.targetData)    ? rawRelMap.targetData.map(String).filter(Boolean)    : [],
      };

      const rawRecs = Array.isArray(b.recommendations) ? b.recommendations : [];
      const recommendations = rawRecs
        .filter(r => r && typeof r === 'object' && String(r.text || '').trim())
        .map(r => ({
          text:     String(r.text     || '').trim(),
          priority: String(r.priority || 'MEDIUM').trim(),
        }))
        .slice(0, 3);

      const rawCoverage = b.coverageSummary && typeof b.coverageSummary === 'object' ? b.coverageSummary : {};
      const coverageSummary = {
        criticalDatasets: parseInt(rawCoverage.criticalDatasets, 10) || 0,
        missingData:      parseInt(rawCoverage.missingData,      10) || 0,
        confidence:       parseInt(rawCoverage.confidence,       10) || 0,
      };

      // ── Data Readiness: AI Data Preparation parsers ───────────────────────────

      const rawInputDatasets = Array.isArray(b.inputDatasets) ? b.inputDatasets : [];
      const inputDatasets = rawInputDatasets
        .filter(d => d && typeof d === 'object' && String(d.name || '').trim())
        .map(d => ({
          name:   String(d.name   || '').trim(),
          status: String(d.status || 'AVAILABLE').trim(),
        }))
        .slice(0, 4);

      const PIPELINE_STAGES = ['Raw Data', 'Quality Check', 'Standardization', 'Integration'];
      const rawPipelineStages = Array.isArray(b.pipelineStages) ? b.pipelineStages : [];
      const pipelineStages = PIPELINE_STAGES.map(stageName => {
        const found = rawPipelineStages.find(s => s && String(s.stage || '').trim() === stageName);
        return {
          stage:  stageName,
          status: found ? String(found.status || 'Pending').trim() : 'Pending',
        };
      });

      const rawPrepRecs = Array.isArray(b.prepRecommendations) ? b.prepRecommendations : [];
      const prepRecommendations = rawPrepRecs
        .filter(r => r && typeof r === 'object' && String(r.text || '').trim())
        .map(r => ({
          text:     String(r.text     || '').trim(),
          priority: String(r.priority || 'MEDIUM').trim(),
          effort:   String(r.effort   || 'MEDIUM').trim(),
          impact:   String(r.impact   || '').trim(),
        }))
        .slice(0, 3);

      const rawDataStats = b.dataStats && typeof b.dataStats === 'object' ? b.dataStats : {};
      const dataStats = {
        missingData:  parseInt(rawDataStats.missingData,  10) || 0,
        dataQuality:  parseInt(rawDataStats.dataQuality,  10) || 0,
        traceability: parseInt(rawDataStats.traceability, 10) || 0,
      };

      const rawReadiness = b.readinessSummary && typeof b.readinessSummary === 'object' ? b.readinessSummary : {};
      const readinessSummary = {
        quality:         parseInt(rawReadiness.quality,         10) || 0,
        standardization: parseInt(rawReadiness.standardization, 10) || 0,
        integration:     parseInt(rawReadiness.integration,     10) || 0,
        aiReadiness:     parseInt(rawReadiness.aiReadiness,     10) || 0,
      };

      // ── Technology Infrastructure: System Integration & Architecture parsers ──

      const integrationReadiness = parseInt(b.integrationReadiness, 10) || 0;

      const rawConnectedSystems = Array.isArray(b.connectedSystems) ? b.connectedSystems : [];
      const connectedSystems = rawConnectedSystems
        .filter(s => s && typeof s === 'object' && String(s.name || '').trim())
        .map(s => ({
          name:              String(s.name              || '').trim(),
          integrationMethod: String(s.integrationMethod || '').trim(),
          status:            String(s.status            || 'MISSING').trim().toUpperCase(),
          healthIndicator:   String(s.healthIndicator   || '').trim(),
        }))
        .slice(0, 4);

      const rawIntegrationSummary = b.integrationSummary && typeof b.integrationSummary === 'object'
        ? b.integrationSummary : {};
      const integrationSummary = {
        integration: String(rawIntegrationSummary.integration || '').trim(),
        automation:  String(rawIntegrationSummary.automation  || '').trim(),
        reliability: String(rawIntegrationSummary.reliability || '').trim(),
        scalability: String(rawIntegrationSummary.scalability || '').trim(),
      };

      // ── Technology Infrastructure: AI Platform Readiness parsers ─────────────

      const platformReadiness = parseInt(b.platformReadiness, 10) || 0;

      const rawCapabilityAssessment = Array.isArray(b.capabilityAssessment) ? b.capabilityAssessment : [];
      const capabilityAssessment = rawCapabilityAssessment
        .filter(c => c && typeof c === 'object' && String(c.name || '').trim())
        .map(c => ({
          name:   String(c.name   || '').trim(),
          score:  parseInt(c.score, 10) || 0,
          status: String(c.status || 'PARTIAL').trim().toUpperCase(),
        }))
        .slice(0, 4);

      const PLATFORM_STACK_LAYERS = [
        'AI Applications',
        'AI Model & Prompt Management',
        'Knowledge & Retrieval Services',
        'AI Deployment & Automation',
        'AI Monitoring & Evaluation',
        'AI Development Environment',
      ];
      const rawPlatformStack = Array.isArray(b.platformStack) ? b.platformStack : [];
      const platformStack = PLATFORM_STACK_LAYERS.map(layerName => {
        const found = rawPlatformStack.find(l => l && String(l.layer || '').trim() === layerName);
        return {
          layer:  layerName,
          score:  found ? parseInt(found.score, 10) || 0 : 0,
          status: found ? String(found.status || 'MISSING').trim().toUpperCase() : 'MISSING',
        };
      });

      const rawPlatformRecs = Array.isArray(b.platformRecommendations) ? b.platformRecommendations : [];
      const platformRecommendations = rawPlatformRecs
        .filter(r => r && typeof r === 'object' && String(r.text || '').trim())
        .map(r => ({
          text:     String(r.text     || '').trim(),
          priority: String(r.priority || 'MEDIUM').trim().toUpperCase(),
          benefit:  String(r.benefit  || '').trim(),
        }))
        .slice(0, 3);

      const rawPlatformSummary = b.platformSummary && typeof b.platformSummary === 'object' ? b.platformSummary : {};
      const platformSummary = {
        development: String(rawPlatformSummary.development || '').trim(),
        knowledge:   String(rawPlatformSummary.knowledge   || '').trim(),
        deployment:  String(rawPlatformSummary.deployment  || '').trim(),
        monitoring:  String(rawPlatformSummary.monitoring  || '').trim(),
      };

      // ── Technology Infrastructure: AI Compute & Deployment Strategy parsers ──

      const deploymentReadiness = parseInt(b.deploymentReadiness, 10) || 0;

      const rawWorkloadProfile = Array.isArray(b.workloadProfile) ? b.workloadProfile : [];
      const workloadProfile = rawWorkloadProfile
        .filter(w => w && typeof w === 'object' && String(w.workloadType || '').trim())
        .map(w => ({
          workloadType:            String(w.workloadType            || '').trim(),
          computeRequirement:      String(w.computeRequirement      || '').trim(),
          performanceRequirement:  String(w.performanceRequirement  || '').trim(),
          scalabilityRequirement:  String(w.scalabilityRequirement  || '').trim(),
          priority:                String(w.priority                || 'MEDIUM').trim().toUpperCase(),
        }))
        .slice(0, 4);

      const rawDeploymentRecs = Array.isArray(b.deploymentRecommendations) ? b.deploymentRecommendations : [];
      const deploymentRecommendations = rawDeploymentRecs
        .filter(r => r && typeof r === 'object' && String(r.text || '').trim())
        .map(r => ({
          text:   String(r.text   || '').trim(),
          impact: String(r.impact || 'Medium').trim(),
          reason: String(r.reason || '').trim(),
        }))
        .slice(0, 3);

      const rawDeploymentScores = b.deploymentScores && typeof b.deploymentScores === 'object' ? b.deploymentScores : {};
      const deploymentScores = {
        computeFit:           parseInt(rawDeploymentScores.computeFit,           10) || 0,
        deploymentConfidence: parseInt(rawDeploymentScores.deploymentConfidence, 10) || 0,
        estimatedScalability: String(rawDeploymentScores.estimatedScalability   || '').trim(),
      };

      const rawDeploymentKpis = b.deploymentKpis && typeof b.deploymentKpis === 'object' ? b.deploymentKpis : {};
      const deploymentKpis = {
        compute:    String(rawDeploymentKpis.compute    || '').trim(),
        deployment: String(rawDeploymentKpis.deployment || '').trim(),
        latency:    String(rawDeploymentKpis.latency    || '').trim(),
        scalability: String(rawDeploymentKpis.scalability || '').trim(),
      };

      // ── Technology Infrastructure: AI Engineering Enablement parsers ─────────

      const engineeringReadiness = parseInt(b.engineeringReadiness, 10) || 0;

      const ENG_CAP_NAMES = ['Development Environment', 'Workflow', 'Testing', 'Deployment', 'Monitoring'];
      const rawEngCaps = Array.isArray(b.engineeringCapabilities) ? b.engineeringCapabilities : [];
      const engineeringCapabilities = ENG_CAP_NAMES.map(capName => {
        const found = rawEngCaps.find(c => c && String(c.name || '').trim() === capName);
        return {
          name:   capName,
          status: found ? String(found.status || 'PARTIAL').trim().toUpperCase() : 'PARTIAL',
          score:  found ? parseInt(found.score, 10) || 0 : 0,
        };
      });

      const ENG_LIFECYCLE_STAGES = ['Plan', 'Develop', 'Test', 'Deploy', 'Monitor', 'Improve'];
      const rawEngLifecycle = Array.isArray(b.engineeringLifecycle) ? b.engineeringLifecycle : [];
      const engineeringLifecycle = ENG_LIFECYCLE_STAGES.map(stageName => {
        const found = rawEngLifecycle.find(s => s && String(s.stage || '').trim() === stageName);
        return {
          stage:      stageName,
          readiness:  found ? parseInt(found.readiness, 10) || 0 : 0,
          automation: found ? String(found.automation || 'Low').trim() : 'Low',
        };
      });

      const rawEngRecs = Array.isArray(b.engineeringRecommendations) ? b.engineeringRecommendations : [];
      const engineeringRecommendations = rawEngRecs
        .filter(r => r && typeof r === 'object' && String(r.text || '').trim())
        .map(r => ({
          text:           String(r.text           || '').trim(),
          priority:       String(r.priority       || 'MEDIUM').trim().toUpperCase(),
          businessImpact: String(r.businessImpact || 'Moderate').trim(),
        }))
        .slice(0, 3);

      const rawAutoStats = b.automationStats && typeof b.automationStats === 'object' ? b.automationStats : {};
      const automationStats = {
        automation: String(rawAutoStats.automation || '').trim(),
        testing:    String(rawAutoStats.testing    || '').trim(),
        deployment: String(rawAutoStats.deployment || '').trim(),
      };

      const rawEngSummary = b.engineeringSummary && typeof b.engineeringSummary === 'object' ? b.engineeringSummary : {};
      const engineeringSummary = {
        development:           String(rawEngSummary.development           || '').trim(),
        testing:               String(rawEngSummary.testing               || '').trim(),
        deployment:            String(rawEngSummary.deployment            || '').trim(),
        continuousImprovement: String(rawEngSummary.continuousImprovement || '').trim(),
      };

      // ── Data Readiness: Data Architecture Enablement parsers ─────────────────

      const rawProjectSystems = Array.isArray(b.projectSystems) ? b.projectSystems : [];
      const projectSystems = rawProjectSystems
        .filter(s => s && typeof s === 'object' && String(s.name || '').trim())
        .map(s => ({
          name:             String(s.name             || '').trim(),
          connectionStatus: String(s.connectionStatus || 'Disconnected').trim(),
        }))
        .slice(0, 4);

      const rawArchRecs = Array.isArray(b.archRecommendations) ? b.archRecommendations : [];
      const archRecommendations = rawArchRecs
        .filter(r => r && typeof r === 'object' && String(r.title || '').trim())
        .map(r => ({
          title:  String(r.title  || '').trim(),
          impact: String(r.impact || 'Medium').trim(),
          effort: String(r.effort || 'Medium').trim(),
        }))
        .slice(0, 4);

      const rawArchStats = b.archStats && typeof b.archStats === 'object' ? b.archStats : {};
      const archStats = {
        architectureReadiness: parseInt(rawArchStats.architectureReadiness, 10) || 0,
        automation:            parseInt(rawArchStats.automation,            10) || 0,
        connectedSystems:      parseInt(rawArchStats.connectedSystems,      10) || 0,
        disconnectedSystems:   parseInt(rawArchStats.disconnectedSystems,   10) || 0,
      };

      const HEALTH_STAGES = ['Source Systems', 'Integration', 'AI Data Hub', 'AI Application'];
      const rawHealthTimeline = Array.isArray(b.healthTimeline) ? b.healthTimeline : [];
      const healthTimeline = HEALTH_STAGES.map(stageName => {
        const found = rawHealthTimeline.find(h => h && String(h.stage || '').trim() === stageName);
        return {
          stage:  stageName,
          status: found ? String(found.status || '').trim() : '',
          health: found ? String(found.health || 'Pending').trim() : 'Pending',
        };
      });

      // ── Skills & Workforce: AI Skills Assessment parsers ─────────────────────

      const skillsReadiness = parseInt(b.skillsReadiness, 10) || 0;

      const rawRequiredSkills = Array.isArray(b.requiredSkills) ? b.requiredSkills : [];
      const requiredSkills = rawRequiredSkills
        .filter(sk => sk && typeof sk === 'object' && String(sk.name || '').trim())
        .map(sk => ({
          name:         String(sk.name         || '').trim(),
          category:     String(sk.category     || '').trim(),
          priority:     String(sk.priority     || 'Medium').trim(),
          availability: String(sk.availability || 'Partial').trim(),
        }))
        .slice(0, 6);

      const SKILLS_MATRIX_CATEGORIES = ['Business Skills', 'AI & Data Skills', 'Engineering Skills', 'Domain Expertise'];
      const rawSkillsMatrix = Array.isArray(b.skillsMatrix) ? b.skillsMatrix : [];
      const skillsMatrix = SKILLS_MATRIX_CATEGORIES.map(catName => {
        const found = rawSkillsMatrix.find(c => c && String(c.category || '').trim() === catName);
        return {
          category:  catName,
          readiness: found ? parseInt(found.readiness, 10) || 0 : 0,
          required:  found ? parseInt(found.required,  10) || 0 : 0,
          missing:   found ? parseInt(found.missing,   10) || 0 : 0,
        };
      });

      const rawSkillsRecs = Array.isArray(b.skillsRecommendations) ? b.skillsRecommendations : [];
      const skillsRecommendations = rawSkillsRecs
        .filter(r => r && typeof r === 'object' && String(r.title || '').trim())
        .map(r => ({
          title:           String(r.title           || '').trim(),
          priority:        String(r.priority        || 'Medium').trim(),
          expectedBenefit: String(r.expectedBenefit || '').trim(),
        }))
        .slice(0, 3);

      const rawSkillsStats = b.skillsStats && typeof b.skillsStats === 'object' ? b.skillsStats : {};
      const skillsStats = {
        available: parseInt(rawSkillsStats.available, 10) || 0,
        gaps:      parseInt(rawSkillsStats.gaps,      10) || 0,
        critical:  parseInt(rawSkillsStats.critical,  10) || 0,
      };

      const SKILLS_SUMMARY_CATS = ['Business', 'AI & Data', 'Engineering', 'Domain'];
      const rawSkillsCatSummary = Array.isArray(b.skillsCategorySummary) ? b.skillsCategorySummary : [];
      const skillsCategorySummary = SKILLS_SUMMARY_CATS.map(catName => {
        const found = rawSkillsCatSummary.find(c => c && String(c.category || '').trim() === catName);
        return { category: catName, status: found ? String(found.status || '').trim() : '' };
      });

      // ── Skills & Workforce: AI Team Readiness parsers ─────────────────────────

      const teamReadiness = parseInt(b.teamReadiness, 10) || 0;

      const rawRequiredRoles = Array.isArray(b.requiredRoles) ? b.requiredRoles : [];
      const requiredRoles = rawRequiredRoles
        .filter(r => r && typeof r === 'object' && String(r.name || '').trim())
        .map(r => ({
          name:           String(r.name           || '').trim(),
          responsibility: String(r.responsibility || '').trim(),
          availability:   String(r.availability   || 'Partial').trim(),
          priority:       String(r.priority       || 'Medium').trim(),
        }))
        .slice(0, 6);

      const rawTeamRecs = Array.isArray(b.teamRecommendations) ? b.teamRecommendations : [];
      const teamRecommendations = rawTeamRecs
        .filter(r => r && typeof r === 'object' && String(r.title || '').trim())
        .map(r => ({
          title:    String(r.title    || '').trim(),
          priority: String(r.priority || 'Medium').trim(),
          impact:   String(r.impact   || '').trim(),
        }))
        .slice(0, 3);

      const rawTeamStats = b.teamStats && typeof b.teamStats === 'object' ? b.teamStats : {};
      const teamStats = {
        required:  parseInt(rawTeamStats.required,  10) || 0,
        available: parseInt(rawTeamStats.available, 10) || 0,
        missing:   parseInt(rawTeamStats.missing,   10) || 0,
      };

      const TEAM_COVERAGE_CATS = ['Business', 'AI', 'Engineering', 'Domain'];
      const rawTeamCoverage = Array.isArray(b.teamCoverageSummary) ? b.teamCoverageSummary : [];
      const teamCoverageSummary = TEAM_COVERAGE_CATS.map(catName => {
        const found = rawTeamCoverage.find(c => c && String(c.category || '').trim() === catName);
        return { category: catName, status: found ? String(found.status || '').trim() : '' };
      });

      // ── Skills & Workforce: AI Learning & Adoption parsers ───────────────────

      const adoptionReadiness = parseInt(b.adoptionReadiness, 10) || 0;

      const LEARNING_PILLAR_NAMES = ['AI Literacy', 'Engineering Learning', 'AI Tool Adoption', 'Human-AI Collaboration'];
      const rawLearningPillars = Array.isArray(b.learningPillars) ? b.learningPillars : [];
      const learningPillars = LEARNING_PILLAR_NAMES.map(pillarName => {
        const found = rawLearningPillars.find(p => p && String(p.name || '').trim() === pillarName);
        return {
          name:        pillarName,
          description: found ? String(found.description || '').trim() : '',
          status:      found ? String(found.status      || 'Not Started').trim() : 'Not Started',
        };
      });

      const ADOPTION_STAGE_NAMES = ['Awareness', 'Learning', 'Experimentation', 'Integration', 'Mastery'];
      const rawAdoptionLifecycle = Array.isArray(b.adoptionLifecycle) ? b.adoptionLifecycle : [];
      const adoptionLifecycle = ADOPTION_STAGE_NAMES.map(stageName => {
        const found = rawAdoptionLifecycle.find(st => st && String(st.stage || '').trim() === stageName);
        return {
          stage:         stageName,
          currentStatus: found ? String(found.currentStatus || '').trim() : '',
          readiness:     found ? parseInt(found.readiness, 10) || 0 : 0,
          keyActivities: found && Array.isArray(found.keyActivities)
                          ? found.keyActivities.map(String).filter(Boolean).slice(0, 3) : [],
        };
      });

      const rawAdoptionRecs = Array.isArray(b.adoptionRecommendations) ? b.adoptionRecommendations : [];
      const adoptionRecommendations = rawAdoptionRecs
        .filter(r => r && typeof r === 'object' && String(r.title || '').trim())
        .map(r => ({
          title:           String(r.title           || '').trim(),
          priority:        String(r.priority        || 'Medium').trim(),
          expectedOutcome: String(r.expectedOutcome || '').trim(),
        }))
        .slice(0, 3);

      const rawAdoptionStats = b.adoptionStats && typeof b.adoptionStats === 'object' ? b.adoptionStats : {};
      const adoptionStats = {
        teamsTrained: parseInt(rawAdoptionStats.teamsTrained, 10) || 0,
        toolsAdopted: parseInt(rawAdoptionStats.toolsAdopted, 10) || 0,
        adoptionRate: String(rawAdoptionStats.adoptionRate || '').trim(),
      };

      const ADOPTION_SUMMARY_CATS = ['AI Literacy', 'Tool Adoption', 'Collaboration', 'Knowledge Sharing'];
      const rawAdoptionSummary = Array.isArray(b.adoptionReadinessSummary) ? b.adoptionReadinessSummary : [];
      const adoptionReadinessSummary = ADOPTION_SUMMARY_CATS.map(catName => {
        const found = rawAdoptionSummary.find(c => c && String(c.category || '').trim() === catName);
        return { category: catName, status: found ? String(found.status || '').trim() : '' };
      });

      return {
        title: String(s.title || '').trim(),
        brief: {
          strategicPosition:    String(b.strategicPosition || '').trim(),
          priorityActions:      Array.isArray(b.priorityActions) ? b.priorityActions.map(String) : [],
          successMetrics:       Array.isArray(b.successMetrics)  ? b.successMetrics.map(String)  : [],
          leadershipValidation: {
            status:  ['Approved', 'In Review', 'Not Yet Validated'].includes(lv.status)
                       ? lv.status : 'Not Yet Validated',
            context: String(lv.context || '').trim(),
          },
          ...(strategicPillars.length     ? { strategicPillars }     : {}),
          ...(kpiHighlights.length        ? { kpiHighlights }        : {}),
          ...(timelineSteps.length        ? { timelineSteps }        : {}),
          ...(alignmentInitiatives.length ? { alignmentInitiatives } : {}),
          ...(commitmentPillars.length    ? { commitmentPillars }    : {}),
          ...(governanceNodes.length      ? { governanceNodes }      : {}),
          ...(funnelStages.length         ? { funnelStages }         : {}),
          ...(matrixQuadrants.length      ? { matrixQuadrants }      : {}),
          ...(quarterlyPlan.length        ? { quarterlyPlan }        : {}),
          ...(solutionPortfolio.length    ? { solutionPortfolio }    : {}),
          ...(teamRoles.length            ? { teamRoles }            : {}),
          ...(lifecycleStages.length      ? { lifecycleStages }      : {}),
          // AI ROI extras
          ...(waterfallItems.length       ? { waterfallItems }       : {}),
          ...(sdlcStages.length           ? { sdlcStages }           : {}),
          ...(flywheelStages.length       ? { flywheelStages }       : {}),
          // AI Governance & Ethics extras
          ...(securityPillars.length      ? { securityPillars }      : {}),
          ...(ethicsPillars.length        ? { ethicsPillars }        : {}),
          ...(modelLifecycleStages.length ? { modelLifecycleStages } : {}),
          ...(complianceControls.length   ? { complianceControls }   : {}),
          ...(adoptionStages.length       ? { adoptionStages }       : {}),
          // AI Use Cases extras
          ...(valueCategories.length               ? { valueCategories }          : {}),
          ...(kpiPills.length                      ? { kpiPills }                 : {}),
          ...(businessValueInsight                 ? { businessValueInsight }     : {}),
          ...(recommendedStartingPoint             ? { recommendedStartingPoint } : {}),
          ...(priorityQuadrants.length             ? { priorityQuadrants }        : {}),
          ...(dimensionCards.length                ? { dimensionCards }            : {}),
          ...(prioritizationInsight                ? { prioritizationInsight }     : {}),
          ...(primaryClassification                ? { primaryClassification }   : {}),
          ...(secondaryClassification              ? { secondaryClassification } : {}),
          ...(transformationImplication                ? { transformationImplication }   : {}),
          ...(businessProblems.length     ? { businessProblems }     : {}),
          ...(workflowSteps.length        ? { workflowSteps }        : {}),
          ...(highEffortActivities.length ? { highEffortActivities } : {}),
          ...(aiOpportunities.length      ? { aiOpportunities }      : {}),
          ...(Array.isArray(b.spokeNodes) && b.spokeNodes.length
              ? { spokeNodes: b.spokeNodes.map(String).filter(Boolean).slice(0, 6) }
              : {}),
          // Data Readiness: Critical Data Identification extras
          ...(datasets.length                          ? { datasets }         : {}),
          ...(recommendations.length                   ? { recommendations }  : {}),
          ...(coverageSummary.criticalDatasets         ? { coverageSummary }  : {}),
          ...((relationshipMap.dataSource.length || relationshipMap.dependentData.length ||
               relationshipMap.relatedData.length || relationshipMap.targetData.length)
              ? { relationshipMap } : {}),
          // Data Readiness: AI Data Preparation extras
          ...(inputDatasets.length        ? { inputDatasets }        : {}),
          ...(pipelineStages.length       ? { pipelineStages }       : {}),
          ...(prepRecommendations.length  ? { prepRecommendations }  : {}),
          ...(dataStats.dataQuality       ? { dataStats }            : {}),
          ...(readinessSummary.aiReadiness? { readinessSummary }     : {}),
          // Data Readiness: Data Architecture Enablement extras
          ...(projectSystems.length          ? { projectSystems }       : {}),
          ...(archRecommendations.length     ? { archRecommendations }  : {}),
          ...(archStats.architectureReadiness? { archStats }            : {}),
          ...(healthTimeline.length          ? { healthTimeline }       : {}),
          // Technology Infrastructure: System Integration & Architecture extras
          ...(integrationReadiness             ? { integrationReadiness } : {}),
          ...(connectedSystems.length          ? { connectedSystems }     : {}),
          ...((integrationSummary.integration || integrationSummary.reliability)
              ? { integrationSummary } : {}),
          // Technology Infrastructure: AI Platform Readiness extras
          ...(platformReadiness                    ? { platformReadiness }           : {}),
          ...(capabilityAssessment.length          ? { capabilityAssessment }        : {}),
          ...(platformStack.length                 ? { platformStack }               : {}),
          ...(platformRecommendations.length       ? { platformRecommendations }     : {}),
          ...((platformSummary.development || platformSummary.monitoring)
              ? { platformSummary } : {}),
          // Technology Infrastructure: AI Compute & Deployment Strategy extras
          ...(deploymentReadiness                  ? { deploymentReadiness }         : {}),
          ...(workloadProfile.length               ? { workloadProfile }             : {}),
          ...(deploymentRecommendations.length     ? { deploymentRecommendations }   : {}),
          ...(deploymentScores.computeFit          ? { deploymentScores }            : {}),
          ...((deploymentKpis.compute || deploymentKpis.deployment) ? { deploymentKpis } : {}),
          // Technology Infrastructure: AI Engineering Enablement extras
          ...(engineeringReadiness                      ? { engineeringReadiness }          : {}),
          ...(engineeringCapabilities.some(c => c.score)? { engineeringCapabilities }       : {}),
          ...(engineeringLifecycle.some(s => s.readiness)? { engineeringLifecycle }         : {}),
          ...(engineeringRecommendations.length          ? { engineeringRecommendations }    : {}),
          ...((automationStats.automation || automationStats.testing) ? { automationStats } : {}),
          ...(engineeringSummary.development             ? { engineeringSummary }            : {}),
          // Skills & Workforce: AI Skills Assessment extras
          ...(skillsReadiness                              ? { skillsReadiness }              : {}),
          ...(requiredSkills.length                        ? { requiredSkills }               : {}),
          ...(skillsMatrix.some(m => m.readiness)          ? { skillsMatrix }                : {}),
          ...(skillsRecommendations.length                 ? { skillsRecommendations }        : {}),
          ...((skillsStats.available || skillsStats.gaps)  ? { skillsStats }                 : {}),
          ...(skillsCategorySummary.some(c => c.status)    ? { skillsCategorySummary }       : {}),
          // Skills & Workforce: AI Team Readiness extras
          ...(teamReadiness                                ? { teamReadiness }               : {}),
          ...(requiredRoles.length                         ? { requiredRoles }               : {}),
          ...(teamRecommendations.length                   ? { teamRecommendations }         : {}),
          ...((teamStats.required || teamStats.available)  ? { teamStats }                  : {}),
          ...(teamCoverageSummary.some(c => c.status)      ? { teamCoverageSummary }        : {}),
          // Skills & Workforce: AI Learning & Adoption extras
          ...(adoptionReadiness                            ? { adoptionReadiness }           : {}),
          ...(learningPillars.some(p => p.description)     ? { learningPillars }            : {}),
          ...(adoptionLifecycle.some(st => st.readiness)   ? { adoptionLifecycle }          : {}),
          ...(adoptionRecommendations.length               ? { adoptionRecommendations }     : {}),
          ...((adoptionStats.teamsTrained || adoptionStats.adoptionRate) ? { adoptionStats }: {}),
          ...(adoptionReadinessSummary.some(c => c.status) ? { adoptionReadinessSummary }   : {}),
        },
        content:   s.content ? String(s.content).trim() : '',
        updatedAt: new Date(),
      };
    })
    .filter(s => s.title && validTitles.has(s.title.toLowerCase()));
}

// ── LLM call helper ───────────────────────────────────────────────────────────

async function callLLM(systemPrompt, userMessage, timeoutMs, capName) {
  const { text } = await Promise.race([
    generate({ systemPrompt, userMessage, maxTokens: 4000 }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`LLM timeout after ${timeoutMs / 1000}s for: ${capName}`)),
        timeoutMs
      )
    ),
  ]);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in LLM response for: ${capName}`);
  return JSON.parse(match[0]);
}

// ── Output format helpers ─────────────────────────────────────────────────────

// Parses the "Add all ... to ... brief object:" line in a promptInstruction
// and returns [{name, placeholder}] pairs where placeholder is a JSON-valid
// type-appropriate value ([] for arrays, {} for objects, 0 for numbers, "").
// This ensures the output format schema shows the correct JSON type for each
// extra field so the LLM generates the right structure, not a plain string.
function extractExtraFields(promptInstruction) {
  const m = promptInstruction.match(/Add (?:all(?:\s+\w+)?|both)\s+to\s+(?:the\s+)?brief object[^:\n]*:\n\s+(.+)/);
  if (!m) return [];
  const fields = [];
  const re = /"(\w+)":\s*([\[{<"])/g;
  let r;
  while ((r = re.exec(m[1])) !== null) {
    const name  = r[1];
    const start = r[2];
    let placeholder;
    if      (start === '[') placeholder = '["<see SECTION-SPECIFIC EXTRAS above>"]';
    else if (start === '{') placeholder = '{"<see SECTION-SPECIFIC EXTRAS above>": ""}';
    else if (start === '<') placeholder = '0';
    else                    placeholder = '"<see SECTION-SPECIFIC EXTRAS above>"';
    fields.push({ name, placeholder });
  }
  return fields;
}

// Builds the OUTPUT FORMAT section of the system prompt dynamically so the
// JSON schema example shows the section-specific extra fields with correct
// JSON types. Without this the LLM ignores templateInstructions and only
// emits the 4 base fields (or generates extras as plain strings).
function buildOutputFormat(parsedSections) {
  const examples = parsedSections.map(s => {
    const tpl        = BLUEPRINT_CONFIG.generate.ctoExtras ? SECTION_TEMPLATES[s.title] : null;
    const extras     = tpl ? extractExtraFields(tpl.promptInstruction) : [];
    const extraLines = extras.length
      ? ',\n        ' + extras.map(({ name, placeholder }) => `"${name}": ${placeholder}`).join(',\n        ')
      : '';
    return `    {
      "title": "${s.title}",
      "brief": {
        "strategicPosition": "<1-2 sentence future-state definition>",
        "priorityActions": ["<action 1>", "<action 2>", "<action 3>"],
        "successMetrics": ["<KPI 1>", "<KPI 2>"],
        "leadershipValidation": {
          "status": "Not Yet Validated",
          "context": "<one sentence on what alignment or approval is needed>"
        }${extraLines}
      }
    }`;
  }).join(',\n');
  return `OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:\n{\n  "sections": [\n${examples}\n  ]\n}`;
}

// ── Pipeline A: Brief (direct) ────────────────────────────────────────────────
// Active when BLUEPRINT_CONFIG.generate.essay = false.
// Generates section.brief in a single LLM call per capability.
// CTO extras (strategicPillars etc.) are injected into this call when enabled.

function buildBriefPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null }) {
  const sectionList   = parsedSections.map((s, i) => {
    let entry = `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`;
    if (s.consultantGuide) entry += `\n\n   CONSULTANT METHODOLOGY:\n${s.consultantGuide}`;
    return entry;
  }).join('\n\n');
  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const templateInstructions = BLUEPRINT_CONFIG.generate.ctoExtras
    ? parsedSections
        .filter(s => SECTION_TEMPLATES[s.title])
        .map(s => SECTION_TEMPLATES[s.title].promptInstruction)
        .join('\n')
    : '';

  const systemPrompt = `You are SoorgaAI, an enterprise Strategy Co-Pilot for CTO-level decision making.

Your job is to generate execution-ready future-state strategies for enterprise capabilities.

You are NOT a consultant. You are NOT an auditor. You are a strategy execution generator.

COMPANY CONTEXT:
- Organisation: ${companyName}
- Industry: ${industry}
- Executive Role: ${role}
- Business Objective: ${businessObjective}
${contextDoc ? `\nCOMPANY PROFILE:\n${contextDoc}` : ''}

TASK:
For EXACTLY these ${parsedSections.length} sections of the "${capabilityName}" capability — ${sectionTitles} — generate an execution-ready Strategy Brief.

Each section must have 4 required fields:

1. strategicPosition (1–2 sentences MAXIMUM)
   Define the IDEAL FUTURE-STATE — what success looks like when this capability is fully executing.
   Must be outcome-oriented and concrete. Must describe the target operating model.
   Do NOT describe current problems or gaps.

2. priorityActions (3 to 5 items)
   Executable actions for the next 90 days only.
   Must use strong verbs: Define, Deploy, Integrate, Implement, Establish, Launch, Assign.
   Must directly impact delivery or capability execution.
   Do NOT use: improve, enhance, explore, consider, leverage.

3. successMetrics (2 to 4 items)
   Measurable KPIs only. Must be quantifiable (%, time, cost, adoption rate, defect rate).
   Must clearly state direction: increase / decrease / target value.
   Must reflect real execution outcomes.
   Do NOT use vague metrics like "improve quality" or "increase efficiency."

4. leadershipValidation
   An object with two fields:
   - status: always set to "Not Yet Validated" for AI-generated blueprints
   - context: one sentence describing what executive alignment or approval is needed
     (e.g. "Requires CTO sign-off on AI investment allocation for ${industry} program")
${templateInstructions}

HARD RULES:
- Do NOT include a Key Risk section
- Do NOT write essays or paragraphs
- Do NOT describe problems or gaps
- Do NOT exceed bullet limits
- Do NOT add, rename, or remove sections — generate ONLY the ${parsedSections.length} sections listed
- Every output must be scannable in under 30 seconds

${buildOutputFormat(parsedSections)}`;

  const journeyBlock = journeyContext
    ? `TRANSFORMATION JOURNEY — PRIOR CAPABILITIES:\n${journeyContext}\n\nBuild directly on the opportunity and context established above. The specific AI opportunity identified in discovery is the use case being assessed here — do not invent a different one.\n\n`
    : '';

  const userMessage = `${enterpriseContext ? `${enterpriseContext}\n\n` : ''}${journeyBlock}CAPABILITY SECTIONS TO GENERATE (${parsedSections.length} sections):

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
BUSINESS OBJECTIVE: ${businessObjective}

Generate the Strategy Brief JSON for all ${parsedSections.length} sections: ${sectionTitles}.`;

  return { systemPrompt, userMessage };
}

async function runBriefGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null) {
  const { systemPrompt, userMessage } = buildBriefPrompt({
    companyName:         companyProfile.companyName,
    industry,
    role:                companyProfile.role,
    businessObjective,
    contextDoc:          companyProfile.contextDoc,
    capabilityName:      cap.name,
    parsedSections,
    automotiveBlueprint: automotiveBlueprint || '',
    enterpriseContext:   enterpriseContext || '',
    journeyContext:      journeyContext || null,
  });

  const timeoutMs = Math.max(120_000, parsedSections.length * 60_000);
  const parsed    = await callLLM(systemPrompt, userMessage, timeoutMs, cap.name);
  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));
  return parseBriefOutput(parsed?.sections || [], validTitles);
}

// ── Pipeline B: Essay → Brief (cascade) ──────────────────────────────────────
// Active when BLUEPRINT_CONFIG.generate.essay = true.
// Step 1 generates long-form prose (section.content).
// Step 2 extracts the structured brief from that prose.
// CTO extras are injected into Step 2 when enabled.

function buildEssayPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null }) {
  const sectionList   = parsedSections.map((s, i) => {
    let entry = `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`;
    if (s.consultantGuide) entry += `\n\n   CONSULTANT METHODOLOGY:\n${s.consultantGuide}`;
    return entry;
  }).join('\n\n');
  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const systemPrompt = `You are SoorgaAI, a senior enterprise AI strategy advisor writing for a CTO audience.

Generate a deep, future-state strategic analysis for each capability section.
Each analysis must be 500–700 words. Write in executive prose — no bullet points, no headers within the essay.
Ground every claim in the ${industry} engineering context and the company's business objective.
Focus exclusively on what success looks like and how to get there — not current problems or gaps.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title>",
      "content": "<500-700 word strategic analysis>"
    }
  ]
}`;

  const journeyBlock = journeyContext
    ? `TRANSFORMATION JOURNEY — PRIOR CAPABILITIES:\n${journeyContext}\n\nBuild directly on the opportunity and context established above.\n\n`
    : '';

  const userMessage = `${enterpriseContext ? `${enterpriseContext}\n\n` : ''}${journeyBlock}COMPANY CONTEXT:
- Organisation: ${companyName}
- Industry: ${industry}
- Executive Role: ${role}
- Business Objective: ${businessObjective}
${contextDoc ? `\nCOMPANY PROFILE:\n${contextDoc}` : ''}

CAPABILITY: "${capabilityName}"
SECTIONS TO ANALYSE (${parsedSections.length}): ${sectionTitles}

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
Generate a 500–700 word strategic analysis for each section.`;

  return { systemPrompt, userMessage };
}

function buildBriefExtractionPrompt({ capabilityName, parsedSections, essays }) {
  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const essayBlock = essays
    .map(e => `SECTION: ${e.title}\n\n${e.content}`)
    .join('\n\n---\n\n');

  const templateInstructions = BLUEPRINT_CONFIG.generate.ctoExtras
    ? parsedSections
        .filter(s => SECTION_TEMPLATES[s.title])
        .map(s => SECTION_TEMPLATES[s.title].promptInstruction)
        .join('\n')
    : '';

  const systemPrompt = `You are SoorgaAI. Extract a structured Strategy Brief from each strategic analysis below.

For each section produce exactly 4 fields:

1. strategicPosition — 1–2 sentences distilling the core future-state thesis from the essay
2. priorityActions   — 3–5 concrete 90-day actions extracted or inferred from the essay
                       Must use strong verbs: Define, Deploy, Integrate, Implement, Establish, Launch, Assign
3. successMetrics    — 2–4 quantifiable KPIs with direction (increase/decrease/target value)
4. leadershipValidation — { status: "Not Yet Validated", context: "<one sentence on exec approval needed>" }
${templateInstructions}

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title>",
      "brief": {
        "strategicPosition": "...",
        "priorityActions": [...],
        "successMetrics": [...],
        "leadershipValidation": { "status": "Not Yet Validated", "context": "..." }
      }
    }
  ]
}`;

  const userMessage = `CAPABILITY: "${capabilityName}"
SECTIONS: ${sectionTitles}

STRATEGIC ANALYSES:

${essayBlock}

Extract the structured Strategy Brief for all ${parsedSections.length} sections.`;

  return { systemPrompt, userMessage };
}

async function runEssayGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null) {
  const { systemPrompt, userMessage } = buildEssayPrompt({
    companyName:         companyProfile.companyName,
    industry,
    role:                companyProfile.role,
    businessObjective,
    contextDoc:          companyProfile.contextDoc,
    capabilityName:      cap.name,
    parsedSections,
    automotiveBlueprint: automotiveBlueprint || '',
    enterpriseContext:   enterpriseContext || '',
    journeyContext:      journeyContext || null,
  });

  // Essays are longer — allow 90 s per section
  const timeoutMs = Math.max(180_000, parsedSections.length * 90_000);
  const parsed    = await callLLM(systemPrompt, userMessage, timeoutMs, `${cap.name} [essay]`);
  return parsed?.sections || [];
}

async function runBriefExtraction(cap, parsedSections, essays) {
  const { systemPrompt, userMessage } = buildBriefExtractionPrompt({
    capabilityName: cap.name,
    parsedSections,
    essays,
  });

  const timeoutMs  = Math.max(120_000, parsedSections.length * 60_000);
  const parsed     = await callLLM(systemPrompt, userMessage, timeoutMs, `${cap.name} [extraction]`);
  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));

  // Merge essay content back into the extracted brief sections
  const essayMap = Object.fromEntries(essays.map(e => [e.title.toLowerCase(), e.content || '']));
  const sections = parseBriefOutput(parsed?.sections || [], validTitles);
  return sections.map(s => ({ ...s, content: essayMap[s.title.toLowerCase()] || '' }));
}

// ── Main per-capability generation ────────────────────────────────────────────
// Branches on BLUEPRINT_CONFIG.generate.essay to select the active pipeline.

async function generateCapabilitySections(cap, companyProfile, businessObjective, industry) {
  const blueprint      = getCapabilityBlueprint(cap.id, industry);
  const parsedSections = blueprint.sections || [];

  if (!parsedSections.length) {
    console.warn(`[blueprintGen] No pillar sections found for capability: ${cap.id}`);
    return [];
  }

  // Fetch Enterprise Blueprint grounding context (P0 — silent no-op if none exists)
  const enterpriseContext = companyProfile.orgName
    ? await getCapabilityEnterpriseContext(companyProfile.orgName, cap.id).catch(() => null)
    : null;

  if (enterpriseContext) {
    console.log(`[blueprintGen] Enterprise Blueprint context injected for: ${cap.name}`);
  }

  if (BLUEPRINT_CONFIG.generate.essay) {
    // Essay pipeline: long-form prose first, brief extracted from it
    console.log(`[blueprintGen] Essay pipeline active for: ${cap.name}`);
    const essays = await runEssayGeneration(cap, companyProfile, businessObjective, industry, parsedSections, blueprint.automotiveBlueprint, enterpriseContext);
    return await runBriefExtraction(cap, parsedSections, essays);
  }

  // Brief pipeline (default): direct structured generation
  return await runBriefGeneration(cap, companyProfile, businessObjective, industry, parsedSections, blueprint.automotiveBlueprint, enterpriseContext);
}

// ── Single-section extras regeneration ───────────────────────────────────────
// Regenerates CTO-view visual fields (strategicPillars, kpiHighlights, etc.)
// for specific sections within one capability, using their current
// strategicPosition as the strategic anchor. Does NOT rewrite strategicPosition.

export async function regenerateSectionExtras(blueprintId, capabilityId, sectionTitles, userId) {
  const companyProfile = await loadCompanyProfile(userId);
  const { companyName, industry, role } = companyProfile;

  const blueprint = await CompanyBlueprint.findOne({ _id: blueprintId, userId }).lean();
  if (!blueprint) throw new Error('Blueprint not found');

  const cap = (blueprint.capabilities || []).find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error('Capability not found');

  const targetSections = (cap.sections || []).filter(
    s => sectionTitles.includes(s.title) && SECTION_TEMPLATES[s.title]
  );
  if (!targetSections.length) return {};

  const templateInstructions = targetSections.map(s =>
    `--- Section: "${s.title}" ---\n` +
    `Current Strategic Position (DO NOT rewrite — use as context only):\n"${s.brief?.strategicPosition || '—'}"\n` +
    SECTION_TEMPLATES[s.title].promptInstruction
  ).join('\n\n');

  const sectionTitlesStr = targetSections.map(s => `"${s.title}"`).join(', ');

  const systemPrompt = `You are SoorgaAI generating CTO-view visual data for a Strategy Blueprint.

Company: ${companyName} | Industry: ${industry} | Role: ${role}
Business Objective: ${blueprint.businessObjective || '—'}
Capability: ${cap.capabilityName}

For each section below, generate ONLY the extra visual fields listed in the instructions.
The Strategic Position is already set — treat it as fixed context. Do NOT include
strategicPosition, priorityActions, successMetrics, or leadershipValidation in your output.
All generated content MUST be grounded in the company's Business Objective above — not generic examples.

${templateInstructions}

OUTPUT — valid JSON only, no markdown fences:
{
  "sections": [
    { "title": "<exact section title>", "brief": { <extra visual fields only> } }
  ]
}`;

  const parsed = await callLLM(systemPrompt, `Generate visual extras for: ${sectionTitlesStr}`, 90000, cap.capabilityName);
  const rawSections = (parsed.sections || []).map(ps => ({
    ...ps,
    brief: { ...(ps.brief || {}), strategicPosition: '' },
    content: '',
  }));

  const validTitles = new Set(targetSections.map(s => s.title.toLowerCase()));
  const normalized  = parseBriefOutput(rawSections, validTitles);

  const updatedBriefs = {};

  for (const ns of normalized) {
    const b = ns.brief || {};
    const setFields = {
      'capabilities.$[cap].sections.$[sec].updatedAt': new Date(),
      updatedAt: new Date(),
    };

    const extraKeys = [
      'strategicPillars', 'kpiHighlights', 'timelineSteps', 'alignmentInitiatives',
      'spokeNodes', 'funnelStages', 'commitmentPillars', 'governanceNodes',
      'matrixQuadrants', 'quarterlyPlan', 'solutionPortfolio', 'teamRoles',
      'lifecycleStages', 'waterfallItems', 'sdlcStages', 'flywheelStages',
      'securityPillars', 'ethicsPillars', 'modelLifecycleStages', 'complianceControls',
      'adoptionStages',
      // AI Use Cases extras
      'valueCategories', 'kpiPills', 'businessValueInsight',
      'recommendedStartingPoint', 'priorityQuadrants', 'dimensionCards', 'prioritizationInsight',
      'primaryClassification', 'secondaryClassification', 'transformationImplication',
      'businessProblems', 'workflowSteps', 'highEffortActivities', 'aiOpportunities',
    ];
    for (const key of extraKeys) {
      if (b[key] !== undefined) {
        setFields[`capabilities.$[cap].sections.$[sec].brief.${key}`] = b[key];
      }
    }

    await CompanyBlueprint.updateOne(
      { _id: blueprintId, userId, 'capabilities.capabilityId': capabilityId },
      { $set: setFields },
      { arrayFilters: [{ 'cap.capabilityId': capabilityId }, { 'sec.title': ns.title }] }
    );

    // Return only the extra/visual fields — never overwrite strategicPosition
    const { strategicPosition: _sp, priorityActions: _pa, successMetrics: _sm, leadershipValidation: _lv, ...extrasOnly } = b;
    updatedBriefs[ns.title] = extrasOnly;
  }

  return updatedBriefs;
}

// ── Transformation Blueprint: regenerate-section-extras ──────────────────────
// Mirror of regenerateSectionExtras but for TransformationBlueprint (nested
// domains → capabilities → sections structure).

export async function regenerateSectionExtrasForTransformation(blueprintId, domainId, capabilityId, sectionTitles, userId) {
  const companyProfile = await loadCompanyProfile(userId);
  const { companyName, industry, role } = companyProfile;

  const blueprint = await TransformationBlueprint.findOne({ _id: blueprintId, userId }).lean();
  if (!blueprint) throw new Error('Blueprint not found');

  const domain = (blueprint.domains || []).find(d => d.domainId === domainId);
  if (!domain) throw new Error(`Domain not found: ${domainId}`);

  const cap = (domain.capabilities || []).find(c => c.capabilityId === capabilityId);
  if (!cap) throw new Error(`Capability not found: ${capabilityId}`);

  const targetSections = (cap.sections || []).filter(
    s => sectionTitles.includes(s.title) && SECTION_TEMPLATES[s.title]
  );
  if (!targetSections.length) return {};

  const templateInstructions = targetSections.map(s =>
    `--- Section: "${s.title}" ---\n` +
    `Current Strategic Position (DO NOT rewrite — use as context only):\n"${s.brief?.strategicPosition || '—'}"\n` +
    SECTION_TEMPLATES[s.title].promptInstruction
  ).join('\n\n');

  const sectionTitlesStr = targetSections.map(s => `"${s.title}"`).join(', ');

  const systemPrompt = `You are SoorgaAI generating CTO-view visual data for a Strategy Blueprint.

Company: ${companyName} | Industry: ${industry} | Role: ${role}
Business Objective: ${blueprint.businessObjective || '—'}
Capability: ${cap.capabilityName}

For each section below, generate ONLY the extra visual fields listed in the instructions.
The Strategic Position is already set — treat it as fixed context. Do NOT include
strategicPosition, priorityActions, successMetrics, or leadershipValidation in your output.
All generated content MUST be grounded in the company's Business Objective above — not generic examples.

${templateInstructions}

OUTPUT — valid JSON only, no markdown fences:
{
  "sections": [
    { "title": "<exact section title>", "brief": { <extra visual fields only> } }
  ]
}`;

  const parsed = await callLLM(systemPrompt, `Generate visual extras for: ${sectionTitlesStr}`, 90000, cap.capabilityName);
  const rawSections = (parsed.sections || []).map(ps => ({
    ...ps,
    brief: { ...(ps.brief || {}), strategicPosition: '' },
    content: '',
  }));

  const validTitles = new Set(targetSections.map(s => s.title.toLowerCase()));
  const normalized  = parseBriefOutput(rawSections, validTitles);

  const updatedBriefs = {};

  for (const ns of normalized) {
    const b = ns.brief || {};
    const setFields = {
      'domains.$[dom].capabilities.$[cap].sections.$[sec].updatedAt': new Date(),
      updatedAt: new Date(),
    };

    const extraKeys = [
      'strategicPillars', 'kpiHighlights', 'timelineSteps', 'alignmentInitiatives',
      'spokeNodes', 'funnelStages', 'commitmentPillars', 'governanceNodes',
      'matrixQuadrants', 'quarterlyPlan', 'solutionPortfolio', 'teamRoles',
      'lifecycleStages', 'waterfallItems', 'sdlcStages', 'flywheelStages',
      'securityPillars', 'ethicsPillars', 'modelLifecycleStages', 'complianceControls',
      'adoptionStages',
      // AI Use Cases extras
      'valueCategories', 'kpiPills', 'businessValueInsight',
      'recommendedStartingPoint', 'priorityQuadrants', 'dimensionCards', 'prioritizationInsight',
      'primaryClassification', 'secondaryClassification', 'transformationImplication',
      'businessProblems', 'workflowSteps', 'highEffortActivities', 'aiOpportunities',
      // Data Readiness extras
      'datasets', 'recommendations', 'coverageSummary', 'relationshipMap',
      'inputDatasets', 'pipelineStages', 'prepRecommendations', 'dataStats', 'readinessSummary',
      'projectSystems', 'archRecommendations', 'archStats', 'healthTimeline',
      // Technology Infrastructure extras
      'integrationReadiness', 'connectedSystems', 'integrationSummary',
      'platformReadiness', 'capabilityAssessment', 'platformStack', 'platformRecommendations', 'platformSummary',
      'deploymentReadiness', 'workloadProfile', 'deploymentRecommendations', 'deploymentScores', 'deploymentKpis',
      'engineeringReadiness', 'engineeringCapabilities', 'engineeringLifecycle', 'engineeringRecommendations',
      'automationStats', 'engineeringSummary',
      // Skills & Workforce extras
      'skillsReadiness', 'requiredSkills', 'skillsMatrix', 'skillsRecommendations', 'skillsStats', 'skillsCategorySummary',
      'teamReadiness', 'requiredRoles', 'teamRecommendations', 'teamStats', 'teamCoverageSummary',
      'adoptionReadiness', 'learningPillars', 'adoptionLifecycle', 'adoptionRecommendations',
      'adoptionStats', 'adoptionReadinessSummary',
    ];
    for (const key of extraKeys) {
      if (b[key] !== undefined) {
        setFields[`domains.$[dom].capabilities.$[cap].sections.$[sec].brief.${key}`] = b[key];
      }
    }

    await TransformationBlueprint.updateOne(
      { _id: blueprintId, userId },
      { $set: setFields },
      {
        arrayFilters: [
          { 'dom.domainId':      domainId },
          { 'cap.capabilityId': capabilityId },
          { 'sec.title':        ns.title },
        ],
      }
    );

    const { strategicPosition: _sp, priorityActions: _pa, successMetrics: _sm, leadershipValidation: _lv, ...extrasOnly } = b;
    updatedBriefs[ns.title] = extrasOnly;
  }

  return updatedBriefs;
}

// ── Transformation Blueprint: single-capability regeneration ──────────────────

export async function regenerateTransformationCapabilityAsync(blueprintId, domainId, capabilityId, userId, businessObjective) {
  const companyProfile = await loadCompanyProfile(userId);
  const industry       = companyProfile.industry || 'Automotive';

  const domain = getDomain(domainId);
  if (!domain) throw new Error(`Domain not found in registry: ${domainId}`);

  const caps = getDomainCapabilities(domain.kbPath);
  const cap  = caps.find(c => c.id === capabilityId);
  if (!cap) throw new Error(`Capability not found: ${capabilityId} in ${domain.kbPath}`);

  try {
    await TransformationBlueprint.updateOne(
      { _id: blueprintId },
      { $set: { 'domains.$[dom].capabilities.$[cap].status': 'in-progress', 'domains.$[dom].capabilities.$[cap].errorMessage': '' } },
      { arrayFilters: [{ 'dom.domainId': domainId }, { 'cap.capabilityId': capabilityId }] }
    );

    const capBlueprint    = getDomainCapabilityBlueprint(cap.id, domain.kbPath, industry);
    const enterpriseContext = companyProfile.orgName
      ? await getCapabilityEnterpriseContext(companyProfile.orgName, cap.id).catch(() => null)
      : null;

    const sections = await runBriefGeneration(
      cap, companyProfile, businessObjective, industry,
      capBlueprint.sections, capBlueprint.automotiveBlueprint, enterpriseContext
    );

    // DEBUG: log extra fields so we can confirm LLM is generating them
    sections.forEach(sec => {
      const b = sec.brief || {};
      const extras = ['datasets','recommendations','coverageSummary','relationshipMap',
                      'inputDatasets','pipelineStages','prepRecommendations','dataStats','readinessSummary',
                      'projectSystems','archRecommendations','archStats','healthTimeline',
                      'skillsMatrix','roleDistribution','trainingModules','adoptionLifecycle',
                      'assessmentDimensions','teamRoles','lifecycleStages','adoptionRecommendations'];
      const found = extras.filter(k => b[k] !== undefined);
      if (found.length) {
        console.log(`[transformationGen][debug] ${sec.title} extras:`, JSON.stringify(
          Object.fromEntries(found.map(k => [k, Array.isArray(b[k]) ? `Array(${b[k].length})` : typeof b[k]])),
        ));
      } else {
        console.log(`[transformationGen][debug] ${sec.title}: NO extra fields in brief`);
      }
    });

    await TransformationBlueprint.updateOne(
      { _id: blueprintId },
      {
        $set: {
          'domains.$[dom].capabilities.$[cap].status':      'completed',
          'domains.$[dom].capabilities.$[cap].sections':    sections,
          'domains.$[dom].capabilities.$[cap].completedAt': new Date(),
          'domains.$[dom].capabilities.$[cap].errorMessage': '',
        },
      },
      { arrayFilters: [{ 'dom.domainId': domainId }, { 'cap.capabilityId': capabilityId }] }
    );

    console.log(`[transformationGen] ✓ Regenerated ${domain.name} / ${cap.name} (${sections.length} sections)`);
  } catch (err) {
    console.error(`[transformationGen] ✗ Regenerate ${cap.name}:`, err.message);
    await TransformationBlueprint.updateOne(
      { _id: blueprintId },
      {
        $set: {
          'domains.$[dom].capabilities.$[cap].status':       'error',
          'domains.$[dom].capabilities.$[cap].errorMessage': err.message,
        },
      },
      { arrayFilters: [{ 'dom.domainId': domainId }, { 'cap.capabilityId': capabilityId }] }
    );
  }
}

// ── Single-capability regeneration (fire-and-forget) ─────────────────────────

export async function regenerateCapabilityAsync(blueprintId, capabilityId, userId, businessObjective) {
  const companyProfile = await loadCompanyProfile(userId);
  const industry       = companyProfile.industry || 'Automotive';
  const capabilities   = getCapabilities();
  const cap            = capabilities.find(c => c.id === capabilityId);

  if (!cap) throw new Error(`Capability not found: ${capabilityId}`);

  try {
    await CompanyBlueprint.updateOne(
      { _id: blueprintId, 'capabilities.capabilityId': capabilityId },
      { $set: { 'capabilities.$.status': 'in-progress', 'capabilities.$.errorMessage': '' } }
    );

    const sections = await generateCapabilitySections(cap, companyProfile, businessObjective, industry);

    await CompanyBlueprint.updateOne(
      { _id: blueprintId, 'capabilities.capabilityId': capabilityId },
      {
        $set: {
          'capabilities.$.status':      'completed',
          'capabilities.$.sections':    sections,
          'capabilities.$.completedAt': new Date(),
        },
      }
    );

    console.log(`[blueprintGen] ✓ Regenerated ${cap.name} (${sections.length} sections)`);
  } catch (err) {
    console.error(`[blueprintGen] ✗ Regenerate ${cap.name}:`, err.message);
    await CompanyBlueprint.updateOne(
      { _id: blueprintId, 'capabilities.capabilityId': capabilityId },
      {
        $set: {
          'capabilities.$.status':       'error',
          'capabilities.$.errorMessage': err.message,
        },
      }
    );
  }
}

// ── Main generation orchestrator (fire-and-forget) ────────────────────────────

export async function generateBlueprintAsync(blueprintId, userId, businessObjective) {
  const companyProfile = await loadCompanyProfile(userId);
  const industry       = companyProfile.industry || 'Automotive';
  const capabilities   = getCapabilities();

  for (const cap of capabilities) {
    try {
      await CompanyBlueprint.updateOne(
        { _id: blueprintId, 'capabilities.capabilityId': cap.id },
        { $set: { 'capabilities.$.status': 'in-progress' } }
      );

      const sections = await generateCapabilitySections(cap, companyProfile, businessObjective, industry);

      await CompanyBlueprint.updateOne(
        { _id: blueprintId, 'capabilities.capabilityId': cap.id },
        {
          $set: {
            'capabilities.$.status':      'completed',
            'capabilities.$.sections':    sections,
            'capabilities.$.completedAt': new Date(),
          },
        }
      );

      console.log(`[blueprintGen] ✓ ${cap.name} (${sections.length} sections)`);
    } catch (err) {
      console.error(`[blueprintGen] ✗ ${cap.name}:`, err.message);
      await CompanyBlueprint.updateOne(
        { _id: blueprintId, 'capabilities.capabilityId': cap.id },
        {
          $set: {
            'capabilities.$.status':       'error',
            'capabilities.$.errorMessage': err.message,
          },
        }
      );
    }
  }

  await CompanyBlueprint.updateOne(
    { _id: blueprintId },
    { $set: { status: 'completed', updatedAt: new Date() } }
  );

  console.log(`[blueprintGen] Blueprint ${blueprintId} generation complete`);
}

// ── Journey context helpers ───────────────────────────────────────────────────

// Extracts the key brief fields from a completed capability's sections and formats
// them as a structured context block for use in subsequent capability prompts.
// Keeps only fields that are meaningful for downstream capabilities.
function extractJourneyContext(capabilityName, sections) {
  const lines = [`[${capabilityName}]`];
  for (const s of sections) {
    const b = s.brief || {};
    if (b.strategicPosition)            lines.push(`Strategic Position: ${b.strategicPosition}`);
    if (b.aiOpportunities?.length)      lines.push(`Identified AI Opportunities: ${b.aiOpportunities.join(', ')}`);
    if (b.businessProblems?.length)     lines.push(`Business Problems: ${b.businessProblems.join(', ')}`);
    if (b.workflowSteps?.length)        lines.push(`Current Workflow: ${b.workflowSteps.join(' → ')}`);
    if (b.highEffortActivities?.length) lines.push(`High-Effort Activities: ${b.highEffortActivities.join(', ')}`);
    if (b.primaryClassification?.name)  lines.push(`Primary AI Classification: ${b.primaryClassification.name}${b.primaryClassification.rationale ? ` — ${b.primaryClassification.rationale}` : ''}`);
    if (b.secondaryClassification?.name) lines.push(`Secondary AI Classification: ${b.secondaryClassification.name}`);
    if (b.transformationImplication)     lines.push(`Transformation Implication: ${b.transformationImplication}`);
    if (b.valueCategories?.length)      lines.push(`Business Value Areas: ${b.valueCategories.map(v => v.title).join(', ')}`);
    if (b.kpiPills?.length)             lines.push(`Target KPIs: ${b.kpiPills.join(', ')}`);
  }
  return lines.join('\n');
}

// ── Multi-domain transformation generation ────────────────────────────────────

// Generates all enabled domains → capabilities in the TransformationBlueprint.
// Called fire-and-forget. Domains without KB documents are skipped gracefully.
export async function generateTransformationAsync(blueprintId, userId, businessObjective) {
  const companyProfile    = await loadCompanyProfile(userId);
  const industry          = companyProfile.industry || 'Automotive';
  const domains           = enabledDomains();
  const enterpriseCtxMap  = await preloadEnterpriseContextMap(companyProfile.orgName || '');

  // Single journey chain spanning all domains — each capability receives the
  // full context of everything generated before it across the entire blueprint.
  // Domain order in domainRegistry.js defines the chain sequence.
  const journeyContextParts = [];

  for (const domain of domains) {
    const caps = getDomainCapabilities(domain.kbPath);
    if (!caps.length) {
      // No KB documents yet for this domain — mark completed with no capabilities
      await TransformationBlueprint.updateOne(
        { _id: blueprintId, 'domains.domainId': domain.id },
        { $set: { 'domains.$.status': 'completed' } }
      );
      console.log(`[transformationGen] ⚡ ${domain.name} — no KB docs yet, skipped`);
      continue;
    }

    // Mark domain as generating
    await TransformationBlueprint.updateOne(
      { _id: blueprintId, 'domains.domainId': domain.id },
      { $set: { 'domains.$.status': 'generating' } }
    );

    for (const cap of caps) {
      try {
        // Mark capability in-progress
        await TransformationBlueprint.updateOne(
          {
            _id: blueprintId,
            'domains.domainId': domain.id,
            'domains.capabilities.capabilityId': cap.id,
          },
          {
            $set: {
              'domains.$[dom].capabilities.$[cap].status': 'in-progress',
            },
          },
          { arrayFilters: [{ 'dom.domainId': domain.id }, { 'cap.capabilityId': cap.id }] }
        );

        // Build a capability-like object getDomainCapabilityBlueprint expects
        const capBlueprint = getDomainCapabilityBlueprint(cap.id, domain.kbPath, industry);
        const parsedSections = capBlueprint.sections;

        // Reuse the existing generation pipeline
        const capObj = { id: cap.id, name: cap.name, objective: cap.objective };
        const enterpriseContext = enterpriseCtxMap.get(cap.id) ?? null;
        const journeyContext    = journeyContextParts.length
          ? journeyContextParts.join('\n\n')
          : null;

        let sections;
        if (BLUEPRINT_CONFIG.generate.essay) {
          const essays = await runEssayGeneration(
            capObj, companyProfile, businessObjective, industry,
            parsedSections, capBlueprint.automotiveBlueprint, enterpriseContext, journeyContext
          );
          sections = await runBriefExtraction(capObj, parsedSections, essays);
        } else {
          sections = await runBriefGeneration(
            capObj, companyProfile, businessObjective, industry,
            parsedSections, capBlueprint.automotiveBlueprint, enterpriseContext, journeyContext
          );
        }

        // Feed this capability's output into the journey context for the next capability
        journeyContextParts.push(extractJourneyContext(cap.name, sections));

        await TransformationBlueprint.updateOne(
          { _id: blueprintId },
          {
            $set: {
              'domains.$[dom].capabilities.$[cap].status':      'completed',
              'domains.$[dom].capabilities.$[cap].sections':    sections,
              'domains.$[dom].capabilities.$[cap].completedAt': new Date(),
            },
          },
          { arrayFilters: [{ 'dom.domainId': domain.id }, { 'cap.capabilityId': cap.id }] }
        );

        console.log(`[transformationGen] ✓ ${domain.name} / ${cap.name} (${sections.length} sections)`);
      } catch (err) {
        console.error(`[transformationGen] ✗ ${domain.name} / ${cap.name}:`, err.message);
        await TransformationBlueprint.updateOne(
          { _id: blueprintId },
          {
            $set: {
              'domains.$[dom].capabilities.$[cap].status':       'error',
              'domains.$[dom].capabilities.$[cap].errorMessage': err.message,
            },
          },
          { arrayFilters: [{ 'dom.domainId': domain.id }, { 'cap.capabilityId': cap.id }] }
        );
      }
    }

    // Mark domain completed
    await TransformationBlueprint.updateOne(
      { _id: blueprintId, 'domains.domainId': domain.id },
      { $set: { 'domains.$.status': 'completed' } }
    );
  }

  await TransformationBlueprint.updateOne(
    { _id: blueprintId },
    { $set: { status: 'completed', updatedAt: new Date() } }
  );

  console.log(`[transformationGen] Transformation ${blueprintId} complete`);
}

/**
 * Regenerates only the specified domains on an existing blueprint.
 * Domains already completed are left untouched (unless explicitly included).
 * Called fire-and-forget from the controller.
 */
export async function generateSpecificDomainsAsync(blueprintId, userId, businessObjective, domainIds) {
  try {
  const companyProfile = await loadCompanyProfile(userId);
  const industry       = companyProfile.industry || 'Automotive';
  const allDomains     = enabledDomains();
  const domains        = allDomains.filter(d => domainIds.includes(d.id));

  for (const domain of domains) {
    const caps = getDomainCapabilities(domain.kbPath);
    if (!caps.length) {
      await TransformationBlueprint.updateOne(
        { _id: blueprintId, 'domains.domainId': domain.id },
        { $set: { 'domains.$.status': 'completed' } }
      );
      console.log(`[domainRegen] ⚡ ${domain.name} — no KB docs yet, skipped`);
      continue;
    }

    // Seed any capabilities that are missing from the blueprint document
    // (happens when the blueprint was created before KB files existed)
    const bpSnap = await TransformationBlueprint.findOne(
      { _id: blueprintId, 'domains.domainId': domain.id },
      { 'domains.$': 1 }
    ).lean();
    const existingCapIds = new Set(
      (bpSnap?.domains?.[0]?.capabilities || []).map(c => c.capabilityId)
    );
    const missingCaps = caps.filter(c => !existingCapIds.has(c.id));
    if (missingCaps.length) {
      await TransformationBlueprint.updateOne(
        { _id: blueprintId, 'domains.domainId': domain.id },
        {
          $push: {
            'domains.$.capabilities': {
              $each: missingCaps.map(c => ({
                capabilityId:   c.id,
                capabilityName: c.name,
                status:         'pending',
                sections:       [],
              })),
            },
          },
        }
      );
      console.log(`[domainRegen] seeded ${missingCaps.length} missing caps for ${domain.name}`);
    }

    await TransformationBlueprint.updateOne(
      { _id: blueprintId, 'domains.domainId': domain.id },
      { $set: { 'domains.$.status': 'generating' } }
    );

    for (const cap of caps) {
      try {
        await TransformationBlueprint.updateOne(
          {
            _id: blueprintId,
            'domains.domainId': domain.id,
            'domains.capabilities.capabilityId': cap.id,
          },
          { $set: { 'domains.$[dom].capabilities.$[cap].status': 'in-progress' } },
          { arrayFilters: [{ 'dom.domainId': domain.id }, { 'cap.capabilityId': cap.id }] }
        );

        const capBlueprint   = getDomainCapabilityBlueprint(cap.id, domain.kbPath, industry);
        const parsedSections = capBlueprint.sections;
        const capObj         = { id: cap.id, name: cap.name, objective: cap.objective };
        const enterpriseContext = companyProfile.orgName
          ? await getCapabilityEnterpriseContext(companyProfile.orgName, cap.id).catch(() => null)
          : null;

        let sections;
        if (BLUEPRINT_CONFIG.generate.essay) {
          const essays = await runEssayGeneration(
            capObj, companyProfile, businessObjective, industry,
            parsedSections, capBlueprint.automotiveBlueprint, enterpriseContext
          );
          sections = await runBriefExtraction(capObj, parsedSections, essays);
        } else {
          sections = await runBriefGeneration(
            capObj, companyProfile, businessObjective, industry,
            parsedSections, capBlueprint.automotiveBlueprint, enterpriseContext
          );
        }

        await TransformationBlueprint.updateOne(
          { _id: blueprintId },
          {
            $set: {
              'domains.$[dom].capabilities.$[cap].status':      'completed',
              'domains.$[dom].capabilities.$[cap].sections':    sections,
              'domains.$[dom].capabilities.$[cap].completedAt': new Date(),
            },
          },
          { arrayFilters: [{ 'dom.domainId': domain.id }, { 'cap.capabilityId': cap.id }] }
        );

        console.log(`[domainRegen] ✓ ${domain.name} / ${cap.name} (${sections.length} sections)`);
      } catch (err) {
        console.error(`[domainRegen] ✗ ${domain.name} / ${cap.name}:`, err.message);
        await TransformationBlueprint.updateOne(
          { _id: blueprintId },
          {
            $set: {
              'domains.$[dom].capabilities.$[cap].status':       'error',
              'domains.$[dom].capabilities.$[cap].errorMessage': err.message,
            },
          },
          { arrayFilters: [{ 'dom.domainId': domain.id }, { 'cap.capabilityId': cap.id }] }
        );
      }
    }

    await TransformationBlueprint.updateOne(
      { _id: blueprintId, 'domains.domainId': domain.id },
      { $set: { 'domains.$.status': 'completed' } }
    );
  }

  // Always mark blueprint completed so the SSE stream terminates
  await TransformationBlueprint.updateOne(
    { _id: blueprintId },
    { $set: { status: 'completed', updatedAt: new Date() } }
  );
  console.log(`[domainRegen] Done — domains: ${domainIds.join(', ')}`);

  } catch (err) {
    console.error(`[domainRegen] Fatal error for blueprint ${blueprintId}:`, err.message);
    await TransformationBlueprint.updateOne(
      { _id: blueprintId },
      { $set: { status: 'error', updatedAt: new Date() } }
    ).catch(() => {});
  }
}
