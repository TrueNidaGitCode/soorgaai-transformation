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

import CompanyBlueprint  from '../models/CompanyBlueprint.js';
import CompanyContext     from '../models/CompanyContext.js';
import UserProfile        from '../models/UserProfile.js';
import { generate }       from './llmService.js';
import {
  getCapabilities,
  getCapabilityBlueprint,
} from './strategyCanvasService.js';
import { BLUEPRINT_CONFIG } from '../config/blueprintConfig.js';
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
   Define 3 AI solutions organized as a portfolio map showing clear business ownership.
   Each item: { "name": "<2–4 word solution name>", "businessOwner": "<role title e.g. Support Operations Lead>", "deliveryTeam": "<teams comma-separated e.g. AI/ML Engineering, Product>", "kpis": ["<KPI metric 1>", "<KPI metric 2>"] }
   Example: { "name": "AI Support Assistant", "businessOwner": "Support Operations Lead", "deliveryTeam": "AI/ML Engineering, Product", "kpis": ["Resolution Time", "First Contact Resolution Rate"] }
   Solutions must be grounded in the company's business objective and industry context.

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
