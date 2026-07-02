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
import { getCapabilityEnterpriseContext } from './enterpriseBlueprintService.js';

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

5. valueCategories (exactly 4 items in this fixed order)
   Each card describes how this AI use case creates value in one dimension for this company.
   Order: [0] Engineering Productivity, [1] Engineering Excellence, [2] Project & Operational Performance, [3] Customer & Product Value
   Each item: { "title": "<category name>", "focus": "<short phrase, e.g. 'Improve engineering team efficiency'>", "outcomes": ["<outcome 1>", "<outcome 2>", "<outcome 3>", "<outcome 4>"] }
   "outcomes" must be 4 concise company-specific expected outcomes (3–6 words each).
   "focus" must be short and match the format "Improve [area]" (max 6 words).

6. kpiPills (exactly 6 items)
   Short metric names for the primary measurable KPIs for this AI use case. Each item is a short string (2–5 words) in title case, e.g. "Effort Reduction", "Cycle Time Improvement", "Quality Improvement". Make them specific to this company's context.

7. businessValueInsight (1–2 sentences)
   A clear, specific statement on how value will be measured and tracked for this AI use case. Lead with the primary expected business outcome.

   Add all to the brief object:
   "valueCategories": [...], "kpiPills": [...], "businessValueInsight": "..."`,
  },

  'AI Use Case Prioritization': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Use Case Prioritization" sections only:

5. recommendedStartingPoint (1 sentence)
   A concise recommendation for where to begin, emphasising high business value combined with high implementation feasibility for this specific company.

6. priorityQuadrants (exactly 4 items in this fixed order)
   Classify specific AI initiatives for this company into a 2×2 Business Value vs Implementation Feasibility matrix.
   Order: [0] Strategic Bets (High Value, Low Feasibility), [1] Quick Wins (High Value, High Feasibility), [2] Fill-ins (Low Value, Low Feasibility), [3] Avoid (Low Value, High Feasibility)
   Each item: { "id": "<strategic-bets|quick-wins|fill-ins|avoid>", "label": "<quadrant name>", "initiatives": ["<initiative 1>", "<initiative 2>", "<initiative 3>"] }
   Use 2–4 short initiative names (3–6 words each) specific to this company's industry and context. "Avoid" may use generic low-value examples.

7. dimensionCards (exactly 4 items in this fixed order)
   Each card lists 3 company-specific considerations for the given evaluation dimension.
   Order: [0] Business Value, [1] Implementation Feasibility, [2] Strategic Alignment, [3] Organizational Readiness
   Each item: { "title": "<dimension name>", "bullets": ["<consideration 1>", "<consideration 2>", "<consideration 3>"] }
   Bullets must be concise 2–4 word labels tailored to this company's industry and use case context.

8. prioritizationInsight (1 sentence)
   A concise insight for this company explaining how to sequence AI initiatives to build momentum while working toward long-term transformation.

   Add all to the brief object:
   "recommendedStartingPoint": "...", "priorityQuadrants": [...], "dimensionCards": [...], "prioritizationInsight": "..."`,
  },

  'AI Use Case Classification': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Use Case Classification" sections only:

5. primaryClassification
   The primary AI classification for this company's most relevant AI use case.
   Object: { "name": "Productivity AI" | "Functional AI" | "Product AI", "description": "<1 sentence on the primary value this classification delivers for this company>" }

6. secondaryClassification (include only if a second classification clearly applies — otherwise omit or set to null)
   Object: { "name": "Productivity AI" | "Functional AI" | "Product AI", "description": "<1 sentence>" }

7. classificationCards (exactly 3 items, in this fixed order: Productivity AI, Functional AI, Product AI)
   Each card describes one category with company-specific examples.
   Each item: { "type": "Productivity AI" | "Functional AI" | "Product AI", "purpose": "<1 sentence>", "characteristics": ["<3-word label>", "<3-word label>", "<3-word label>"], "examples": ["<example 1>", "<example 2>", "<example 3>", "<example 4>"] }
   Characteristics must be 2–4 word scannable labels. Examples must reflect the company's industry context.

8. classificationInsight (1 sentence)
   A concise insight for this company explaining how classification guides the next steps: business value assessment, prioritization, and implementation planning.

   Add all to the brief object:
   "primaryClassification": {...}, "secondaryClassification": {...} or null, "classificationCards": [...], "classificationInsight": "..."`,
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
        ? { name: String(b.primaryClassification.name || '').trim(), description: String(b.primaryClassification.description || '').trim() }
        : null;

      const secondaryClassification = b.secondaryClassification && typeof b.secondaryClassification === 'object'
        ? { name: String(b.secondaryClassification.name || '').trim(), description: String(b.secondaryClassification.description || '').trim() }
        : null;

      const rawClassificationCards = Array.isArray(b.classificationCards) ? b.classificationCards : [];
      const classificationCards = rawClassificationCards
        .filter(c => c && typeof c === 'object' && String(c.type || '').trim())
        .map(c => ({
          type:            String(c.type    || '').trim(),
          purpose:         String(c.purpose || '').trim(),
          characteristics: Array.isArray(c.characteristics) ? c.characteristics.map(String).filter(Boolean) : [],
          examples:        Array.isArray(c.examples)        ? c.examples.map(String).filter(Boolean)        : [],
        }))
        .slice(0, 3);

      const classificationInsight = typeof b.classificationInsight === 'string'
        ? b.classificationInsight.trim() : '';

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
          ...(classificationCards.length           ? { classificationCards }     : {}),
          ...(classificationInsight                ? { classificationInsight }   : {}),
          ...(businessProblems.length     ? { businessProblems }     : {}),
          ...(workflowSteps.length        ? { workflowSteps }        : {}),
          ...(highEffortActivities.length ? { highEffortActivities } : {}),
          ...(aiOpportunities.length      ? { aiOpportunities }      : {}),
          ...(Array.isArray(b.spokeNodes) && b.spokeNodes.length
              ? { spokeNodes: b.spokeNodes.map(String).filter(Boolean).slice(0, 6) }
              : {}),
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

// ── Pipeline A: Brief (direct) ────────────────────────────────────────────────
// Active when BLUEPRINT_CONFIG.generate.essay = false.
// Generates section.brief in a single LLM call per capability.
// CTO extras (strategicPillars etc.) are injected into this call when enabled.

function buildBriefPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint, enterpriseContext }) {
  const sectionList   = parsedSections.map((s, i) =>
    `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`
  ).join('\n\n');
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

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title>",
      "brief": {
        "strategicPosition": "<1-2 sentence future-state definition>",
        "priorityActions": ["<action 1>", "<action 2>", "<action 3>"],
        "successMetrics": ["<KPI 1>", "<KPI 2>", "<KPI 3>"],
        "leadershipValidation": {
          "status": "Not Yet Validated",
          "context": "<one sentence on what alignment or approval is needed>"
        }
      }
    }
  ]
}`;

  const userMessage = `${enterpriseContext ? `${enterpriseContext}\n\n` : ''}CAPABILITY SECTIONS TO GENERATE (${parsedSections.length} sections):

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
BUSINESS OBJECTIVE: ${businessObjective}

Generate the Strategy Brief JSON for all ${parsedSections.length} sections: ${sectionTitles}.`;

  return { systemPrompt, userMessage };
}

async function runBriefGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext) {
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

function buildEssayPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint, enterpriseContext }) {
  const sectionList   = parsedSections.map((s, i) =>
    `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`
  ).join('\n\n');
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

  const userMessage = `${enterpriseContext ? `${enterpriseContext}\n\n` : ''}COMPANY CONTEXT:
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

async function runEssayGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext) {
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
      'primaryClassification', 'secondaryClassification', 'classificationCards', 'classificationInsight',
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
      'valueCategories', 'kpiPills', 'businessValueInsight',
      'recommendedStartingPoint', 'priorityQuadrants', 'dimensionCards', 'prioritizationInsight',
      'primaryClassification', 'secondaryClassification', 'classificationCards', 'classificationInsight',
      'businessProblems', 'workflowSteps', 'highEffortActivities', 'aiOpportunities',
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

// ── Multi-domain transformation generation ────────────────────────────────────

// Generates all enabled domains → capabilities in the TransformationBlueprint.
// Called fire-and-forget. Domains without KB documents are skipped gracefully.
export async function generateTransformationAsync(blueprintId, userId, businessObjective) {
  const companyProfile = await loadCompanyProfile(userId);
  const industry       = companyProfile.industry || 'Automotive';
  const domains        = enabledDomains();

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
