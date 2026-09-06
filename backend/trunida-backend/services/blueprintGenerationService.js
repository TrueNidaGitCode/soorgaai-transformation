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
import { getConnectedKnowledgeContext, preloadConnectedKnowledgeMap, getLinkedProjectContext } from './connectedKnowledgeService.js';
import { resolveIndustryGrounding } from './industryFitService.js';
import CompanyResearchLibrary from '../models/CompanyResearchLibrary.js';
import { normalizeCompanyName, getApprovedCapabilityMap } from './companyResearchLibraryService.js';
import { getVerticalContextForCapability, preloadVerticalContextMap } from './industryVerticalKnowledgeService.js';
import { saveActionItems } from './actionItemService.js';
import { reportRun } from './usageContext.js';

// Merges Enterprise Blueprint context with Connected Knowledge (Confluence)
// context into the single string the existing prompt builders already accept —
// avoids threading a second context parameter through every call site.
function combineContexts(...blocks) {
  const joined = blocks.filter(Boolean).join('\n\n');
  return joined || null;
}

// ── Company profile helpers ───────────────────────────────────────────────────

/**
 * @param {*} userId
 * @param {*} [blueprintId] When given, the blueprint's stored engagement
 *   classification rides along on the profile. It is carried here rather than
 *   threaded as its own parameter because companyProfile already reaches every
 *   prompt builder, and because engagement is a fact about the engagement as a
 *   whole — the same kind of thing as the company's name and industry.
 *   Reading it is a projection, not a re-classification: the LLM call happens
 *   once, when the blueprint is created.
 */
export async function loadCompanyProfile(userId, blueprintId = null) {
  try {
    const [profile, ctx, bp] = await Promise.all([
      UserProfile.findOne({ userId }).lean(),
      CompanyContext.findOne({ userId }).lean(),
      blueprintId
        ? TransformationBlueprint.findById(blueprintId, { engagement: 1 }).lean().catch(() => null)
        : null,
    ]);
    const companyNameNormalized = normalizeCompanyName(profile?.orgName);
    const libraryEntry = companyNameNormalized
      ? await CompanyResearchLibrary.findOne({ companyNameNormalized }).select('subVertical').lean().catch(() => null)
      : null;
    return {
      companyName: profile?.orgName        || 'Your Organisation',
      orgName:     profile?.orgName        || '',
      role:        profile?.role           || 'Executive',
      industry:    profile?.industryDomain || '',
      contextDoc:  ctx?.content            || '',
      subVertical: libraryEntry?.subVertical || '',
      engagement:  bp?.engagement          || null,
    };
  } catch {
    return { companyName: 'Your Organisation', orgName: '', role: 'Executive', industry: '', contextDoc: '', subVertical: '', engagement: null };
  }
}

/**
 * Where this engagement's data actually lives, as prompt guidance.
 *
 * Without it the model is told to name "realistic engineering tool name(s)"
 * with DOORS / Polarion / TestRail / CANoe / Teamcenter as the examples, which
 * is right for an automotive supplier automating its defect triage and wrong
 * for everyone else. A company putting AI into the product it sells does not
 * have a requirements management tool holding the data — it has its own
 * repository and its own application database.
 *
 * Returns '' when the engagement is undecided, so generation is not steered by
 * a guess. See services/engagementClassifierService.js.
 */
function datasetSourceGuidance(engagement) {
  const category = engagement?.category;
  if (!category) return '';

  const maturityNote = engagement.maturity === 'startup'
    // Not a deficiency to work around: it is the normal shape of a young
    // company, and asking for documents that do not exist produces datasets
    // the customer can only ever mark unavailable.
    ? '\n- This company is young: its CODE IS ITS SPECIFICATION. Do NOT ask for separate requirement or architecture documents — they do not exist. Name the code and the running system instead.'
    : engagement.maturity === 'enterprise'
      ? '\n- This is an established organisation, so separate requirement and architecture documents likely exist alongside the code, and may be named as sources.'
      : '';

  if (category === 'product-ai') {
    return `
DATA SOURCE GUIDANCE (this engagement builds AI INTO THE PRODUCT THIS COMPANY SELLS):
- typicalSource must name THIS COMPANY'S OWN systems — its application database and the tables in it, its source repository, its own analytics and billing systems.
- Do NOT name third-party engineering process tools (Jira, Confluence, DOORS, Polarion, TestRail, Teamcenter) unless the objective itself is about that process. They are where a company's ENGINEERING PROCESS lives, not where its PRODUCT'S data lives.
- The data this AI feature needs is the data the product already collects from its users.${maturityNote}
`;
  }

  const area = engagement.subArea ? ` in the "${engagement.subArea}" area of work` : '';
  return `
DATA SOURCE GUIDANCE (this engagement automates work this company's own staff do${area}):
- typicalSource must name the tools that team actually works in${area ? ' for that area' : ''} — issue trackers, documentation systems, test management, CI, or service desks as appropriate.
- Name tools realistic for this company's industry and size; do not assume a heavyweight toolchain a small team would not run.${maturityNote}
`;
}

// ── Industry fit (automotive KB grounding vs core-only) ───────────────────────
// Classified once per blueprint, on its first generation run, and reused by
// every later run against the same document (e.g. "generate remaining
// domains") so the decision never flip-flops and never re-runs the LLM call.
const NO_KB_FOLDER_INDUSTRY = 'General'; // no knowledge_base/.../General/ folder exists, so
                                          // getDomainCapabilityBlueprint's file read fails
                                          // closed to core-only content — exactly what we want.

// Prompt label only — never a KB folder name. This used to be 'Automotive',
// which meant a company that had declared no industry was TOLD it was
// automotive in every prompt ("Ground every claim in the Automotive
// engineering context"). An academy-management software company was grounded
// that way for a whole run. An unspecified industry must read as unspecified.
const UNSPECIFIED_INDUSTRY = 'General Business';

/**
 * The industry label the prompts should use.
 *
 * Prefers the industry actually RESOLVED for this blueprint over the one on the
 * user's profile, because UserProfile.industryDomain is an automotive-only enum
 * that defaults to 'Automotive' — every profile claims automotive whether or
 * not it is true. That claim is what told an academy-management software
 * company's prompts to "ground every claim in the Automotive engineering
 * context", while industryFit on the very same blueprint had correctly
 * resolved Education Technology.
 *
 * An empty industryFit.industry means "no overlay fits", which is a real answer
 * and must NOT fall back to the profile's automotive-by-default claim.
 */
function industryLabel(industryFit, companyProfile) {
  if (industryFit) return industryFit.industry || UNSPECIFIED_INDUSTRY;
  return companyProfile?.industry || UNSPECIFIED_INDUSTRY;
}

/**
 * Which industry overlay grounds this blueprint.
 *
 * Decided once per blueprint and stored, so every capability run — including
 * later "generate remaining domains" runs — reuses the same decision rather
 * than re-classifying and possibly disagreeing with itself mid-blueprint.
 *
 * Returns the overlay folder name, or NO_KB_FOLDER_INDUSTRY for core-only.
 */
async function resolveIndustryFit(blueprintId, businessObjective) {
  const bp = await TransformationBlueprint.findById(blueprintId, { industryFit: 1 }).lean();
  if (bp?.industryFit?.checked) {
    return {
      matched: bp.industryFit.matched !== false,
      // Blueprints decided before industries were resolvable stored only a
      // boolean. A matched one of those meant automotive, which was the only
      // industry then — honour that rather than silently re-grounding it.
      industry: bp.industryFit.industry || (bp.industryFit.matched !== false ? 'Automotive' : ''),
      reason: bp.industryFit.reason || '',
    };
  }

  const fit = await resolveIndustryGrounding(businessObjective);
  await TransformationBlueprint.updateOne(
    { _id: blueprintId },
    { $set: { industryFit: {
      checked: true, matched: fit.matched, industry: fit.industry || '', reason: fit.reason,
    } } }
  ).catch(err => console.error('[industryFit] failed to persist result:', err.message));

  console.log(fit.industry
    ? `[industryGrounding] ${blueprintId}: grounding on "${fit.industry}". ${fit.reason}`
    : `[industryGrounding] ${blueprintId}: no industry overlay fits — core-only grounding. ${fit.reason}`);

  return fit;
}

// Section titles that skip strategicPosition entirely — the AI Use Cases journey
// (AI Opportunity Discovery → Classification → Business Value Definition → Prioritization)
// already anchors on Opportunity Discovery's strategicPosition; repeating a near-identical
// future-state statement on every downstream capability read as filler.
const NO_STRATEGIC_POSITION_CAPABILITIES = new Set([
  'AI Use Case Classification',
  'Business Value Definition',
  'AI Implementation Prioritization',
]);

// These 4 capabilities render exclusively through their own SECTION_TEMPLATES extras
// (custom CTO layouts in blueprintWorkspace.js) — priorityActions/successMetrics/
// leadershipValidation are never displayed for them, so generating them wastes
// tokens/time and dilutes prompt focus. See blueprintWorkspace.js's section-title
// routing switch, which explicitly avoids the generic brief-grid fallback for these
// sections (its Leadership Validation cell is "not needed in CTO style").
const AI_USE_CASES_CAPABILITIES = new Set([
  'AI Opportunity Discovery',
  'AI Use Case Classification',
  'Business Value Definition',
  'AI Implementation Prioritization',
]);

// ── Section template config ───────────────────────────────────────────────────
// Declares which section titles get extra LLM-generated fields (CTO view).
// Add a new entry here when a new slide template needs section-specific data.
// Only injected when BLUEPRINT_CONFIG.generate.ctoExtras = true.

const SECTION_TEMPLATES = {

  Vision: {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Vision" sections only:

JOURNEY RULE: This Vision MUST continue from the exact initiative already established across all four AI Use Cases capabilities:
- AI Opportunity Discovery → the selected AI initiative
- AI Use Case Classification → primary and secondary classification
- Business Value Definition → expected business value areas
- AI Implementation Prioritization → priority quadrant and recommended implementation

Use "Selected AI Initiative", "Recommended Implementation", "Primary Classification", "Expected Business Value", and "Target KPIs" from the TRANSFORMATION CONTEXT block. Name the initiative explicitly throughout — never substitute a different AI opportunity.

HARD CONSTRAINT: Every sentence in this section — the Vision Statement AND all 3 strategic pillars — must describe the future state created by the Selected AI Initiative's OWN mechanism only. AI Opportunity Discovery identified several other opportunities (e.g. anomaly detection, plausibility classification, report drafting); those are NOT this initiative and must not appear here, even as supporting color, unless one of them literally IS the Selected AI Initiative. If the Vision Statement or pillars collectively describe more than one distinct AI technique, that is a violation — rewrite so every pillar is a different BUSINESS-LEVEL CONSEQUENCE of the same single technique, not a different technique.

Vision defines the TARGET OPERATING MODEL — the future state of the organization once this initiative is fully adopted. It describes WHERE the organization will be, not HOW it gets there.
The Vision Statement (strategicPosition) must answer: "What will our engineering environment look like once this initiative is embedded in daily operations?" Describe transformed outcomes, new capabilities, and improved ways of working — never describe implementation steps, deployment phases, or technology choices.
Strategic pillars must describe WHAT CHANGES at the business level (e.g. automated traceability, predictable delivery, continuous quality visibility) — not how to build or deploy the AI system.

This is the ONLY section that defines business outcome metrics. Alignment and Commitment sections must NOT repeat these KPIs.

5. strategicPillars (exactly 3 items)
   Three different ANGLES on the Selected AI Initiative's single mechanism (e.g. speed, consistency, compounding reuse) — never three different AI techniques or opportunities.
   Each item: { "title": "<2–4 word noun phrase>", "description": "<1 sentence describing the business outcome once the initiative is operational>", "businessImpactTag": "<1–3 word impact label>" }
   Pillars describe WHAT CHANGES for the business, not HOW to implement. No deployment tasks, technology steps, or implementation milestones.
   Example tags: "Engineering Velocity", "Release Predictability", "Traceability Accuracy"
   REJECT a description that would be true of almost any AI initiative (e.g. "Engineering teams work more
   efficiently" is NOT acceptable) — name the specific mechanism THIS initiative changes (e.g. "Engineers
   retrieve analogous historical defects in seconds instead of searching manually" for a retrieval initiative).
   REJECT a pillar set where each pillar maps to a different AI opportunity from AI Opportunity Discovery
   (e.g. pillar 1 about retrieval, pillar 2 about anomaly detection, pillar 3 about report drafting is NOT
   acceptable, even though all three were real candidates) — all 3 pillars must be consequences of the ONE
   Selected AI Initiative's mechanism specifically.
   Example — a retrieval initiative's 3 pillars, all describing the SAME technique from different angles:
   { "title": "Instant Case Recall", "description": "Engineers retrieve the closest matching historical defect in seconds instead of searching manually." }
   { "title": "Consistent Triage Quality", "description": "Every engineer works from the same retrieval-ranked evidence, not just the ones with the longest tenure." }
   { "title": "Compounding Knowledge Value", "description": "Each new case indexed by retrieval improves match quality for every future investigation." }

6. kpiHighlights (exactly 3 items)
   The 3 headline business outcome metrics for this initiative. Draw directly from "Target KPIs" and "Expected Business Value" in the TRANSFORMATION CONTEXT.
   Each item: { "value": "<number with unit e.g. 75%, 4+, 2×, 18mo>", "label": "<2–4 word metric name>", "description": "<1 short sentence, ≤8 words>" }
   Values must be specific and quantified. These business KPIs appear here only — do not repeat them in Alignment or Commitment.

   Add both to the brief object for Vision sections:
   "strategicPillars": [...], "kpiHighlights": [...]`,
  },

  Alignment: {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Alignment" sections only:

JOURNEY RULE: Alignment describes HOW THE ORGANIZATION WORKS TOGETHER to deliver the specific AI initiative named in the TRANSFORMATION CONTEXT ("Selected AI Initiative" and "Recommended Implementation"). Build directly on:
- AI Opportunity Discovery → the initiative's scope and context
- AI Use Case Classification → which discipline (e.g. engineering, product, data) owns it
- Business Value Definition → which teams benefit and bear responsibility
- AI Implementation Prioritization → which teams are critical to the recommended starting point

spokeNodes must be the actual engineering teams needed to deliver THIS initiative specifically.
The 4 alignmentInitiatives must describe concrete collaboration actions for THIS initiative — not generic AI alignment.
Do NOT repeat any business outcome metrics, revenue targets, or KPI values from Vision.
Alignment metrics measure ORGANIZATIONAL COORDINATION: who owns what, how teams are connected, how decisions are made — not business results.

5. kpiHighlights (exactly 3 items)
   Three metrics that measure how well the organization is aligning around THIS initiative.
   Each item: { "value": "<number with unit e.g. 6, 100%, bi-weekly>", "label": "<2–5 word metric name>", "description": "" }
   Must reflect organizational coordination quality — NOT business outcomes from Vision.
   Acceptable topics: stakeholder ownership coverage, cross-functional teams engaged, governance cadence, decision-making speed, role clarity.
   Example: { "value": "6", "label": "Teams Formally Engaged", "description": "" }
   Example: { "value": "100%", "label": "Roles Assigned", "description": "" }
   Example: { "value": "Weekly", "label": "Coordination Cadence", "description": "" }

6. alignmentInitiatives (exactly 4 items)
   Four concrete cross-functional collaboration actions needed to align teams around THIS initiative.
   The first 3 display as equal cards, the 4th as a full-width card.
   Each item: { "title": "<3–6 word initiative name>", "description": "<2–3 sentences explaining what it is and why it matters for THIS initiative>" }
   Each initiative should identify a different team or dimension of collaboration.
   REJECT a description that only restates generic cross-team collaboration advice (e.g. "Regular meetings
   ensure everyone stays aligned" is NOT acceptable) — name the specific decision or handoff THIS initiative
   requires between named teams (e.g. what the AI/ML team needs from Requirements before retrieval can work).

7. spokeNodes (5–6 items)
   The specific stakeholder groups that must coordinate to deliver THIS initiative.
   Each item is a plain string, 2–5 words. Rendered as nodes on a spoke wheel diagram.
   Name the real teams (e.g. "Systems Engineering", "Verification & Validation", "AI/Data Team") — not generic labels.

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

JOURNEY RULE: Commitment answers HOW LEADERSHIP FUNDS, GOVERNS, AND SUSTAINS the specific AI initiative named in the TRANSFORMATION CONTEXT ("Selected AI Initiative" and "Recommended Implementation"). Build directly on:
- AI Implementation Prioritization → the recommended starting point and its priority classification
- Business Value Definition → the expected ROI that justifies the leadership investment

commitmentPillars must describe concrete executive actions — investment decisions, governance appointments, and accountability structures for THIS initiative.
The governance structure must name who owns and oversees THIS initiative's delivery.
Do NOT repeat business outcome KPIs (revenue, efficiency, cost savings) from Vision.
Do NOT repeat organizational coordination metrics (team engagement, role assignments) from Alignment.
Do NOT include technology-specific actions (model selection, AI platform configuration, toolchain integration, data pipeline setup). All actions must be executive-level decisions, not engineering tasks.
Commitment metrics measure LEADERSHIP INVESTMENT AND GOVERNANCE HEALTH, not business results.

5. commitmentPillars (exactly 3 items)
   Three executive commitment areas: one for Investment, one for Governance, one for Leadership Accountability.
   Each item: { "title": "<1–3 word pillar name>", "actions": ["<action item 1>", "<action item 2>", "<action item 3>"] }
   Actions must be executive-level commitments: budget approval, governance appointment, accountability enforcement, resource allocation, review scheduling.
   Do NOT include technical actions (building models, configuring tools, setting up pipelines) — those belong in project delivery, not leadership commitment.
   IMPORTANT: Never use "CTO" as a pillar title — use "Leadership" instead.
   Example: { "title": "Investment", "actions": ["Approve dedicated initiative budget", "Allocate implementation team resources", "Commit to quarterly funding review"] }
   REJECT an action that is a boilerplate leadership platitude (e.g. "Support the AI initiative" is NOT
   acceptable) — name the specific decision, sign-off, or resource this initiative's recommended starting
   point actually needs from leadership.

6. governanceNodes (exactly 4 items)
   The 4 governance roles or bodies that will oversee THIS initiative from pilot to operational adoption.
   Each item: { "title": "<role or body name>", "description": "<1 sentence on their specific responsibility for this initiative>" }
   IMPORTANT: Never use "CTO" as a node title — use "Leadership Oversight" instead.

7. kpiHighlights (exactly 3 items)
   Three metrics that measure LEADERSHIP INVESTMENT AND GOVERNANCE for THIS initiative — not business outcomes.
   Each item: { "value": "<number with unit>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Acceptable topics: executive sponsors named, funding approved, governance review frequency, named initiative owner, leadership accountability score.
   Do NOT reuse business outcome metrics from Vision (revenue, efficiency, traceability %, test coverage).
   Example: { "value": "1", "label": "Named Initiative Owner", "description": "Single accountable leader from senior leadership." }
   Example: { "value": "Monthly", "label": "Governance Review Cadence", "description": "Executive review of initiative progress and blockers." }
   Example: { "value": "3", "label": "Executive Sponsors", "description": "Senior leaders formally committed to initiative success." }

   Add all three to the brief object for Commitment sections:
   "commitmentPillars": [...], "governanceNodes": [...], "kpiHighlights": [...]`,
  },

  'Solution-Centric Organization': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Solution-Centric Organization" sections only:

JOURNEY RULE: This section organizes the specific AI initiative already established across the journey:
- AI Opportunity Discovery → the selected initiative and the business problem it solves
- AI Use Case Classification → its primary classification and discipline
- Business Value Definition → its expected business value areas and KPIs
- AI Implementation Prioritization → its recommended starting point and priority
- AI Initiative Leadership → the vision, aligned teams, and leadership commitment for this initiative

Use "Selected AI Initiative" and "Recommended Implementation" from the TRANSFORMATION CONTEXT. Name the initiative explicitly — do NOT introduce a different AI opportunity.
The solutionPortfolio must present the SAME initiative structured as an owned business solution (not a portfolio of 3 different initiatives).

5. solutionPortfolio (exactly 1 item — the single AI initiative as a business solution)
   One entry representing the complete AI initiative. Do NOT create multiple portfolio items.
   Item: { "name": "<exact initiative name from TRANSFORMATION CONTEXT>", "businessOwner": "<role title e.g. Test Engineering Manager>", "deliveryTeam": ["<team 1>", "<team 2>", "<team 3>", "<team 4>"], "kpis": ["<KPI 1>", "<KPI 2>", "<KPI 3>"] }
   - name: must be the exact "Selected AI Initiative" from TRANSFORMATION CONTEXT
   - businessOwner: the single role accountable for business outcomes
   - deliveryTeam: array of 4–6 short team/discipline names (e.g. ["Testing", "AI/ML", "Requirements", "QA"])
   - kpis: array of 3–4 metric names drawn from "Target KPIs" in TRANSFORMATION CONTEXT

6. solutionComponents (exactly 3 items — distinct capabilities of the same AI initiative)
   Three sub-capabilities that together compose the AI initiative. Not separate solutions — components of ONE solution.
   Each item: { "name": "<capability name, 2–4 words>", "purpose": "<1 sentence describing what this component does>" }
   Example: { "name": "Acceptance Criteria Mapping", "purpose": "Automatically connect requirements to test cases." }
   REJECT a purpose that could describe any AI feature (e.g. "Uses AI to improve accuracy" is NOT
   acceptable) — state the specific input it processes and output it produces for THIS initiative.

7. kpiHighlights (exactly 3 items)
   Three metrics that measure whether the OPERATING MODEL is working — not whether the AI solution is successful.
   These must be distinct from business outcome metrics (Traceability Rate, Coverage %, Manual Effort Reduction) which belong in Business Value Definition.
   Measure solution ownership and portfolio management effectiveness instead.
   Each item: { "value": "<number with unit e.g. 100%, 3>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Acceptable topics: solutions with named owners, AI solutions in active delivery, portfolio review completion, ownership clarity.
   Example: { "value": "100%", "label": "Solutions with Named Owners", "description": "Every AI initiative has a single accountable owner." }
   Example: { "value": "1", "label": "AI Solutions in Active Delivery", "description": "Focused delivery on the prioritized initiative." }
   Example: { "value": "Quarterly", "label": "Portfolio Review Cadence", "description": "Regular leadership review of delivery status." }

   Add all three to the brief object:
   "solutionPortfolio": [...], "solutionComponents": [...], "kpiHighlights": [...]`,
  },

  'Cross-Functional Delivery Teams': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Cross-Functional Delivery Teams" sections only:

JOURNEY RULE: The delivery team is for the specific AI initiative named in the TRANSFORMATION CONTEXT ("Selected AI Initiative"). Build on:
- AI Use Case Classification → which discipline owns the initiative (e.g. engineering, product, data)
- AI Initiative Leadership / Alignment → which teams were aligned in the spoke wheel (spokeNodes)
- AI Implementation Prioritization → the recommended starting point that defines team priorities

Team roles must be specific to delivering THIS initiative — not a generic AI team. Name real disciplines relevant to the initiative.
REJECT a role list that would fit any AI project (e.g. "AI Engineer, Project Manager, QA" alone is NOT
acceptable) — the roles must reflect what THIS initiative's specific technique actually requires (e.g. a
retrieval initiative needs someone who owns the historical defect corpus, not just a generic "Data Engineer").

5. teamGroups (3 to 5 items — functional groups, not individuals)
   Organise the delivery team into functional groups as a Project Manager naturally thinks about people.
   Each item: { "group": "<function name e.g. Business, Engineering, Domain, Quality>", "roles": ["<role title>", "<role title>"] }
   - group: the function label (2–10 chars, noun, capitalised — e.g. "Business", "Engineering", "Domain", "Quality", "Data")
   - roles: 1–3 specific role titles within that function relevant to THIS initiative
   Do NOT list the same role in multiple groups.
   Example: { "group": "Business", "roles": ["Test Engineering Manager", "Project Manager"] }
   Example: { "group": "Engineering", "roles": ["AI/ML Engineer", "Data Engineer"] }
   Example: { "group": "Domain", "roles": ["Requirements Lead", "V&V Engineer"] }
   Example: { "group": "Quality", "roles": ["QA Lead"] }

6. kpiHighlights (exactly 3 items)
   Three metrics that measure whether the CROSS-FUNCTIONAL TEAM STRUCTURE is working — not the AI solution's outcomes.
   Do NOT use business outcome metrics (Traceability Rate, Coverage %, Manual Effort) — those belong in Business Value Definition.
   Measure team collaboration and delivery effectiveness instead.
   Each item: { "value": "<number with unit e.g. 100%, 4+>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Acceptable topics: cross-functional coverage, team adoption rate, sprint delivery predictability, functions represented, onboarding speed.
   Example: { "value": "100%", "label": "Cross-Functional Coverage", "description": "All required disciplines represented in the team." }
   Example: { "value": "4", "label": "Functions Represented", "description": "Business, engineering, domain, and quality all present." }
   Example: { "value": "85%", "label": "Sprint Delivery Predictability", "description": "Consistent delivery against committed sprint goals." }

   Add both to the brief object:
   "teamGroups": [...], "kpiHighlights": [...]`,
  },

  'End-to-End Ownership': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "End-to-End Ownership" sections only:

JOURNEY RULE: End-to-end ownership is for delivering and sustaining the specific AI initiative named in the TRANSFORMATION CONTEXT ("Selected AI Initiative"). Connect to:
- AI Implementation Prioritization → the recommended starting point defines the first lifecycle stage priorities
- AI Initiative Leadership / Commitment → the governance structure and accountability model from Commitment
- Business Value Definition → the business value measurement stage should reference the agreed KPIs

Every lifecycle stage must name the specific team or role from the delivery team. Do not use generic placeholder names.

5. lifecycleStages (exactly 6 items)
   Six stages of the AI solution lifecycle for THIS initiative, with specific ownership and expected outcomes.
   Stages in order: Opportunity Definition, Solution Design, AI Development, Validation, Deployment, Business Value Measurement
   Each item: { "stage": "<stage name>", "teamResponsibility": "<1–2 specific roles from the delivery team>", "keyActivities": "<5–10 word activity description specific to this initiative>" }
   Activities must reference what happens for THIS initiative at each stage — not generic AI lifecycle steps.
   REJECT an activity that is just the stage name reworded (e.g. "Validation" → "Validate the AI model" is
   NOT acceptable) — name what is actually being validated/deployed/measured for THIS specific technique.

6. kpiHighlights (exactly 3 items)
   Three metrics that measure whether END-TO-END OWNERSHIP is working — not whether the AI solution is delivering value.
   Do NOT use business outcome metrics (Traceability Rate, Coverage %, Manual Effort) — those belong in Business Value Definition.
   Measure team continuity, improvement cadence, and governance health instead.
   Each item: { "value": "<number with unit e.g. 100%, quarterly>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }
   Acceptable topics: team continuity rate, mean time to improvement, quarterly value reviews, handoff frequency, ownership retention across lifecycle.
   Example: { "value": "100%", "label": "Team Continuity Rate", "description": "Same core team from pilot through operational adoption." }
   Example: { "value": "< 2 weeks", "label": "Mean Time to Improvement", "description": "Speed of acting on feedback after deployment." }
   Example: { "value": "Quarterly", "label": "Value Review Cadence", "description": "Leadership reviews delivery outcomes every quarter." }

   Add both to the brief object:
   "lifecycleStages": [...], "kpiHighlights": [...]`,
  },

  // ── AI ROI capability ──────────────────────────────────────────────────────

  'Financial Performance': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Financial Performance" sections only:

JOURNEY RULE: This is the ROI case for the specific AI initiative named in the TRANSFORMATION CONTEXT
("Selected AI Initiative"). Build on:
- AI Implementation Prioritization → the recommended starting point and feasibility assessment
- Business Value Definition → the expected business value areas and KPIs this ROI case must justify
Name the initiative explicitly — never build a generic AI ROI case disconnected from the specific technique chosen.

5. roiSummary (exactly 1 object)
   Four headline figures for the executive ROI summary row.
   { "investment": "<total estimated investment e.g. ₹15 Lakhs, $50K, €40K>", "annualValue": "<expected annual value or savings e.g. ₹38 Lakhs, $120K>", "payback": "<estimated payback period e.g. 5 Months, 8 Months>", "recommendation": "Proceed" }
   - investment and annualValue: realistic figures scaled to the initiative (a single AI traceability tool is not a $10M investment)
   - payback: short text like "5 Months" — derive from investment ÷ annual value
   - recommendation: must be exactly one of "Proceed", "Pilot First", "Reassess"

6. costItems (exactly 5 short strings)
   Where the investment goes. 2–3 word labels only — no sentences.
   Example: ["AI Development", "Tool Integration", "Infrastructure", "Training", "Change Management"]
   Adapt to what this specific initiative actually requires.
   REJECT a generic cost bucket list reused across any AI project — at least 2 of the 5 items must reflect
   what THIS initiative's specific technique actually costs (e.g. "Historical Data Curation" for a retrieval
   initiative, not a generic "Infrastructure" line).

7. valueItems (exactly 5 short strings)
   Where the business value comes from. 3–5 word labels only — no sentences.
   Example: ["Productivity Gain", "Manual Effort Reduction", "Rework Reduction", "Faster Delivery", "Higher Delivery Capacity"]
   Adapt to the actual benefits of this initiative.

8. impactTimeline (exactly 5 short stage names)
   The financial value progression from investment to business impact. Short stage names only.
   Example: ["Investment", "Productivity", "Savings", "ROI", "Scale"]
   Adapt the stage names to reflect the actual financial journey of this initiative.

9. kpiHighlights (exactly 3 items)
   Three headline financial KPIs. Typical: Projected ROI %, Payback Period, Margin Improvement or Cost Savings.
   Each item: { "value": "<number with unit e.g. 150%, 5 Months, 25%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add all five to the brief object:
   "roiSummary": {...}, "costItems": [...], "valueItems": [...], "impactTimeline": [...], "kpiHighlights": [...]`,
  },

  'Operational Excellence': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Operational Excellence" sections only:

JOURNEY RULE: This scorecard is for the specific AI initiative named in the TRANSFORMATION CONTEXT
("Selected AI Initiative"). Build on AI Opportunity Discovery's identified business problems and current
workflow — the "before AI" state must reflect the actual workflow already established in that capability.

5. improvementScorecard (exactly 5 items)
   A PM-level improvement scorecard showing the operational area, current state, AI-enabled future state, and the business benefit in one row.
   Each item: { "area": "<2–4 word area name>", "beforeAI": "<2–4 word current state>", "afterAI": "<2–4 word AI-enabled state>", "businessBenefit": "<3–6 word tangible outcome>" }
   - area: the key operational domain affected (e.g. Traceability, Coverage, Compliance, Reporting, Gap Detection)
   - beforeAI: concise description of the inefficient current state — short noun phrase only
   - afterAI: what AI enables — short noun phrase only
   - businessBenefit: the measurable or tangible outcome for the business (e.g. "80% effort reduction", "Faster quality decisions", "Audit ready")
   Areas must be specific to THIS initiative. Do not use generic labels.
   Example: { "area": "Traceability", "beforeAI": "Manual", "afterAI": "Automated", "businessBenefit": "80% effort reduction" }
   Example: { "area": "Compliance", "beforeAI": "Manual evidence", "afterAI": "Auto reports", "businessBenefit": "Audit ready" }
   Example: { "area": "Gap Detection", "beforeAI": "Reactive", "afterAI": "Continuous", "businessBenefit": "Earlier defect prevention" }
   REJECT a row that would apply to any AI rollout (e.g. "Efficiency" / "Manual" / "Automated" / "Faster"
   with no specifics is NOT acceptable) — the beforeAI state must match the actual workflow step from AI
   Opportunity Discovery, not a placeholder.

   Add all to the brief object:
   "improvementScorecard": [...]`,
  },

  'Customer Value': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Customer Value" sections only:

JOURNEY RULE: This is the customer-facing value case for the specific AI initiative named in the
TRANSFORMATION CONTEXT ("Selected AI Initiative"). Build on Business Value Definition's business value
areas — the customer benefits described here must be a plausible external consequence of that internal value.

5. valueJourney (exactly 5 short stage names — strings only)
   A value progression showing how this AI initiative creates customer value through engineering improvement.
   Each item is a short 2–4 word stage name showing the chain from engineering work to business outcome.
   The progression must follow this logic: Engineering Capability → Product Quality → Customer Confidence → Business Relationship → Future Growth
   Adapt stage names to be specific to THIS initiative and its domain.
   Example: ["Engineering Improvement", "Higher Product Quality", "Greater Customer Confidence", "Better Business Relationship", "Future Growth"]
   Example (traceability initiative): ["Traceability Excellence", "Defect-Free Delivery", "Customer Confidence", "Stronger Partnership", "Contract Growth"]

6. valueDimensions (exactly 5 items)
   Five business outcome cards answering "What does my customer receive?" from this AI initiative.
   Each item: { "name": "<outcome area name>", "points": ["<customer benefit 1>", "<customer benefit 2>", "<customer benefit 3>"] }
   Outcome areas should be: Product Quality, Delivery Confidence, Customer Transparency, Customer Trust, Business Growth (adapt if needed)
   Points: concise 3–6 word customer benefit statements — NOT internal engineering improvements.
   Write from the customer's perspective: what they see, receive, or experience.
   Example: { "name": "Customer Transparency", "points": ["Real-time dashboards", "KPI visibility", "Audit-ready reporting"] }
   Example: { "name": "Business Growth", "points": ["Higher renewal probability", "Stronger competitive position", "Additional engagement opportunities"] }
   REJECT a point that is a generic customer-happiness claim (e.g. "Better customer experience" alone is
   NOT acceptable) — trace it to the actual internal value THIS initiative creates (e.g. faster defect
   turnaround because retrieval speeds up root-cause analysis, not just "faster service").

7. customerKpis (exactly 6 items)
   Six customer outcome KPIs — NOT internal engineering or adoption metrics.
   Each item: { "value": "<number with unit e.g. 95%, 40%, +15%>", "label": "<2–4 word metric name>", "description": "<1 short sentence ≤10 words, customer perspective>" }
   Metrics must measure what the CUSTOMER experiences: satisfaction, delivery, compliance, defects, renewal, win rate.
   Typical labels: Customer Satisfaction, On-Time Delivery, Audit Compliance, Defect Reduction, Contract Renewal Rate, Proposal Win Rate
   Adapt labels to the specific customer outcomes of THIS initiative.

   Add all three to the brief object:
   "valueJourney": [...], "valueDimensions": [...], "customerKpis": [...]`,
  },

  // ── AI Governance & Ethics capability ─────────────────────────────────────

  'Data Privacy & Security': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Data Privacy & Security" sections only:

JOURNEY RULE: These security pillars protect the specific AI initiative named in the TRANSFORMATION
CONTEXT ("Selected AI Initiative") — not a generic AI security checklist. If a data handling, security,
governance, or external-AI-service constraint was established in AI Opportunity Discovery, it must
directly shape which pillars and practices are prioritized here.

5. securityPillars (exactly 4 items)
   Four security-by-design pillars that protect AI delivery.
   Cover these domains: pipeline/DevSecOps security, data protection/PII masking, access control, continuous monitoring.
   Each item: { "name": "<pillar name, 3–5 words>", "points": ["<security practice 1>", "<security practice 2>", "<security practice 3>"] }
   Example item: { "name": "DevSecOps Pipelines", "points": ["Automated vulnerability scanning", "Secure code review gates", "Container image hardening"] }
   REJECT a practice that would appear in any AI security checklist with no connection to this initiative
   (e.g. "Encrypt data at rest" alone is NOT acceptable) — tie it to the actual data this initiative's
   technique touches (e.g. which specific dataset needs PII masking before retrieval can use it).

6. kpiHighlights (exactly 3 items)
   Three security or compliance success metrics.
   Each item: { "value": "<number with unit e.g. 100%, 0 breaches, 99.9%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "securityPillars": [...], "kpiHighlights": [...]`,
  },

  'Ethical AI Guidelines': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Ethical AI Guidelines" sections only:

JOURNEY RULE: These ethics pillars govern the specific AI initiative named in the TRANSFORMATION
CONTEXT ("Selected AI Initiative") — not a generic responsible-AI checklist.

5. ethicsPillars (exactly 4 items)
   Four responsible AI pillars forming the ethics framework.
   Pillars should cover: Fairness, Explainability, Transparency, Accountability (adapt names/content to company context).
   Each item: { "name": "<pillar name e.g. Fairness, Explainability>", "points": ["<practice or principle 1>", "<practice or principle 2>", "<practice or principle 3>"] }
   Example item: { "name": "Fairness", "points": ["Bias testing across demographic groups", "Diverse training data validation", "Regular fairness audits"] }
   REJECT a practice that would apply to any AI system (e.g. "Ensure fairness in AI decisions" alone is
   NOT acceptable) — name the specific bias or explainability risk this initiative's technique creates
   (e.g. a retrieval system surfacing stale or unrepresentative historical cases).

6. kpiHighlights (exactly 3 items)
   Three ethics governance or fairness metrics.
   Each item: { "value": "<number with unit e.g. 100%, 0, 100%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "ethicsPillars": [...], "kpiHighlights": [...]`,
  },

  'Model Validation & Monitoring': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Model Validation & Monitoring" sections only:

JOURNEY RULE: This validation and monitoring loop is for the specific AI initiative named in the
TRANSFORMATION CONTEXT ("Selected AI Initiative") — not a generic MLOps checklist.

5. modelLifecycleStages (exactly 6 items, in this order)
   The six stages of the AI model lifecycle monitoring loop.
   Stages must be in this fixed sequence: Train, Validate, Deploy, Monitor, Detect Drift, Retrain
   Each item: { "stage": "<stage name>", "points": ["<key activity or practice 1>", "<key activity 2>", "<key activity 3>"] }
   Example item: { "stage": "Validate", "points": ["Performance benchmarking against baselines", "Bias and fairness checks", "Edge case stress testing"] }
   REJECT an activity that would apply to any AI model (e.g. "Monitor model performance" alone is NOT
   acceptable) — name the specific metric or failure mode relevant to this initiative's technique
   (e.g. retrieval relevance drift as the historical case corpus grows, not generic "accuracy").

6. kpiHighlights (exactly 3 items)
   Three model governance or reliability metrics.
   Each item: { "value": "<number with unit e.g. 100%, 48-hour, 95%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "modelLifecycleStages": [...], "kpiHighlights": [...]`,
  },

  'Regulatory Compliance': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Regulatory Compliance" sections only:

JOURNEY RULE: These controls govern the specific AI initiative named in the TRANSFORMATION CONTEXT
("Selected AI Initiative"). If a data handling, security, governance, or external-AI-service constraint
was established in AI Opportunity Discovery, the controls must directly enforce it, not restate it generically.

5. complianceControls (exactly 4 items)
   Four compliance control categories forming the AI compliance framework.
   Cover these domains: audit trails and logging, documentation standards, delivery gate reviews, third-party validation/certification.
   Each item: { "name": "<control category name, 3–5 words>", "points": ["<control practice 1>", "<control practice 2>", "<control practice 3>"] }
   Example item: { "name": "Audit Trails & Logging", "points": ["Immutable decision audit logs", "Full data lineage tracking", "Automated compliance reporting"] }
   REJECT a control that would apply to any AI compliance program (e.g. "Maintain audit logs" alone is
   NOT acceptable) — name what specifically must be logged or reviewed for THIS initiative's technique.

6. kpiHighlights (exactly 3 items)
   Three regulatory compliance or audit success metrics.
   Each item: { "value": "<number with unit e.g. 100%, 0 findings, 100%>", "label": "<2–5 word metric name>", "description": "<1 short sentence ≤10 words>" }

   Add both to the brief object:
   "complianceControls": [...], "kpiHighlights": [...]`,
  },

  'Trust & Adoption': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Trust & Adoption" sections only:

JOURNEY RULE: This trust and adoption flywheel is for the specific AI initiative named in the
TRANSFORMATION CONTEXT ("Selected AI Initiative") — not a generic AI change-management plan.

5. adoptionStages (exactly 5 items)
   A self-reinforcing trust and adoption flywheel.
   Stages should follow this progression: trust building → adoption → active usage → business value realisation → confidence/advocacy (adapt names to company context).
   Each item: { "name": "<stage name, 1–3 words e.g. Trust, Adoption, Usage>", "points": ["<stage characteristic or outcome 1>", "<characteristic 2>", "<characteristic 3>"] }
   Example item: { "name": "Trust", "points": ["Transparent AI decision explanations", "Consistent model reliability", "Stakeholder communication programme"] }
   REJECT a characteristic that would apply to any AI rollout (e.g. "Build user confidence" alone is NOT
   acceptable) — name the specific way engineers will see or verify this initiative's technique working.

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

8. aiOpportunities (3 to 4 items)
   Each item is an OBJECT with two fields: { "name": "...", "why": "..." } — not a plain string.

   "name": the specific AI TECHNIQUE matched to one of the company's high-effort activities — not
   a restatement of the business problem in AI-flavoured words. Draw from the AI Approach Options
   in the reference material below (retrieval/similarity matching, anomaly detection, computer
   vision, predictive analytics, classification/triage, generative drafting, knowledge-capture
   retrieval-augmented assistance, optimisation/scheduling) and name the technique explicitly,
   applied to this company's actual context. 3–6 words.
   REJECT any name that is just the business problem reworded (e.g. "manual defect analysis" ->
   "Defect Summarisation" is NOT acceptable — it doesn't say how). A reader must be able to tell
   what kind of AI system this is.

   "why": 1–2 sentences explaining why THIS technique fits THIS specific situation — the
   characteristic of the data or workflow that makes it the right match (e.g. "Historical defect
   descriptions are largely unstructured. Semantic retrieval finds similar failures even when
   keywords differ, improving engineer productivity and defect reuse."). Must reference something
   specific from the company's actual context, not a generic benefit of AI in general.

   Example:
   [
     { "name": "Embedding-Based Similarity Matching", "why": "Historical defect descriptions are largely unstructured. Semantic retrieval finds similar failures even when keywords differ, improving engineer productivity and defect reuse." },
     { "name": "Anomaly Detection on Diagnostic Traces", "why": "Trace and log deviations that precede failures follow patterns too subtle for manual review at scale, but are well suited to statistical anomaly detection." }
   ]

   If the business objective states a constraint on data handling, security, governance, IP
   protection, or restricts/forbids external AI services, this must materially shape
   strategicPosition and priorityActions — name the deployment implication explicitly (e.g.
   self-hosted open-weight models, a private/VPC-hosted inference endpoint, keeping
   retrieval/knowledge-capture data inside the organisation's own infrastructure) rather than a
   generic "compliant infrastructure" or "ensure compliance" placeholder.

   Add all four to the brief object:
   "businessProblems": [...], "workflowSteps": [...], "highEffortActivities": [...], "aiOpportunities": [...]`,
  },

  'Business Value Definition': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Business Value Definition" sections only:

JOURNEY RULE: Use the "Identified AI Opportunities" list from the TRANSFORMATION JOURNEY block. Define business value for EVERY opportunity in that list — do not select only one.
Do NOT describe generic AI value — describe the value each specific opportunity creates for this company.

5. opportunityValues (one item per identified AI opportunity, in the same order as "Identified AI Opportunities")
   Each item: { "opportunity": "<the AI opportunity name, copied verbatim from Identified AI Opportunities — do not reword, shorten, or paraphrase it>", "valueArea": "Engineering Productivity" | "Engineering Excellence" | "Project & Operational Performance" | "Customer & Product Value", "focus": "<short phrase naming what this opportunity actually automates or changes, max 6 words, e.g. 'Automate traceability mapping via semantic linking'>", "outcomes": ["<outcome 1>", "<outcome 2>", "<outcome 3>"] }

   valueArea: pick whichever of the four areas THIS opportunity's value is most concentrated in.
   Multiple opportunities can share the same area if that's genuinely where their value lands — do
   not force every opportunity into a different area.
   outcomes: 2 to 3 concise expected outcomes (3–6 words each), specific to this opportunity.

   REJECT any "focus" or "outcome" that is a generic AI value statement with no mechanism (e.g.
   "Improves efficiency" or "Reduces errors" is NOT acceptable). Each must name what the opportunity
   actually automates or changes (e.g. not "Automates work" but "Automates traceability mapping via
   semantic linking"). A reader must be able to tell what this specific opportunity does, not just
   that it's beneficial.

   DO NOT RESTATE: "focus" and "outcomes" answer a different question than AI Opportunity Discovery's
   "why" (the AI technique/mechanism) and AI Use Case Classification's "rationale" (why the
   classification label fits) — both already exist earlier in this journey and the reader has already
   seen them. This field must be phrased strictly in measurable outcome/metric terms (time saved, cost
   reduced, defect rate, cycle time, adoption) — not a restatement of how the opportunity works or why
   it was classified that way.

6. kpiPills (4 to 5 items)
   Short metric names for the primary measurable KPIs created by these opportunities collectively. Each item is a short string (2–5 words) in title case. Make every KPI specific to what these opportunities measure — not generic engineering metrics.

7. businessValueInsight (1–2 sentences)
   Synthesise the combined business value across all identified opportunities — which one creates the
   most leverage and why, or how they compound together. Do not restate a single opportunity's value
   in isolation.
   REJECT a generic value claim untethered to how the opportunities work (e.g. "This will improve
   productivity across the team" is NOT acceptable without saying which activity it changes and how).

If a data handling, security, governance, IP, or external-AI-service constraint was established in
AI Opportunity Discovery, keep the value claims realistic for that constraint — do not describe
value that assumes unrestricted cloud-scale AI when the initiative is actually constrained to a
private or self-hosted deployment.

   Add all to the brief object:
   "opportunityValues": [...], "kpiPills": [...], "businessValueInsight": "..."`,
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
   REJECT a generic justification (e.g. "It offers the best balance of value and feasibility" alone
   is NOT acceptable) — name the concrete reason specific to this company (e.g. existing data already
   structured for it, existing tooling that lowers the lift, or a constraint that rules out riskier options).

   DO NOT RESTATE: this is not another chance to explain the opportunity's value (already covered in
   Business Value Definition) or how it works (already covered in AI Opportunity Discovery) — the
   reader has seen both. Answer only the sequencing question: relative to the OTHER identified
   opportunities, what makes this one comparatively easier, lower-risk, or better-timed to start first.

5b. recommendedInitiativeName (1 string)
   The SAME initiative named in recommendedStartingPoint, but copied verbatim — exact characters,
   no rewording — from its "name" field in the "Identified AI Opportunities" list. Every downstream
   capability (Data Readiness, Technology Infrastructure, Skills & Workforce, Governance & Ethics, and
   the rest of AI Strategy) is anchored to this exact string as "the" initiative going forward, so it
   must match one of the identified opportunity names exactly.

6. priorityQuadrants (exactly 4 items in this fixed order)
   Distribute ALL identified AI opportunities from Capability 1 across the 2×2 matrix. Use ONLY initiatives from the "Identified AI Opportunities" journey context — do not add unrelated ones.
   Order: [0] Strategic Bets (High Value, Low Feasibility), [1] Quick Wins (High Value, High Feasibility), [2] Fill-ins (Low Value, Low Feasibility), [3] Future Opportunities (Low Value, High Feasibility)
   Each item: { "id": "<strategic-bets|quick-wins|fill-ins|future-opportunities>", "label": "<quadrant name>", "initiatives": ["<initiative name from identified list>"] }
   The "Future Opportunities" quadrant holds initiatives that are feasible but currently lower priority — do NOT leave it empty if there are remaining identified opportunities to place.

7. dimensionCards (exactly 4 items in this fixed order)
   Assess the RECOMMENDED STARTING INITIATIVE (from item 5) across the four dimensions. Bullets must be specific to that initiative and this company.
   Order: [0] Business Value, [1] Implementation Feasibility, [2] Strategic Alignment, [3] Organizational Readiness
   Each item: { "title": "<dimension name>", "bullets": ["<assessment 1>", "<assessment 2>", "<assessment 3>"] }
   Bullets must be concise 2–4 word labels specific to this initiative and company context.
   REJECT bare quality labels with no reason attached (e.g. "High feasibility" or "Strong alignment"
   alone is NOT acceptable) — each bullet must point at the specific fact that makes it true (e.g.
   "Existing embedding infra ready" rather than "High feasibility"). For the Implementation Feasibility
   dimension specifically, if a private/self-hosted deployment constraint was established in AI
   Opportunity Discovery, the bullets must reflect that constraint's real impact on feasibility — not
   ignore it.
   DO NOT RESTATE: the Business Value dimension's bullets must not repeat the outcomes/focus already
   listed for this opportunity in Business Value Definition — reframe them as comparative prioritization
   facts (e.g. "Largest opportunity value" or "Fastest payback" relative to the other identified
   opportunities), not a second description of what the opportunity does.

8. implementationPhases (2 to 4 items, in chronological order)
   Sequence ALL identified opportunities from Capability 1 — not just the recommended starting point
   — into delivery phases. Every opportunity must appear in exactly one phase; do not drop any.
   Derive the sequence from priorityQuadrants: Quick Wins phase first (immediate), Strategic Bets next
   (needs more investment/prep despite high value), Fill-ins opportunistically alongside an early phase
   where they add cheap wins without competing for the same resources, Future Opportunities last
   (deferred). Not every quadrant needs its own phase — merge quadrants into a phase where that reflects
   a realistic delivery sequence.
   Each item: { "phase": "<phase name + approximate timeframe, e.g. 'Phase 1 — Quick Wins (0-3 months)'>", "initiatives": ["<opportunity name from identified list>"], "rationale": "<1 sentence specific to this company>" }
   REJECT a generic sequencing reason (e.g. "This phase focuses on quick wins" alone is NOT acceptable)
   — name the concrete reason this company should sequence it here (e.g. an existing dependency, a
   resource constraint, or a capability that must exist before the next phase is feasible).

   Add all to the brief object:
   "recommendedStartingPoint": "...", "recommendedInitiativeName": "...", "priorityQuadrants": [...], "dimensionCards": [...], "implementationPhases": [...]`,
  },

  'AI Use Case Classification': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Use Case Classification" sections only:

JOURNEY RULE: Use the "Identified AI Opportunities" list from the TRANSFORMATION JOURNEY block. Classify EVERY opportunity in that list — do not select only one.

5. opportunityClassifications (one item per identified AI opportunity, in the same order as "Identified AI Opportunities")
   Each item: { "opportunity": "<the AI opportunity name, copied verbatim from Identified AI Opportunities — do not reword, shorten, or paraphrase it>", "classification": "Productivity AI" | "Functional AI" | "Product AI", "rationale": "<1 sentence, specific to this opportunity and company, stating why this classification LABEL fits — e.g. 'This is Productivity AI because it changes an internal engineering workflow, not anything the customer sees.'>" }

   Classification definitions:
   - Productivity AI: improves internal engineering or operational efficiency (faster analysis, less manual effort)
   - Functional AI: strengthens a core engineering or product function (quality, reliability, compliance, safety)
   - Product AI: becomes part of the customer-facing product or vehicle capability

   REJECT any rationale that only restates the classification label in generic terms (e.g. "This is
   a Productivity AI initiative that helps engineers work more efficiently" is NOT acceptable — it
   doesn't say how). The rationale must name the specific characteristic of THIS opportunity that
   places it in this classification — a reader must be able to tell why this label fits and not one
   of the other two.

   DO NOT RESTATE: this rationale answers a different question than AI Opportunity Discovery's "why"
   field — assume the reader already knows the AI technique and how it works. Do not re-explain the
   mechanism (retrieval, anomaly detection, etc.); explain only why the business-outcome LABEL
   (Productivity/Functional/Product) is the correct one for this opportunity.

   If a data handling, security, governance, IP, or external-AI-service constraint was established
   in AI Opportunity Discovery, keep it in mind here too — do not describe an outcome that implies
   unrestricted cloud-scale AI when the initiative is actually constrained to a private or self-hosted
   deployment.

   Example:
   [
     { "opportunity": "Embedding-Based Similarity Matching", "classification": "Productivity AI", "rationale": "This is Productivity AI, not Functional AI, because it speeds up how engineers find prior work rather than changing the diagnostic decision itself." },
     { "opportunity": "Anomaly Detection on Diagnostic Traces", "classification": "Functional AI", "rationale": "This is Functional AI because it changes what counts as a validated diagnostic outcome, not just how fast engineers work." }
   ]

   Add all to the brief object:
   "opportunityClassifications": [...]`,
  },

  'Critical Data Identification': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Critical Data Identification" sections only:

JOURNEY RULE: The datasets identified here must serve the specific AI initiative named in the
TRANSFORMATION CONTEXT ("Selected AI Initiative") — not a generic AI data readiness checklist. If a
data handling, security, or external-AI-service constraint was established in AI Opportunity Discovery,
the recommended sources and expectedAIOutput must stay consistent with it.

5. datasets (exactly 6 items — one per data category)
   The minimum critical datasets required to implement this AI use case.
   Categories: Business & Program, Product, System & Software, Engineering, Operational, Supporting Knowledge.
   Each item: { "name": "<2–4 word dataset name specific to this initiative>", "purpose": "<why this data is needed, ≤10 words, business reason not technical>", "typicalSource": "<the specific system or tool where this company's copy of this data actually lives>", "priority": "HIGH|MEDIUM|LOW", "expectedAIOutput": "<what AI will produce from this dataset, ≤10 words, concrete output not description>" }
   - name: specific to THIS use case and domain
   - purpose: why this data matters for the AI — not what the data is
   - typicalSource: name real systems this company would plausibly run, following the DATA SOURCE GUIDANCE above where one is given. Never list a tool merely because it is common in some other industry.
   - priority: HIGH = AI cannot function without it, MEDIUM = important but workaround possible, LOW = adds value but not blocking
   - expectedAIOutput: the concrete AI deliverable — e.g. "Structured user stories linked to acceptance criteria", "Searchable test case knowledge base", "Automated traceability map"
   REJECT a purpose that would apply to any AI project (e.g. "Needed for AI analysis" alone is NOT
   acceptable) — name the specific reasoning step or output THIS initiative's technique performs with this data.

6. traceabilityChain (exactly 6 short strings)
   The engineering data flow from business objective through to AI output.
   Must start with "Business Objective" and end with "AI Insight".
   The 4 middle nodes should reflect the actual data chain for THIS use case.
   Example: ["Business Objective", "Requirements", "Test Cases", "Test Results", "Defects", "AI Insight"]
   Example (diagnostics): ["Business Objective", "ECU Logs", "DTCs", "Failure Patterns", "Root Cause", "AI Insight"]

7. collectionOrder (exactly 5 items)
   Recommended order for collecting datasets — most critical first.
   Each item: { "name": "<dataset name — must match a name from datasets>", "action": "<verb phrase describing the implementation action, ≤7 words — e.g. 'Export User Stories from Jira', 'Connect Test Repository', 'Extract Acceptance Criteria'>", "reason": "<why this step comes here, ≤8 words, practical not governance>" }
   - action must be specific and implementation-oriented, starting with a verb
   - reason must explain WHY this step is in this position in the sequence

8. implementationRoadmap (exactly 5 items)
   Step-by-step path showing progress toward data readiness.
   Each item: { "step": "<short action label, 3–5 words>", "status": "ready|pending" }
   - "ready": data likely exists and is accessible in typical engineering systems
   - "pending": data needs to be collected, extracted, or prepared
   The last item must always be: { "step": "Ready for AI Data Preparation", "status": "pending" }

9. consultantGuidance (string, 2–3 sentences)
   Expert consulting advice specific to THIS use case and industry context.
   Start with the minimum viable data scope. Then explain the phased expansion strategy.
   Example: "Start with the minimum data required to deliver business value rather than attempting to integrate every engineering repository. Prioritize user stories, acceptance criteria, and test cases first. Once reliable traceability is established, expand by incorporating execution results, defects, and engineering standards."

10. aiRecommendation (string, 2–3 sentences)
    A specific, actionable AI implementation recommendation.
    Name specific tools and integrations. Explain the phased delivery logic.
    Example: "Begin implementation with Jira and TestRail integration to establish automated traceability between user stories, acceptance criteria, and test cases. Delay integration of secondary knowledge sources until the core traceability workflow is operational. This phased approach minimizes implementation effort while delivering measurable business value within the first release."

    Add all to the brief object:
    "datasets": [...], "traceabilityChain": [...], "collectionOrder": [...], "implementationRoadmap": [...], "consultantGuidance": "...", "aiRecommendation": "..."`,
  },

  'AI Data Preparation': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Data Preparation" sections only:

JOURNEY RULE: Prepare data for the specific AI initiative named in the TRANSFORMATION CONTEXT
("Selected AI Initiative"), building on the critical datasets already identified in Critical Data
Identification — do not introduce datasets that weren't already named there.

5. prepWorkPackages (exactly 5 items)
   Each item is a preparation work package for a specific engineering dataset.
   Fields:
   - "name": "<repository/dataset name, 2–4 words>"
   - "workPackage": ["<action 1, ≤7 words>", "<action 2, ≤7 words>", "<action 3, ≤7 words>"] — exactly 3 specific preparation actions
   - "whyAINeeds": "<one sentence explaining why AI requires this data to be prepared, ≤15 words>"
   - "recommendedOwner": "<engineering role, 2–3 words>"
   - "deliverable": "<AI-ready output name, 3–5 words — e.g. 'Standardized Requirements Dataset'>"
   - "priority": "HIGH|MEDIUM|LOW"
   Example: { "name": "Requirements Repository", "workPackage": ["Standardize requirement IDs", "Remove duplicate requirements", "Add metadata tags"], "whyAINeeds": "Ensures requirements can be linked consistently with test cases and defects.", "recommendedOwner": "Requirements Engineer", "deliverable": "AI-ready Requirements Dataset", "priority": "HIGH" }
   REJECT a workPackage action that is generic data-hygiene advice (e.g. "Clean the data" alone is NOT
   acceptable) — name the specific transformation this dataset needs for THIS initiative's technique to work.

6. firstSteps (exactly 4 items)
   The first 4 executable implementation steps in priority order.
   Each item: { "action": "<specific action, ≤8 words>", "why": "<why this step matters, ≤10 words>", "owner": "<role title, 2–3 words>", "expectedOutput": "<tangible result, 3–5 words>" }
   Example: { "action": "Standardize requirement identifiers", "why": "Enables traceability across all repositories", "owner": "Requirements Lead", "expectedOutput": "Unified Requirement Dataset" }

7. prepSummary
   Planning totals derived from the above.
   Object: { "workPackages": <total count of prepWorkPackages>, "repositories": <distinct repository/system count, 3–8>, "deliverables": <count of AI-ready deliverables>, "estimatedDuration": "<e.g. '2 Weeks', '3–4 Weeks', '1 Month'>" }

   Add all to the brief object:
   "prepWorkPackages": [...], "firstSteps": [...], "prepSummary": {...}`,
  },

  'Data Architecture Enablement': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Data Architecture Enablement" sections only:

JOURNEY RULE: This architecture serves the specific AI initiative named in the TRANSFORMATION CONTEXT
("Selected AI Initiative"). If a data handling, security, governance, or external-AI-service constraint
was established in AI Opportunity Discovery, the recommended technologies and archDecisions must
reflect that constraint's real impact (e.g. self-hosted vector store instead of a third-party API)
rather than a generic "compliant infrastructure" placeholder.

5. archLayers (exactly 4 items — fixed order: Source Systems, Integration Layer, AI Data Store, AI Applications)
   Each item describes one layer of the recommended AI architecture for this use case.
   Fields:
   - "name": "Source Systems" | "Integration Layer" | "AI Data Store" | "AI Applications"
   - "purpose": "<one sentence, what this layer does, ≤10 words>"
   - "recommended": ["<tool or technology 1>", "<tool or technology 2>", "<tool or technology 3>", "<tool or technology 4>"] — 3–4 specific technologies or tools appropriate for this AI use case
   - "whyNeeded": "<one sentence explaining why this layer is needed for AI, ≤12 words>"
   Example: { "name": "Source Systems", "purpose": "Where project data originates.", "recommended": ["Jira", "Confluence", "GitHub", "Polarion"], "whyNeeded": "Provides the engineering artifacts AI needs to function." }

6. archDecisions (exactly 4 items)
   Mini design recommendations for the team — one per key architecture decision area.
   Each item: { "decisionArea": "<area name, 1–3 words — e.g. Data Model, Integration, Storage, Security>", "recommendation": "<specific recommendation, ≤10 words>", "why": "<business or technical reason, ≤10 words>" }
   Example: { "decisionArea": "Data Model", "recommendation": "Use a unified traceability schema", "why": "Enables reusable AI insights across projects" }
   Cover areas relevant to this AI use case: data model, integration pattern, storage choice, security or compliance, query strategy, etc.
   REJECT a recommendation that names no actual technology (e.g. "Choose a suitable database" alone is
   NOT acceptable) — name the specific technology and the reason it fits this initiative's data shape.

7. techStack (exactly 6 items — one per architecture layer, fixed layer names)
   Technology recommendations organized by layer.
   Use EXACTLY these 6 layer names in this order: "Source Systems", "Integration", "Storage", "Processing", "AI Models", "Applications"
   Each item: { "layer": "<one of the 6 fixed names above>", "recommendation": "<specific technology or tool names, comma-separated if multiple, ≤8 words total>" }
   Example: { "layer": "Storage", "recommendation": "PostgreSQL, Neo4j, Pinecone" }

8. archSummary
   Key planning totals derived from the above.
   Object: { "sourceSystems": <count of source systems recommended>, "integrationPoints": <count of integration methods>, "aiStorage": "<primary storage technology, ≤5 words>", "aiConsumers": "<list of AI consumers, ≤6 words>" }

9. archPattern (exactly 6 strings)
   The recommended end-to-end implementation architecture pattern for this AI use case.
   Each string is a node label describing one stage of the architecture, from data source to user output.
   Must start with the data source type and end with the user-facing application.
   Example (engineering AI): ["Project Systems", "Integration Layer", "Central AI Data Store", "Vector Search", "LLM", "Dashboard"]
   Example (automotive diagnostics): ["ECU & Sensors", "Data Pipeline", "Diagnostic Data Lake", "Semantic Search", "AI Inference", "Technician Portal"]
   Keep each node label 2–4 words.

10. archConsultantGuidance (string, 2–3 sentences)
    Expert consulting advice on HOW to implement this architecture for this specific use case.
    Explain the phased build-up: start simple, add complexity only when needed.
    Name the starting point and the conditions under which to expand.
    Example: "Build the architecture incrementally. Begin by connecting project systems through standard APIs and storing normalized engineering data in a relational database. Introduce graph and vector databases only when relationship reasoning and semantic search become business requirements."

    Add all to the brief object:
    "archLayers": [...], "archDecisions": [...], "techStack": [...], "archSummary": {...}, "archPattern": [...], "archConsultantGuidance": "..."`,
  },

  'System Integration & Architecture': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "System Integration & Architecture" sections only:

JOURNEY RULE: This integration architecture is for the specific AI initiative named in the
TRANSFORMATION CONTEXT ("Selected AI Initiative") — not a generic system integration exercise.

CONSULTING FOCUS RULE:
This capability describes HOW AI integrates into existing engineering workflows — not an assessment of readiness.
❌ Do NOT use CONNECTED / PARTIAL / MISSING status labels.
❌ Do NOT report integration readiness percentages.
✅ Recommend integrations as if designing the architecture from scratch.
✅ Focus on: how AI becomes another step inside the workflows engineers already use.

CRITICAL STRATEGIC POSITION RULE:
The strategicPosition must describe the ARCHITECTURAL OBJECTIVE of this integration — not the AI use case outcome.
It must emphasise: (1) embedding AI into existing engineering workflows, (2) standardised integrations, (3) engineers staying inside their existing tools.
❌ WRONG: "AI-driven traceability is embedded into test management tools to improve compliance."
✅ CORRECT: "AI capabilities are embedded into existing engineering workflows through standardised integrations, enabling engineers to receive AI-generated insights directly within the tools they already use without changing established development processes."

5. siaEngineeringSystems (3–5 items)
   The key engineering or business systems the AI solution should integrate with for this use case.
   Each item: { "name": "<system name, e.g. Jira, Polarion, GitHub>", "purpose": "<1 sentence on what this system does, ≤10 words>", "integrationPattern": "<e.g. REST API, OSLC API, Webhook, SDK>", "aiInteraction": "<1 sentence on how AI uses this system, ≤10 words>", "expectedOutcome": "<Engineers receive [specific AI action] directly inside [system name]. ≤12 words>" }
   Example expectedOutcome: "Engineers receive AI-generated traceability suggestions directly inside Jira."
   REJECT an aiInteraction that would fit any AI feature (e.g. "AI analyzes the data" alone is NOT
   acceptable) — name the specific technique from the selected initiative operating on this system's data.

6. siaWorkflowSteps (4–6 strings)
   A sequential workflow showing AI as one embedded step inside the engineering process.
   Each string is a short step label (≤6 words). Begin with an engineer action, include an "AI [action]" step in the middle, end with an engineer decision or system update.
   Example: "Engineer creates User Story", "AI identifies missing traceability", "Engineer validates recommendation", "Coverage dashboard updates".

7. siaIntegrationPriorities (4–5 items)
   Strategic integration objectives in recommended implementation order — consulting-style, not technical tasks.
   Each item: { "order": <1-5>, "name": "<consulting objective, ≤7 words>", "priority": "HIGH|MEDIUM|LOW", "businessBenefit": "<1 sentence on business outcome, ≤10 words>" }
   Use these objectives as guidance (adapt to the use case):
   1. Connect Core Engineering Systems (HIGH)
   2. Establish Standard Integration Interfaces (HIGH)
   3. Embed AI into Daily Engineering Workflows (HIGH)
   4. Secure AI Data Exchange (MEDIUM)
   5. Monitor Integration Health (MEDIUM)

8. siaArchLayers (exactly 5 items in this fixed order)
   The integration architecture — 5 fixed layers. Do NOT include the AI Platform layer (that belongs to AI Platform Readiness).
   Use these fixed layer names in this exact order: Engineering Systems, Integration Layer, AI Services, Engineering Workflow, Business Decisions.
   Each item: { "name": "<fixed layer name>", "technologies": ["<tool or service, ≤3 words>", ...2–4 items] }
   Example: Engineering Systems → ["Jira", "Polarion", "GitHub"], Integration Layer → ["REST APIs", "Event Bus", "API Gateway"], AI Services → ["Claude API", "pgvector", "LangChain"], Engineering Workflow → ["Requirement Authoring", "Code Review", "Test Design"], Business Decisions → ["Engineering Dashboard", "Manager Reports", "Delivery Metrics"]

9. siaImplSequence (exactly 5 strings in this fixed order)
   The 5-step implementation roadmap. Use these exact labels:
   ["Connect Engineering Systems", "Standardize Data Exchange", "Embed AI into Existing Workflows", "Enable Secure Monitoring", "Scale Across Engineering Programs"]

10. siaIntegrationPrinciples (4–5 strings)
    The architectural principles that govern this integration approach. Each string is one principle (≤15 words).
    Example principles:
    - "Integrate AI into existing workflows before introducing new user interfaces."
    - "Prefer API-first and event-driven integrations over manual synchronisation."
    - "Minimise disruption to established engineering processes."
    - "Reuse existing enterprise integration services wherever possible."
    - "Preserve security, governance, and traceability across every integration."

11. siaConsultantGuidance
    2–3 sentences. Guide the project manager on how to sequence integrations for maximum business impact. Focus on starting with the highest-value systems and building reusable integration services for future AI initiatives. Do NOT mention data preparation or infrastructure deployment concerns.

12. siaAIRecommendation
    1–2 sentences. Executive consulting tone. Recommend embedding AI directly into the engineering tools already used by project teams rather than introducing standalone applications. Describe how standardised, reusable integrations provide a foundation for every future AI initiative.

   Add all to the brief object:
   "siaEngineeringSystems": [...], "siaWorkflowSteps": [...], "siaIntegrationPriorities": [...], "siaArchLayers": [...], "siaImplSequence": [...], "siaIntegrationPrinciples": [...], "siaConsultantGuidance": "...", "siaAIRecommendation": "..."`,
  },

  'AI Platform Readiness': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Platform Readiness" sections only:

JOURNEY RULE (platform-scoped, not initiative-named): Unlike other capabilities, this one should NOT name
the "Selected AI Initiative" — the platform must stay reusable across every initiative. Journey continuity
here means something different: ground the platform's scope in the ACTUAL portfolio of opportunities
identified in AI Opportunity Discovery and their classifications (e.g. if the "AI Classifications" list
shows a mix of Productivity AI and Functional AI initiatives, the platform must be scoped to support that
real mix — not a hypothetical, disconnected "any AI initiative" list). REJECT platform capabilities that
would be identical regardless of what was actually discovered — the breadth and priority of platform
investment should still trace back to the real number and variety of opportunities identified.

CRITICAL PLATFORM FOCUS RULE:
AI Platform Readiness is about establishing SHARED PLATFORM SERVICES — NOT about solving a specific AI use case.
Every field below must describe what the platform provides to ALL AI initiatives, not what the current AI use case achieves.
❌ Do NOT mention the specific AI use case outcome (e.g. traceability, defect detection, test generation) in any field below.
❌ Do NOT describe use-case-specific integrations (e.g. "integrate with Jira", "connect to TestRail").
✅ Write as if this platform will support 10 different AI initiatives across the organisation.

CRITICAL STRATEGIC POSITION OVERRIDE:
The strategicPosition for this section must describe the purpose of the shared AI platform — NOT the AI use case outcome.
It must answer: "What does this platform enable for ALL engineering teams?"
Example format: "Establish a standardised AI platform that enables engineering teams to develop, deploy, monitor, and continuously improve AI solutions using shared services, reusable knowledge assets, and governed AI operations."
Do NOT write about specific AI use cases, traceability, defect detection, or any domain-specific outcome.

5. platformCapabilities (exactly 6 items in this fixed order)
   The 6 shared platform capability areas every AI initiative will use.
   Use these fixed names in this exact order: AI Development Workspace, Prompt & Model Management, Knowledge Platform, Deployment & Automation, Monitoring & Governance, Collaboration & Reuse.
   Each item:
   - purpose: 1 sentence on what shared platform service this provides (platform-level, not use-case-specific), ≤12 words
   - capabilities: 3–5 specific managed services or platform tools that implement this capability (e.g. "Azure AI Studio", "MLflow", "pgvector"), ≤4 words each
   - businessValue: 1 sentence on the platform benefit delivered to all AI initiatives — must be PLATFORM-centric, NOT use-case-specific.
     ✅ Good: "Accelerates governed AI development and experimentation across teams."
     ✅ Good: "Reduces operational overhead through standardised AI deployment."
     ❌ Bad: "Enables AI-driven traceability and gap mapping." (use-case specific)
     ❌ Bad: "Powers test generation accuracy." (use-case specific)
   Each item: { "name": "<fixed name>", "purpose": "<platform service description>", "capabilities": ["<tool/service>", ...], "businessValue": "<platform benefit>" }

6. platformBlueprintLayers (exactly 7 items in this fixed order)
   The AI platform architecture blueprint showing which platform technology implements each layer.
   IMPORTANT: This shows the PLATFORM LAYERS, not an application architecture or data flow.
   Use these fixed layer names in this exact order: Engineering Users, AI Applications, Prompt & Model Services, Knowledge Platform, Deployment Services, Monitoring & Governance, Development Workspace.
   recommendation = the managed platform technology that implements this layer (e.g. "Azure AI Foundry", "pgvector + Azure Search", "Azure Monitor + Prometheus").
   Do NOT recommend enterprise application tools (Jira, TestRail, DOORS, Neo4j) — those belong in System Integration.
   Each item: { "layer": "<fixed layer name>", "recommendation": "<managed platform technology, ≤6 words>" }

7. platformRecs (3–4 items)
   The highest-priority platform ESTABLISHMENT actions — reusable across any AI initiative.
   These must be platform-building actions, not use-case solutions.
   ✅ Good: "Establish a shared AI development workspace.", "Implement prompt and model lifecycle management.", "Build a reusable enterprise knowledge platform.", "Enable automated AI deployment.", "Introduce AI monitoring and governance."
   ❌ Bad: "Deploy a unified knowledge graph for traceability." (use-case specific)
   Each item: { "recommendation": "<platform action, ≤8 words>", "why": "<platform rationale, ≤10 words>", "priority": "HIGH|MEDIUM|LOW", "implementationPhase": "Phase 1|Phase 2|Phase 3" }

8. aprImplRoadmap (exactly 6 strings in this fixed order)
   The 6-step platform implementation roadmap. Use these exact labels:
   ["Establish Development Workspace", "Build Knowledge Platform", "Configure Prompt Management", "Deploy AI Services", "Enable Monitoring", "Scale Across Projects"]

9. aprStackLayers (exactly 6 items in this fixed order)
   The recommended AI platform stack — which managed technology implements each platform layer.
   Use these fixed layer names in order: AI Development, Prompt Management, Knowledge, Deployment, Monitoring, Collaboration.
   Each item: { "layer": "<fixed layer name>", "recommendation": "<managed platform technology, ≤6 words>" }

10. aprConsultantGuidance
   2–3 sentences of action-oriented platform guidance.
   Focus on: establishing core platform capabilities first, then enabling individual AI use cases on top of that foundation.
   ✅ Good: "Establish the core AI platform capabilities first — development workspace, prompt management, knowledge retrieval, deployment automation, and monitoring. Once these shared services are operational, onboard individual AI use cases as consumers of the platform."
   ❌ Do NOT recommend specific enterprise tool integrations (Jira, TestRail, DOORS).
   ❌ Do NOT focus on the specific AI use case.

11. aprAIRecommendation
   1–2 sentences. Describe the platform as a reusable, shared foundation for all AI initiatives — not a solution to the specific use case.
   ✅ Good: "Build a reusable AI platform that standardises development, knowledge retrieval, deployment automation, monitoring, and collaboration. A shared platform foundation accelerates future AI initiatives while improving governance and reducing implementation effort."
   ❌ Do NOT mention the specific AI use case, technology, or domain-specific outcome.

   Add all to the brief object:
   "platformCapabilities": [...], "platformBlueprintLayers": [...], "platformRecs": [...], "aprImplRoadmap": [...], "aprStackLayers": [...], "aprConsultantGuidance": "...", "aprAIRecommendation": "..."`,
  },

  'AI Compute & Deployment Strategy': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Compute & Deployment Strategy" sections only:

JOURNEY RULE: This deployment strategy is for the specific AI initiative named in the TRANSFORMATION
CONTEXT ("Selected AI Initiative"). If a data handling, security, governance, or external-AI-service
constraint was established in AI Opportunity Discovery, the deployment model, compute strategy, and
security model must reflect that constraint's real impact (e.g. self-hosted/open-weight models, a
private/VPC-hosted inference endpoint) rather than a generic "compliant infrastructure" placeholder.

TECHNIQUE-INFRASTRUCTURE MATCH: The stack must reflect what the Selected AI Initiative's specific
mechanism needs to actually function — never a generic on-prem LLM stack reused regardless of technique.
Reason about the mechanism before choosing the Data Layer and AI Platform recommendations:
- If the technique depends on retrieval or semantic similarity matching (e.g. finding analogous historical
  cases via embeddings), the Data Layer recommendation MUST be a vector-search-capable store (a vector
  database, or a vector-search extension on an existing store) — plain relational or time-series storage
  alone cannot do semantic matching and is NOT an acceptable substitute.
- If the technique depends on classification or anomaly detection over structured/time-series signals,
  structured or time-series storage is the right call instead — do not force a vector store where none is needed.
- If the technique depends on generation/drafting from retrieved or structured context, the Data Layer must
  support whatever that technique retrieves from (vector store if it retrieves by similarity, structured
  store if it retrieves by structured lookup).
REJECT a Data Layer recommendation that ignores this reasoning (e.g. recommending only a relational/
time-series database for a retrieval-based initiative) — the Data Layer choice must be justified by what
the Selected AI Initiative's mechanism specifically requires to run, not a boilerplate storage layer.

5. deploymentBlocks (exactly 4 items)
   The 4 building blocks of the recommended deployment architecture. Use these fixed blockTypes in this exact order: AI Workload, Deployment Model, Compute Strategy, Scaling Strategy.
   Each item: { "blockType": "<AI Workload|Deployment Model|Compute Strategy|Scaling Strategy>", "name": "<specific recommendation for this use case, 3–5 words>", "why": "<1-sentence outcome-focused rationale, ≤12 words — what it delivers, not what risk it avoids>" }
   REJECT a "why" that would justify any AI deployment (e.g. "Improves reliability and performance" alone
   is NOT acceptable) — name the specific reason tied to this initiative's technique or its constraints.

6. cdsDeploymentFlow (exactly 6 strings in this fixed order)
   The 6 nodes of the end-to-end AI deployment flow. Use these exact names:
   ["Engineering Repositories", "Integration Layer", "AI Data Store", "LLM Inference", "AI Application", "Engineering Users"]

7. techRecommendations (exactly 5 items)
   Technology recommendations for each deployment layer. Use these fixed layer names in order: Infrastructure, AI Platform, Data Layer, Integration, Monitoring.
   Each item: { "layer": "<layer name>", "recommendation": "<specific tool or service, ≤6 words>", "selectionRationale": "<why this is the right choice for this use case, ≤12 words>" }
   The Data Layer entry specifically must follow the TECHNIQUE-INFRASTRUCTURE MATCH reasoning above — name
   a vector-search-capable store when the mechanism retrieves by similarity, not a default relational/
   time-series choice reused regardless of technique.

8. cdsArchRationale (exactly 5 strings)
   5 concise executive-level reasons why this architecture is the right strategic choice. Each string ≤12 words, outcome-focused, suitable for a PM presenting to stakeholders.

9. deploymentDecisions (exactly 5 items)
   Key architectural decisions. Use these fixed decision types in this exact order: Deployment Model, Compute Platform, Integration Pattern, Security Model, Data Residency.
   Each item: { "decisionType": "<Deployment Model|Compute Platform|Integration Pattern|Security Model|Data Residency>", "choice": "<recommended option, ≤5 words>", "reason": "<1-sentence rationale, ≤10 words>" }

10. cdsImplSequence (exactly 6 strings in this fixed order)
   The 6 implementation steps. Use these exact labels:
   ["Prepare AI Data", "Provision Infrastructure", "Deploy AI Platform", "Deploy AI Assistant", "Pilot with Engineering Team", "Scale to Organisation"]

11. infraItems (4–6 items)
   Expected infrastructure components. Recommend capabilities and platforms only — NOT sizing, node counts, or specific resource numbers.
   Each item: { "item": "<component capability, ≤4 words>", "recommendation": "<specific platform or service name, ≤6 words>" }
   Must stay consistent with the Data Layer choice from techRecommendations — if that entry is a
   vector-search-capable store, include a matching vector/embedding index component here, not a
   generic storage line that omits it.

12. cdsInvestmentEstimate (exactly 5 items)
   Investment level classification for each area. Use these fixed areas in this order: Cloud Infrastructure, AI Platform, Integration, Operations, Overall Complexity.
   Each item: { "area": "<area name>", "estimate": "<Low|Medium|High>" }
   Base the estimate on typical complexity and market rates — never include specific cost figures.

13. cdsConsultantGuidance
   2–3 sentences of action-oriented phased deployment guidance. Begin with recommending a pilot using managed cloud AI services and a small dataset. State what to validate before scaling.

14. cdsAIRecommendation
   1–2 sentences making a positive, outcome-focused architecture recommendation. State clearly what to adopt and what it delivers. Close with how to de-risk through a pilot. Do NOT lead with a risk or a caution.

15. recommendedModelApproach (1 string, ≤6 words)
   State which model approach fits THIS initiative: "Frontier LLM (cloud API)" or "Open-weight model
   (self-hosted)" — or name a specific model class if warranted (e.g. "Domain-specialized SLM"). Base
   this on the JOURNEY RULE above — a data handling, security, governance, or external-AI-service
   constraint from AI Opportunity Discovery decides this, not a default preference.

16. modelSelectionRationale (1–2 sentences)
   Name the Quality, Cost, AND Performance tradeoff for this initiative specifically.
   REJECT a rationale that only addresses one of the three, or one generic enough to apply to a
   different initiative — tie it to this initiative's actual constraints (e.g. expected query volume,
   a sovereignty/data-residency requirement, or a latency need), not a boilerplate justification.

   Add all to the brief object:
   "deploymentBlocks": [...], "cdsDeploymentFlow": [...], "techRecommendations": [...], "cdsArchRationale": [...], "deploymentDecisions": [...], "cdsImplSequence": [...], "infraItems": [...], "cdsInvestmentEstimate": [...], "cdsConsultantGuidance": "...", "cdsAIRecommendation": "...", "recommendedModelApproach": "...", "modelSelectionRationale": "..."`,
  },

  // ── Skills & Workforce domain ─────────────────────────────────────────────

  'AI Roles & Capability Planning': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Roles & Capability Planning" sections only:

JOURNEY RULE: The roles and capabilities below are for delivering the specific AI initiative named in
the TRANSFORMATION CONTEXT ("Selected AI Initiative") — not a generic AI project team.

IMPORTANT: This blueprint is generated BEFORE implementation. Write strategicPosition as a planning
recommendation describing what needs to be in place — NOT as if the team is already fully staffed or
roles are already assigned. Use forward-looking language: "requires", "should", "needs to".

5. projectRoles (5 to 8 items)
   The project roles required to deliver this AI use case, ordered by responsibility hierarchy.
   ALWAYS list Project Manager first. Then: Business Analyst → AI Solution Architect → Data Engineer →
   AI Engineer → domain/test roles → platform roles.
   Each item: { "name": "<role title>", "primaryResponsibility": "<2–5 words>", "aiCapabilities": ["<cap1>", "<cap2>", "<cap3>"], "priority": "High|Medium|Low" }
   AI capabilities must be specific to that role's responsibilities. Project Manager MUST have High priority.
   REJECT an aiCapability that would fit any AI project role (e.g. "AI tools knowledge" alone is NOT
   acceptable) — name the specific technique from the selected initiative this role must understand or operate.

6. responsibilityJourney (7 to 9 items)
   The delivery accountability chain from business need through to business outcome.
   ALWAYS start with "Business Need" and end with "Business Outcome".
   Each item is a string. Reflect the delivery flow — not just a role list.
   Example: ["Business Need", "Project Manager", "Business Analyst", "AI Solution Architect", "Data Engineer", "AI Engineer", "Engineering Team", "Business Outcome"]

7. capabilityPriorities (3 to 4 items)
   Workforce development priorities — which roles need which AI capabilities and the delivery impact.
   Each item: { "priority": <1|2|3|4>, "role": "<role name>", "capability": "<specific AI capability, 2–4 words>", "businessOutcome": "<one sentence describing delivery impact>" }
   Always lead with Project Manager or AI Solution Architect as Priority 1.

8. workforceStats
   Object: { "requiredRoles": <total count of projectRoles>, "criticalRoles": <count of High-priority roles>, "aiCapabilities": <total count of all aiCapabilities summed>, "implementationPriority": "High|Medium|Low" }
   Note: the field is "implementationPriority" — not "developmentPriority".

9. arcpConsultantGuidance (string, 2–3 sentences)
   Lead with: strengthen existing project roles before introducing new specialist AI roles.
   Focus on augmenting experienced teams with targeted AI capabilities rather than building new AI organisations. Plain text.

10. arcpAIRecommendation (string, 2–3 sentences)
    PM-accessible executive tone. Name specific roles starting with Project Manager. Use planning language
    ("prioritise", "equip", "build capability"). Explain how these roles create the delivery foundation for
    the broader team. Avoid "immediately" — this is a plan, not a crisis response. Plain text.

   Add all to the brief object:
   "projectRoles": [...], "responsibilityJourney": [...], "capabilityPriorities": [...], "workforceStats": {...}, "arcpConsultantGuidance": "...", "arcpAIRecommendation": "..."`,
  },

  'AI Learning & Adoption': {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "AI Learning & Adoption" sections only:

JOURNEY RULE: This enablement plan is for the specific AI initiative named in the TRANSFORMATION
CONTEXT ("Selected AI Initiative"). Build on the project roles identified in AI Roles & Capability
Planning — do not introduce roles that weren't already named there.
Generate a practical, immediately actionable AI enablement plan — not a generic training list.

5. roleLearningJourney (4 to 7 items)
   Role-specific learning paths. ALWAYS start with Project Manager.
   Order: PM → BA → AI Solution Architect → Data Engineer → AI Engineer → Test/Platform roles.
   Each item: {
     "role": "<role name>",
     "learningPath": ["<topic 1>", "<topic 2>", "<topic 3>"],
     "businessOutcome": "<one sentence: what this enables the role to do in delivery>"
   }
   learningPath: 3 specific topics relevant to that role's AI responsibilities. Not generic.
   REJECT a topic that would apply to any AI project (e.g. "AI fundamentals" alone is NOT acceptable) —
   name the specific technique from the selected initiative this role needs to learn.

6. adoptionRoadmap (exactly 5 items, fixed order)
   Stages: Foundation, Role Training, Pilot Project, Daily AI Usage, Continuous Improvement
   Each item: {
     "stage": "Foundation|Role Training|Pilot Project|Daily AI Usage|Continuous Improvement",
     "goal": "<one action phrase, ≤8 words>",
     "expectedOutput": "<one concrete deliverable, ≤6 words>"
   }

7. enablementActions (exactly 3 items)
   Concrete implementation actions. Give the PM an implementation plan.
   Each item: {
     "action": "<verb-first phrase, 3–5 words>",
     "owner": "<specific role name>",
     "businessImpact": "High|Medium|Low",
     "timeline": "Sprint 1|Sprint 2|Sprint 3"
   }

8. enablementSummary
   Object: {
     "projectRoles": <count of roleLearningJourney items>,
     "learningPaths": <total count of all learningPath topics across all roles summed>,
     "aiTools": <count of distinct AI tools or tool categories referenced>,
     "adoptionActivities": <count of adoptionRoadmap stages plus enablementActions combined>
   }

9. learningResources (3 to 5 items)
   Specific learning topics or resources for this initiative. Order: High priority first.
   Each item: {
     "name": "<topic or resource name, 2–4 words>",
     "audience": "<specific role name or 'Everyone'>",
     "priority": "High|Medium|Low"
   }

10. alaConsultantGuidance (string, 2–3 sentences)
    Lead with practical enablement over classroom training. Focus on embedding AI into real project activities. Plain text.

11. alaAIRecommendation (string, 2–3 sentences)
    PM-centric planning tone. Name specific roles. Explain delivery impact. Plain text.

   Add all to the brief object:
   "roleLearningJourney": [...], "adoptionRoadmap": [...], "enablementActions": [...], "enablementSummary": {...}, "learningResources": [...], "alaConsultantGuidance": "...", "alaAIRecommendation": "..."`,
  },

};

// Legacy alias: existing blueprints stored with the old section title still match the template.
SECTION_TEMPLATES['AI Skills Assessment'] = SECTION_TEMPLATES['AI Roles & Capability Planning'];

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
          deliveryTeam:  Array.isArray(s.deliveryTeam) ? s.deliveryTeam.map(String).filter(Boolean) : String(s.deliveryTeam || '').trim(),
          kpis:          Array.isArray(s.kpis) ? s.kpis.map(String).filter(Boolean) : [],
        }))
        .slice(0, 3);

      const rawSolutionComponents = Array.isArray(b.solutionComponents) ? b.solutionComponents : [];
      const solutionComponents = rawSolutionComponents
        .filter(c => c && typeof c === 'object' && String(c.name || '').trim())
        .map(c => ({
          name:    String(c.name    || '').trim(),
          purpose: String(c.purpose || '').trim(),
        }))
        .slice(0, 3);

      const rawTeamGroups = Array.isArray(b.teamGroups) ? b.teamGroups : [];
      const teamGroups = rawTeamGroups
        .filter(g => g && typeof g === 'object' && String(g.group || '').trim())
        .map(g => ({
          group: String(g.group || '').trim(),
          roles: Array.isArray(g.roles) ? g.roles.map(String).filter(Boolean) : [],
        }))
        .slice(0, 5);

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

      const roiSummaryRaw = b.roiSummary && typeof b.roiSummary === 'object' ? b.roiSummary : null;
      const roiSummary = roiSummaryRaw ? {
        investment:     String(roiSummaryRaw.investment     || '').trim(),
        annualValue:    String(roiSummaryRaw.annualValue    || '').trim(),
        payback:        String(roiSummaryRaw.payback        || '').trim(),
        recommendation: String(roiSummaryRaw.recommendation || '').trim(),
      } : null;

      const costItems     = (Array.isArray(b.costItems)     ? b.costItems     : []).map(String).filter(Boolean).slice(0, 5);
      const valueItems    = (Array.isArray(b.valueItems)    ? b.valueItems    : []).map(String).filter(Boolean).slice(0, 5);
      const impactTimeline= (Array.isArray(b.impactTimeline)? b.impactTimeline: []).map(String).filter(Boolean).slice(0, 5);

      const transformationRows = (Array.isArray(b.transformationRows) ? b.transformationRows : [])
        .filter(r => r && typeof r === 'object' && (r.currentState || r.futureState))
        .map(r => ({ currentState: String(r.currentState || '').trim(), futureState: String(r.futureState || '').trim() }))
        .slice(0, 5);

      const impactAreas = (Array.isArray(b.impactAreas) ? b.impactAreas : [])
        .filter(a => a && typeof a === 'object' && String(a.name || '').trim())
        .map(a => ({ name: String(a.name || '').trim(), points: Array.isArray(a.points) ? a.points.map(String).filter(Boolean) : [] }))
        .slice(0, 5);

      const pmDashboard = (Array.isArray(b.pmDashboard) ? b.pmDashboard : [])
        .filter(c => c && typeof c === 'object' && String(c.area || '').trim())
        .map(c => ({
          area:             String(c.area             || '').trim(),
          question:         String(c.question         || '').trim(),
          currentChallenge: String(c.currentChallenge || '').trim(),
          aiImprovement:    String(c.aiImprovement    || '').trim(),
          expectedKpi:      String(c.expectedKpi      || '').trim(),
        }))
        .slice(0, 5);

      const improvementScorecard = (Array.isArray(b.improvementScorecard) ? b.improvementScorecard : [])
        .filter(r => r && typeof r === 'object' && String(r.area || '').trim())
        .map(r => ({
          area:            String(r.area            || '').trim(),
          beforeAI:        String(r.beforeAI        || '').trim(),
          afterAI:         String(r.afterAI         || '').trim(),
          businessBenefit: String(r.businessBenefit || '').trim(),
        }))
        .slice(0, 5);

      const valueJourney    = (Array.isArray(b.valueJourney)    ? b.valueJourney    : []).map(String).filter(Boolean).slice(0, 5);
      const valueDimensions = (Array.isArray(b.valueDimensions) ? b.valueDimensions : [])
        .filter(d => d && typeof d === 'object' && String(d.name || '').trim())
        .map(d => ({ name: String(d.name || '').trim(), points: Array.isArray(d.points) ? d.points.map(String).filter(Boolean) : [] }))
        .slice(0, 5);
      const customerKpis = (Array.isArray(b.customerKpis) ? b.customerKpis : [])
        .filter(k => k && typeof k === 'object' && String(k.label || '').trim())
        .map(k => ({ value: String(k.value || '').trim(), label: String(k.label || '').trim(), description: String(k.description || '').trim() }))
        .slice(0, 6);

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

      const recommendedInitiativeName = typeof b.recommendedInitiativeName === 'string'
        ? b.recommendedInitiativeName.trim() : '';

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

      const rawImplementationPhases = Array.isArray(b.implementationPhases) ? b.implementationPhases : [];
      const implementationPhases = rawImplementationPhases
        .filter(p => p && typeof p === 'object' && String(p.phase || '').trim())
        .map(p => ({
          phase:       String(p.phase || '').trim(),
          initiatives: Array.isArray(p.initiatives) ? p.initiatives.map(String).filter(Boolean) : [],
          rationale:   String(p.rationale || '').trim(),
        }))
        .slice(0, 4);

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
        ? b.aiOpportunities
            .map(o => (o && typeof o === 'object')
              ? { name: String(o.name || '').trim(), why: String(o.why || '').trim() }
              : { name: String(o || '').trim(), why: '' })
            .filter(o => o.name)
            .slice(0, 6)
        : [];

      const opportunityClassifications = Array.isArray(b.opportunityClassifications)
        ? b.opportunityClassifications
            .filter(o => o && typeof o === 'object' && String(o.opportunity || '').trim() && String(o.classification || '').trim())
            .map(o => ({
              opportunity:    String(o.opportunity    || '').trim(),
              classification: String(o.classification || '').trim(),
              rationale:      String(o.rationale       || '').trim(),
            }))
            .slice(0, 8)
        : [];

      const opportunityValues = Array.isArray(b.opportunityValues)
        ? b.opportunityValues
            .filter(o => o && typeof o === 'object' && String(o.opportunity || '').trim() && String(o.valueArea || '').trim())
            .map(o => ({
              opportunity: String(o.opportunity || '').trim(),
              valueArea:   String(o.valueArea   || '').trim(),
              focus:       String(o.focus       || '').trim(),
              outcomes:    Array.isArray(o.outcomes) ? o.outcomes.map(String).filter(Boolean).slice(0, 4) : [],
            }))
            .slice(0, 8)
        : [];

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
          name:             String(d.name             || '').trim(),
          purpose:          String(d.purpose          || '').trim(),
          typicalSource:    String(d.typicalSource    || '').trim(),
          priority:         String(d.priority         || 'MEDIUM').trim(),
          availability:     String(d.availability     || '').trim(),
          category:         String(d.category         || '').trim(),
          expectedAIOutput: String(d.expectedAIOutput || '').trim(),
        }))
        .slice(0, 6);

      const traceabilityChain = (Array.isArray(b.traceabilityChain) ? b.traceabilityChain : [])
        .map(String).filter(Boolean).slice(0, 6);

      const collectionOrder = (Array.isArray(b.collectionOrder) ? b.collectionOrder : [])
        .filter(r => r && typeof r === 'object' && (String(r.name || '').trim() || String(r.action || '').trim()))
        .map(r => ({
          name:   String(r.name   || '').trim(),
          action: String(r.action || '').trim(),
          reason: String(r.reason || '').trim(),
        }))
        .slice(0, 5);

      const consultantGuidance = String(b.consultantGuidance || '').trim();
      const aiRecommendation   = String(b.aiRecommendation   || '').trim();

      const implementationRoadmap = (Array.isArray(b.implementationRoadmap) ? b.implementationRoadmap : [])
        .filter(r => r && typeof r === 'object' && String(r.step || '').trim())
        .map(r => ({
          step:   String(r.step   || '').trim(),
          status: ['ready', 'pending'].includes(r.status) ? r.status : 'pending',
        }))
        .slice(0, 5);

      // Legacy parsers — kept for backward compatibility with old blueprints
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

      const rawPrepActivities = Array.isArray(b.prepActivities) ? b.prepActivities : [];
      const prepActivities = rawPrepActivities
        .filter(a => a && typeof a === 'object' && String(a.name || '').trim())
        .map(a => ({
          name:                String(a.name                || '').trim(),
          preparationActivity: String(a.preparationActivity || '').trim(),
          businessPurpose:     String(a.businessPurpose     || '').trim(),
          recommendedOwner:    String(a.recommendedOwner    || '').trim(),
          priority:            String(a.priority            || 'MEDIUM').trim(),
        }))
        .slice(0, 5);

      const rawPrepWorkPackages = Array.isArray(b.prepWorkPackages) ? b.prepWorkPackages : [];
      const prepWorkPackages = rawPrepWorkPackages
        .filter(w => w && typeof w === 'object' && String(w.name || '').trim())
        .map(w => ({
          name:             String(w.name             || '').trim(),
          workPackage:      (Array.isArray(w.workPackage) ? w.workPackage : []).map(String).filter(Boolean).slice(0, 3),
          whyAINeeds:       String(w.whyAINeeds       || '').trim(),
          recommendedOwner: String(w.recommendedOwner || '').trim(),
          deliverable:      String(w.deliverable      || '').trim(),
          priority:         String(w.priority         || 'MEDIUM').trim(),
        }))
        .slice(0, 5);

      const rawFirstSteps = Array.isArray(b.firstSteps) ? b.firstSteps : [];
      const firstSteps = rawFirstSteps
        .filter(s => s && typeof s === 'object' && String(s.action || '').trim())
        .map(s => ({
          action:         String(s.action         || '').trim(),
          why:            String(s.why            || '').trim(),
          owner:          String(s.owner          || '').trim(),
          expectedOutput: String(s.expectedOutput || '').trim(),
        }))
        .slice(0, 4);

      const rawPrepSummary = b.prepSummary && typeof b.prepSummary === 'object' ? b.prepSummary : {};
      const prepSummary = {
        preparationActivities:   parseInt(rawPrepSummary.preparationActivities,   10) || 0,
        engineeringRepositories:  parseInt(rawPrepSummary.engineeringRepositories,  10) || 0,
        recommendedOwners:        parseInt(rawPrepSummary.recommendedOwners,        10) || 0,
        implementationPriority:   String(rawPrepSummary.implementationPriority  || '').trim(),
        workPackages:             parseInt(rawPrepSummary.workPackages,             10) || 0,
        repositories:             parseInt(rawPrepSummary.repositories,             10) || 0,
        deliverables:             parseInt(rawPrepSummary.deliverables,             10) || 0,
        estimatedDuration:        String(rawPrepSummary.estimatedDuration       || '').trim(),
      };

      // ── Data Readiness: Data Architecture Enablement parsers ─────────────────

      const ARCH_LAYER_NAMES = ['Source Systems', 'Integration Layer', 'AI Data Store', 'AI Applications'];
      const rawArchLayers = Array.isArray(b.archLayers) ? b.archLayers : [];
      const archLayers = ARCH_LAYER_NAMES.map(layerName => {
        const found = rawArchLayers.find(l => l && String(l.name || '').trim() === layerName);
        return {
          name:        layerName,
          purpose:     String(found?.purpose     || '').trim(),
          recommended: (Array.isArray(found?.recommended) ? found.recommended : []).map(String).filter(Boolean).slice(0, 4),
          whyNeeded:   String(found?.whyNeeded   || '').trim(),
        };
      });

      const rawArchDecisions = Array.isArray(b.archDecisions) ? b.archDecisions : [];
      const archDecisions = rawArchDecisions
        .filter(d => d && typeof d === 'object' && (String(d.decisionArea || d.decision || '').trim()))
        .map(d => ({
          decisionArea:   String(d.decisionArea  || d.decision || '').trim(),
          recommendation: String(d.recommendation || d.benefit  || '').trim(),
          why:            String(d.why            || '').trim(),
          // keep legacy fields for old blueprints
          decision:       String(d.decision  || '').trim(),
          benefit:        String(d.benefit   || '').trim(),
          priority:       String(d.priority  || '').trim(),
        }))
        .slice(0, 4);

      const TECH_STACK_LAYERS = ['Source Systems', 'Integration', 'Storage', 'Processing', 'AI Models', 'Applications'];
      const rawTechStack = Array.isArray(b.techStack) ? b.techStack : [];
      const techStack = rawTechStack
        .filter(t => t && typeof t === 'object' && String(t.layer || '').trim())
        .map(t => ({
          layer:          String(t.layer          || '').trim(),
          recommendation: String(t.recommendation || '').trim(),
        }))
        .slice(0, 7);

      const rawArchSummary = b.archSummary && typeof b.archSummary === 'object' ? b.archSummary : {};
      const archSummary = {
        sourceSystems:     parseInt(rawArchSummary.sourceSystems,     10) || 0,
        integrationPoints: parseInt(rawArchSummary.integrationPoints, 10) || 0,
        aiStorage:         String(rawArchSummary.aiStorage     || '').trim(),
        aiConsumers:       String(rawArchSummary.aiConsumers   || '').trim(),
      };

      const archPattern           = (Array.isArray(b.archPattern) ? b.archPattern : []).map(String).filter(Boolean).slice(0, 6);
      const archConsultantGuidance = String(b.archConsultantGuidance || '').trim();

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

      // ── Technology Infrastructure: System Integration & Architecture new-format parsers ──

      const rawSiaSystems = Array.isArray(b.siaEngineeringSystems) ? b.siaEngineeringSystems : [];
      const siaEngineeringSystems = rawSiaSystems
        .filter(s => s && typeof s === 'object' && String(s.name || '').trim())
        .map(s => ({
          name:               String(s.name               || '').trim(),
          purpose:            String(s.purpose            || '').trim(),
          integrationPattern: String(s.integrationPattern || '').trim(),
          aiInteraction:      String(s.aiInteraction      || '').trim(),
          expectedOutcome:    String(s.expectedOutcome    || s.businessValue || '').trim(),
        }))
        .slice(0, 5);

      const siaWorkflowSteps = (Array.isArray(b.siaWorkflowSteps) ? b.siaWorkflowSteps : [])
        .map(s => String(s || '').trim()).filter(Boolean).slice(0, 6);

      const rawSiaPriorities = Array.isArray(b.siaIntegrationPriorities) ? b.siaIntegrationPriorities : [];
      const siaIntegrationPriorities = rawSiaPriorities
        .filter(p => p && typeof p === 'object' && String(p.name || '').trim())
        .map(p => ({
          order:           parseInt(p.order, 10) || 0,
          name:            String(p.name            || '').trim(),
          priority:        String(p.priority         || 'MEDIUM').trim().toUpperCase(),
          businessBenefit: String(p.businessBenefit  || '').trim(),
        }))
        .sort((a, b) => a.order - b.order)
        .slice(0, 5);

      const SIA_ARCH_LAYERS = ['Engineering Systems', 'Integration Layer', 'AI Services', 'Engineering Workflow', 'Business Decisions'];
      const rawSiaArch = Array.isArray(b.siaArchLayers) ? b.siaArchLayers : [];
      const siaArchLayers = SIA_ARCH_LAYERS.map((layerName, idx) => {
        const found = rawSiaArch.find(l => l && String(l.name || '').trim().toLowerCase() === layerName.toLowerCase())
                   || rawSiaArch[idx];
        return {
          name:         layerName,
          technologies: Array.isArray(found && found.technologies)
            ? found.technologies.map(t => String(t || '').trim()).filter(Boolean).slice(0, 4)
            : [],
        };
      });

      const SIA_IMPL_STEPS = [
        'Connect Engineering Systems', 'Standardize Data Exchange',
        'Embed AI into Existing Workflows', 'Enable Secure Monitoring', 'Scale Across Engineering Programs',
      ];
      const rawSiaImpl = Array.isArray(b.siaImplSequence) ? b.siaImplSequence : [];
      const siaImplSequence = SIA_IMPL_STEPS.map((step, i) => String(rawSiaImpl[i] || step).trim());

      const siaIntegrationPrinciples = (Array.isArray(b.siaIntegrationPrinciples) ? b.siaIntegrationPrinciples : [])
        .map(s => String(s || '').trim()).filter(Boolean).slice(0, 5);

      const siaConsultantGuidance = String(b.siaConsultantGuidance || '').trim();
      const siaAIRecommendation   = String(b.siaAIRecommendation   || '').trim();

      // ── Technology Infrastructure: AI Platform Readiness parsers ─────────────

      const APR_CAP_NAMES = [
        'AI Development Workspace', 'Prompt & Model Management', 'Knowledge Platform',
        'Deployment & Automation', 'Monitoring & Governance', 'Collaboration & Reuse',
      ];
      const rawPlatformCaps = Array.isArray(b.platformCapabilities) ? b.platformCapabilities : [];
      const platformCapabilities = APR_CAP_NAMES.map((capName, idx) => {
        const found = rawPlatformCaps.find(c => c && String(c.name || '').trim().toLowerCase() === capName.toLowerCase())
                   || rawPlatformCaps[idx];
        return {
          name:          capName,
          purpose:       String((found && found.purpose)      || '').trim(),
          capabilities:  Array.isArray(found && found.capabilities) ? found.capabilities.map(s => String(s || '').trim()).filter(Boolean).slice(0, 5) : [],
          businessValue: String((found && found.businessValue) || '').trim(),
        };
      });

      const APR_BLUEPRINT_LAYERS = [
        'Engineering Users', 'AI Applications', 'Prompt & Model Services',
        'Knowledge Platform', 'Deployment Services', 'Monitoring & Governance', 'Development Workspace',
      ];
      const rawBlueprintLayers = Array.isArray(b.platformBlueprintLayers) ? b.platformBlueprintLayers : [];
      const platformBlueprintLayers = APR_BLUEPRINT_LAYERS.map((layerName, idx) => {
        const found = rawBlueprintLayers.find(l => l && String(l.layer || '').trim().toLowerCase() === layerName.toLowerCase())
                   || rawBlueprintLayers[idx];
        return { layer: layerName, recommendation: String((found && found.recommendation) || '').trim() };
      });

      const rawPlatformRecs = Array.isArray(b.platformRecs) ? b.platformRecs : [];
      const platformRecs = rawPlatformRecs
        .filter(r => r && typeof r === 'object' && String(r.recommendation || '').trim())
        .map(r => ({
          recommendation:      String(r.recommendation      || '').trim(),
          why:                 String(r.why                 || '').trim(),
          priority:            String(r.priority            || 'MEDIUM').trim().toUpperCase(),
          implementationPhase: String(r.implementationPhase || 'Phase 1').trim(),
        }))
        .slice(0, 4);

      const APR_IMPL_STEPS = [
        'Establish Development Workspace', 'Build Knowledge Platform', 'Configure Prompt Management',
        'Deploy AI Services', 'Enable Monitoring', 'Scale Across Projects',
      ];
      const rawAprImplRoadmap = Array.isArray(b.aprImplRoadmap) ? b.aprImplRoadmap : [];
      const aprImplRoadmap = APR_IMPL_STEPS.map((step, i) => String(rawAprImplRoadmap[i] || step).trim());

      const APR_STACK_LAYERS = ['AI Development', 'Prompt Management', 'Knowledge', 'Deployment', 'Monitoring', 'Collaboration'];
      const rawAprStack = Array.isArray(b.aprStackLayers) ? b.aprStackLayers : [];
      const aprStackLayers = APR_STACK_LAYERS.map(layerName => {
        const found = rawAprStack.find(l => l && String(l.layer || '').trim() === layerName);
        return { layer: layerName, recommendation: String((found && found.recommendation) || '').trim() };
      });

      const aprConsultantGuidance = String(b.aprConsultantGuidance || '').trim();
      const aprAIRecommendation   = String(b.aprAIRecommendation   || '').trim();

      // kept for legacy blueprints
      const rawPlatformSummary = b.platformSummary && typeof b.platformSummary === 'object' ? b.platformSummary : {};
      const platformSummary = {
        development: String(rawPlatformSummary.development || '').trim(),
        knowledge:   String(rawPlatformSummary.knowledge   || '').trim(),
        deployment:  String(rawPlatformSummary.deployment  || '').trim(),
        monitoring:  String(rawPlatformSummary.monitoring  || '').trim(),
      };

      // ── Technology Infrastructure: AI Compute & Deployment Strategy parsers ──

      const rawDeploymentBlocks = Array.isArray(b.deploymentBlocks) ? b.deploymentBlocks : [];
      const deploymentBlocks = rawDeploymentBlocks
        .filter(d => d && typeof d === 'object' && String(d.blockType || '').trim())
        .map(d => ({
          blockType: String(d.blockType || '').trim(),
          name:      String(d.name      || '').trim(),
          why:       String(d.why       || '').trim(),
        }))
        .slice(0, 4);

      const CDS_FLOW_NODES = ['Engineering Repositories', 'Integration Layer', 'AI Data Store', 'LLM Inference', 'AI Application', 'Engineering Users'];
      const rawCdsFlow = Array.isArray(b.cdsDeploymentFlow) ? b.cdsDeploymentFlow : [];
      const cdsDeploymentFlow = CDS_FLOW_NODES.map((node, i) => String(rawCdsFlow[i] || node).trim());

      const rawTechRecs = Array.isArray(b.techRecommendations) ? b.techRecommendations : [];
      const techRecommendations = rawTechRecs
        .filter(r => r && typeof r === 'object' && String(r.layer || '').trim())
        .map(r => ({
          layer:             String(r.layer             || '').trim(),
          recommendation:    String(r.recommendation    || '').trim(),
          selectionRationale: String(r.selectionRationale || r.why || '').trim(),
        }))
        .slice(0, 5);

      const rawDeployDecisions = Array.isArray(b.deploymentDecisions) ? b.deploymentDecisions : [];
      const deploymentDecisions = rawDeployDecisions
        .filter(d => d && typeof d === 'object' && String(d.decisionType || '').trim())
        .map(d => ({
          decisionType: String(d.decisionType || '').trim(),
          choice:       String(d.choice       || '').trim(),
          reason:       String(d.reason       || '').trim(),
        }))
        .slice(0, 5);

      const CDS_IMPL_STEPS = ['Prepare AI Data', 'Provision Infrastructure', 'Deploy AI Platform', 'Deploy AI Assistant', 'Pilot with Engineering Team', 'Scale to Organisation'];
      const rawCdsImpl = Array.isArray(b.cdsImplSequence) ? b.cdsImplSequence : [];
      const cdsImplSequence = CDS_IMPL_STEPS.map((step, i) => String(rawCdsImpl[i] || step).trim());

      const rawInfraItems = Array.isArray(b.infraItems) ? b.infraItems : [];
      const infraItems = rawInfraItems
        .filter(i => i && typeof i === 'object' && String(i.item || '').trim())
        .map(i => ({
          item:           String(i.item           || '').trim(),
          recommendation: String(i.recommendation || '').trim(),
        }))
        .slice(0, 5);

      const rawCdsArchRationale = Array.isArray(b.cdsArchRationale) ? b.cdsArchRationale : [];
      const cdsArchRationale = rawCdsArchRationale
        .map(s => String(s || '').trim())
        .filter(Boolean)
        .slice(0, 5);

      const CDS_INVEST_AREAS = ['Cloud Infrastructure', 'AI Platform', 'Integration', 'Operations', 'Overall Complexity'];
      const rawCdsInvest = Array.isArray(b.cdsInvestmentEstimate) ? b.cdsInvestmentEstimate : [];
      const cdsInvestmentEstimate = CDS_INVEST_AREAS.map(area => {
        const found = rawCdsInvest.find(i => i && String(i.area || '').trim() === area);
        return { area, estimate: found ? String(found.estimate || 'Medium').trim() : 'Medium' };
      });

      const cdsConsultantGuidance   = String(b.cdsConsultantGuidance   || '').trim();
      const cdsAIRecommendation     = String(b.cdsAIRecommendation     || '').trim();
      const recommendedModelApproach = String(b.recommendedModelApproach || '').trim();
      const modelSelectionRationale  = String(b.modelSelectionRationale  || '').trim();

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

      // ── Skills & Workforce: AI Roles & Capability Planning parsers ──────────

      // New format (projectRoles)
      const rawProjectRoles = Array.isArray(b.projectRoles) ? b.projectRoles : [];
      const projectRoles = rawProjectRoles
        .filter(r => r && typeof r === 'object' && String(r.name || '').trim())
        .map(r => ({
          name:                  String(r.name                  || '').trim(),
          primaryResponsibility: String(r.primaryResponsibility || '').trim(),
          aiCapabilities:        Array.isArray(r.aiCapabilities)
            ? r.aiCapabilities.map(c => String(c || '').trim()).filter(Boolean)
            : [],
          priority:              String(r.priority || 'Medium').trim(),
        }))
        .slice(0, 7);

      const responsibilityJourney = Array.isArray(b.responsibilityJourney)
        ? b.responsibilityJourney.map(s => String(s || '').trim()).filter(Boolean).slice(0, 7)
        : [];

      const rawCapPriorities = Array.isArray(b.capabilityPriorities) ? b.capabilityPriorities : [];
      const capabilityPriorities = rawCapPriorities
        .filter(p => p && typeof p === 'object' && String(p.role || '').trim())
        .map(p => ({
          priority:   parseInt(p.priority, 10) || 1,
          role:       String(p.role       || '').trim(),
          capability: String(p.capability || '').trim(),
          businessOutcome: String(p.businessOutcome || p.why || '').trim(),
        }))
        .sort((a, c) => a.priority - c.priority)
        .slice(0, 4);

      const rawWorkforceStats = b.workforceStats && typeof b.workforceStats === 'object' ? b.workforceStats : {};
      const workforceStats = {
        requiredRoles:        parseInt(rawWorkforceStats.requiredRoles,        10) || 0,
        criticalRoles:        parseInt(rawWorkforceStats.criticalRoles,        10) || 0,
        aiCapabilities:       parseInt(rawWorkforceStats.aiCapabilities,       10) || 0,
        implementationPriority: String(rawWorkforceStats.implementationPriority || rawWorkforceStats.developmentPriority || '').trim(),
      };

      const arcpConsultantGuidance = String(b.arcpConsultantGuidance || '').trim();
      const arcpAIRecommendation   = String(b.arcpAIRecommendation   || '').trim();

      // Legacy fields (old format blueprints that haven't regenerated)
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

      // ── Skills & Workforce: AI Learning & Adoption new-format parsers ─────────

      const rawRoleLearningJourney = Array.isArray(b.roleLearningJourney) ? b.roleLearningJourney : [];
      const roleLearningJourney = rawRoleLearningJourney
        .filter(r => r && typeof r === 'object' && String(r.role || '').trim())
        .map(r => ({
          role:            String(r.role            || '').trim(),
          learningPath:    Array.isArray(r.learningPath) ? r.learningPath.map(String).filter(Boolean).slice(0, 4) : [],
          businessOutcome: String(r.businessOutcome || '').trim(),
        }))
        .slice(0, 7);

      const ALAN_ROADMAP_STAGES = ['Foundation', 'Role Training', 'Pilot Project', 'Daily AI Usage', 'Continuous Improvement'];
      const rawAdoptionRoadmap = Array.isArray(b.adoptionRoadmap) ? b.adoptionRoadmap : [];
      const adoptionRoadmap = ALAN_ROADMAP_STAGES.map(stageName => {
        const found = rawAdoptionRoadmap.find(st => st && String(st.stage || '').trim() === stageName);
        return {
          stage:          stageName,
          goal:           found ? String(found.goal           || '').trim() : '',
          expectedOutput: found ? String(found.expectedOutput || '').trim() : '',
        };
      });

      const rawEnablementActions = Array.isArray(b.enablementActions) ? b.enablementActions : [];
      const enablementActions = rawEnablementActions
        .filter(a => a && typeof a === 'object' && String(a.action || '').trim())
        .map(a => ({
          action:         String(a.action         || '').trim(),
          owner:          String(a.owner          || '').trim(),
          businessImpact: String(a.businessImpact || 'Medium').trim(),
          timeline:       String(a.timeline       || '').trim(),
        }))
        .slice(0, 3);

      const rawEnablementSummary = b.enablementSummary && typeof b.enablementSummary === 'object' ? b.enablementSummary : {};
      const enablementSummary = {
        projectRoles:        parseInt(rawEnablementSummary.projectRoles,        10) || 0,
        learningPaths:       parseInt(rawEnablementSummary.learningPaths,       10) || 0,
        aiTools:             parseInt(rawEnablementSummary.aiTools,             10) || 0,
        adoptionActivities:  parseInt(rawEnablementSummary.adoptionActivities,  10) || 0,
      };

      const rawLearningResources = Array.isArray(b.learningResources) ? b.learningResources : [];
      const learningResources = rawLearningResources
        .filter(r => r && typeof r === 'object' && String(r.name || '').trim())
        .map(r => ({
          name:     String(r.name     || '').trim(),
          audience: String(r.audience || '').trim(),
          priority: String(r.priority || 'Medium').trim(),
        }))
        .slice(0, 5);

      const alaConsultantGuidance = String(b.alaConsultantGuidance || '').trim();
      const alaAIRecommendation   = String(b.alaAIRecommendation   || '').trim();

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
          ...(solutionComponents.length   ? { solutionComponents }   : {}),
          ...(teamGroups.length           ? { teamGroups }           : {}),
          ...(teamRoles.length            ? { teamRoles }            : {}),
          ...(lifecycleStages.length      ? { lifecycleStages }      : {}),
          // AI ROI extras
          ...(roiSummary                  ? { roiSummary }           : {}),
          ...(costItems.length            ? { costItems }            : {}),
          ...(valueItems.length           ? { valueItems }           : {}),
          ...(impactTimeline.length       ? { impactTimeline }       : {}),
          ...(transformationRows.length   ? { transformationRows }   : {}),
          ...(improvementScorecard.length ? { improvementScorecard } : {}),
          ...(impactAreas.length          ? { impactAreas }          : {}),
          ...(pmDashboard.length          ? { pmDashboard }          : {}),
          ...(valueJourney.length         ? { valueJourney }         : {}),
          ...(valueDimensions.length      ? { valueDimensions }      : {}),
          ...(customerKpis.length         ? { customerKpis }         : {}),
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
          ...(opportunityValues.length              ? { opportunityValues }        : {}),
          ...(kpiPills.length                      ? { kpiPills }                 : {}),
          ...(businessValueInsight                 ? { businessValueInsight }     : {}),
          ...(recommendedStartingPoint             ? { recommendedStartingPoint } : {}),
          ...(recommendedInitiativeName             ? { recommendedInitiativeName } : {}),
          ...(priorityQuadrants.length             ? { priorityQuadrants }        : {}),
          ...(dimensionCards.length                ? { dimensionCards }            : {}),
          ...(implementationPhases.length          ? { implementationPhases }      : {}),
          ...(primaryClassification                ? { primaryClassification }   : {}),
          ...(secondaryClassification              ? { secondaryClassification } : {}),
          ...(transformationImplication                ? { transformationImplication }   : {}),
          ...(businessProblems.length     ? { businessProblems }     : {}),
          ...(workflowSteps.length        ? { workflowSteps }        : {}),
          ...(highEffortActivities.length ? { highEffortActivities } : {}),
          ...(aiOpportunities.length      ? { aiOpportunities }      : {}),
          ...(opportunityClassifications.length ? { opportunityClassifications } : {}),
          ...(Array.isArray(b.spokeNodes) && b.spokeNodes.length
              ? { spokeNodes: b.spokeNodes.map(String).filter(Boolean).slice(0, 6) }
              : {}),
          // Data Readiness: Critical Data Identification extras
          ...(datasets.length                          ? { datasets }              : {}),
          ...(traceabilityChain.length                 ? { traceabilityChain }     : {}),
          ...(collectionOrder.length                   ? { collectionOrder }       : {}),
          ...(implementationRoadmap.length             ? { implementationRoadmap } : {}),
          ...(consultantGuidance                       ? { consultantGuidance }    : {}),
          ...(aiRecommendation                         ? { aiRecommendation }      : {}),
          // Legacy CDI fields — kept for backward compat
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
          ...(prepActivities.length       ? { prepActivities }       : {}),
          ...(prepWorkPackages.length     ? { prepWorkPackages }     : {}),
          ...(firstSteps.length           ? { firstSteps }           : {}),
          ...(prepSummary.workPackages || prepSummary.preparationActivities ? { prepSummary } : {}),
          // Data Readiness: Data Architecture Enablement extras
          ...(projectSystems.length          ? { projectSystems }       : {}),
          ...(archRecommendations.length     ? { archRecommendations }  : {}),
          ...(archStats.architectureReadiness? { archStats }            : {}),
          ...(healthTimeline.length          ? { healthTimeline }       : {}),
          // Data Readiness: Data Architecture Enablement extras
          ...(archLayers.some(l => l.recommended.length) ? { archLayers }             : {}),
          ...(archDecisions.length                        ? { archDecisions }          : {}),
          ...(techStack.length                            ? { techStack }              : {}),
          ...(archSummary.sourceSystems                   ? { archSummary }            : {}),
          ...(archPattern.length                          ? { archPattern }            : {}),
          ...(archConsultantGuidance                      ? { archConsultantGuidance } : {}),
          // Technology Infrastructure: System Integration & Architecture extras
          ...(integrationReadiness             ? { integrationReadiness } : {}),
          ...(connectedSystems.length          ? { connectedSystems }     : {}),
          ...((integrationSummary.integration || integrationSummary.reliability)
              ? { integrationSummary } : {}),
          // Technology Infrastructure: System Integration & Architecture new-format extras
          ...(siaEngineeringSystems.length               ? { siaEngineeringSystems }    : {}),
          ...(siaWorkflowSteps.length                    ? { siaWorkflowSteps }         : {}),
          ...(siaIntegrationPriorities.length            ? { siaIntegrationPriorities } : {}),
          ...(siaArchLayers.some(l => l.technologies.length) ? { siaArchLayers }        : {}),
          ...(siaImplSequence.length                     ? { siaImplSequence }          : {}),
          ...(siaConsultantGuidance                      ? { siaConsultantGuidance }       : {}),
          ...(siaAIRecommendation                        ? { siaAIRecommendation }         : {}),
          ...(siaIntegrationPrinciples.length            ? { siaIntegrationPrinciples }    : {}),
          // Technology Infrastructure: AI Platform Readiness extras
          ...(platformCapabilities.some(c => c.purpose)           ? { platformCapabilities }    : {}),
          ...(platformBlueprintLayers.some(l => l.recommendation) ? { platformBlueprintLayers } : {}),
          ...(platformRecs.length                                  ? { platformRecs }            : {}),
          ...(aprImplRoadmap.length                                ? { aprImplRoadmap }          : {}),
          ...(aprStackLayers.some(l => l.recommendation)          ? { aprStackLayers }          : {}),
          ...(aprConsultantGuidance                                ? { aprConsultantGuidance }   : {}),
          ...(aprAIRecommendation                                  ? { aprAIRecommendation }     : {}),
          // Technology Infrastructure: AI Compute & Deployment Strategy extras
          ...(deploymentBlocks.length         ? { deploymentBlocks }         : {}),
          ...(cdsDeploymentFlow.length        ? { cdsDeploymentFlow }        : {}),
          ...(techRecommendations.length      ? { techRecommendations }      : {}),
          ...(cdsArchRationale.length         ? { cdsArchRationale }         : {}),
          ...(deploymentDecisions.length      ? { deploymentDecisions }      : {}),
          ...(cdsImplSequence.length          ? { cdsImplSequence }          : {}),
          ...(infraItems.length               ? { infraItems }               : {}),
          ...(cdsInvestmentEstimate.length    ? { cdsInvestmentEstimate }    : {}),
          ...(cdsConsultantGuidance           ? { cdsConsultantGuidance }    : {}),
          ...(cdsAIRecommendation             ? { cdsAIRecommendation }      : {}),
          ...(recommendedModelApproach        ? { recommendedModelApproach } : {}),
          ...(modelSelectionRationale         ? { modelSelectionRationale }  : {}),
          // Skills & Workforce: AI Roles & Capability Planning extras (new format)
          ...(projectRoles.length                                        ? { projectRoles }             : {}),
          ...(responsibilityJourney.length                               ? { responsibilityJourney }   : {}),
          ...(capabilityPriorities.length                                ? { capabilityPriorities }    : {}),
          ...((workforceStats.requiredRoles || workforceStats.aiCapabilities) ? { workforceStats }    : {}),
          ...(arcpConsultantGuidance                                     ? { arcpConsultantGuidance }  : {}),
          ...(arcpAIRecommendation                                       ? { arcpAIRecommendation }    : {}),
          // Legacy fields (kept for existing blueprints that haven't regenerated)
          ...(skillsReadiness                              ? { skillsReadiness }              : {}),
          ...(requiredSkills.length                        ? { requiredSkills }               : {}),
          ...(skillsMatrix.some(m => m.readiness)          ? { skillsMatrix }                : {}),
          ...(skillsRecommendations.length                 ? { skillsRecommendations }        : {}),
          ...((skillsStats.available || skillsStats.gaps)  ? { skillsStats }                 : {}),
          ...(skillsCategorySummary.some(c => c.status)    ? { skillsCategorySummary }       : {}),
          // Skills & Workforce: AI Learning & Adoption new-format extras
          ...(roleLearningJourney.length                              ? { roleLearningJourney }   : {}),
          ...(adoptionRoadmap.some(st => st.goal)                    ? { adoptionRoadmap }        : {}),
          ...(enablementActions.length                               ? { enablementActions }      : {}),
          ...(enablementSummary.projectRoles                         ? { enablementSummary }      : {}),
          ...(learningResources.length                               ? { learningResources }      : {}),
          ...(alaConsultantGuidance                                  ? { alaConsultantGuidance }  : {}),
          ...(alaAIRecommendation                                    ? { alaAIRecommendation }    : {}),
          // Skills & Workforce: AI Learning & Adoption legacy extras (kept for existing blueprints)
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
    generate({ systemPrompt, userMessage, maxTokens: 4000, label: 'cob:section' }),
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
    const tpl    = BLUEPRINT_CONFIG.generate.ctoExtras ? SECTION_TEMPLATES[s.title] : null;
    const extras = tpl ? extractExtraFields(tpl.promptInstruction) : [];

    const coreLines = [];
    if (!NO_STRATEGIC_POSITION_CAPABILITIES.has(s.title)) {
      coreLines.push('"strategicPosition": "<1-2 sentence future-state definition>"');
    }
    if (!AI_USE_CASES_CAPABILITIES.has(s.title)) {
      coreLines.push('"priorityActions": ["<action 1>", "<action 2>", "<action 3>"]');
      coreLines.push('"successMetrics": ["<KPI 1>", "<KPI 2>"]');
      coreLines.push('"leadershipValidation": {\n          "status": "Not Yet Validated",\n          "context": "<one sentence on what alignment or approval is needed>"\n        }');
    }
    extras.forEach(({ name, placeholder }) => coreLines.push(`"${name}": ${placeholder}`));

    const body = coreLines.map(line => `        ${line}`).join(',\n');
    return `    {
      "title": "${s.title}",
      "brief": {
${body}
      }
    }`;
  }).join(',\n');
  return `OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
${examples}
  ],
  "actionItems": [
    { "title": "<specific, action-oriented next step — one sentence>", "description": "<what completing it actually involves — one sentence>", "assignee": "<suggested owner role, e.g. Product Owner>", "reviewer": "<suggested sign-off role, e.g. Technical Architect — empty string if no review is naturally implied>" }
  ]
}
Generate 2-4 actionItems for this capability as a whole (not per section) — concrete things a real project team would need to do, review, or agree on to act on this capability's content. Infer assignee/reviewer roles from what each action actually is, not a generic default.`;
}

// ── Pipeline A: Brief (direct) ────────────────────────────────────────────────
// Active when BLUEPRINT_CONFIG.generate.essay = false.
// Generates section.brief in a single LLM call per capability.
// CTO extras (strategicPillars etc.) are injected into this call when enabled.

function buildBriefPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null, transformationCtx = null, engagement = null }) {
  const sectionList   = parsedSections.map((s, i) => {
    let entry = `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`;
    if (s.consultantGuide) entry += `\n\n   CONSULTANT METHODOLOGY:\n${s.consultantGuide}`;
    return entry;
  }).join('\n\n');
  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  // Guidance first: the dataset spec inside the templates refers back to it as
  // "the DATA SOURCE GUIDANCE above". Empty string when engagement is
  // undecided, which leaves the prompt exactly as it was.
  const templateInstructions = datasetSourceGuidance(engagement) + (BLUEPRINT_CONFIG.generate.ctoExtras
    ? parsedSections
        .filter(s => SECTION_TEMPLATES[s.title])
        .map(s => SECTION_TEMPLATES[s.title].promptInstruction)
        .join('\n')
    : '');

  const skipStrategicPosition = NO_STRATEGIC_POSITION_CAPABILITIES.has(capabilityName);
  // These 4 capabilities render exclusively through their own SECTION_TEMPLATES extras —
  // priorityActions/successMetrics/leadershipValidation are never displayed for them, so
  // skip generating them entirely (saves tokens/time, keeps the model's attention on the
  // fields that actually appear in the output).
  const skipUnusedCoreFields = AI_USE_CASES_CAPABILITIES.has(capabilityName);
  const coreFields = [
    !skipStrategicPosition && `strategicPosition (1–2 sentences MAXIMUM)
   Define the IDEAL FUTURE-STATE for THIS SECTION SPECIFICALLY — what success looks like once THIS
   section's own Definition and Key Principles (given above for each section) are fully realised.
   Must be outcome-oriented and concrete, and must describe the one thing that is true of this section
   once it succeeds — not a future-state statement that could be copy-pasted onto a sibling section in
   the same capability with only the noun changed. Do NOT describe current problems or gaps.
   REJECT a statement generic enough to fit any capability (e.g. "The organization successfully adopts
   AI to improve outcomes" is NOT acceptable) — name the specific thing that becomes true only for THIS
   section (e.g. for a data-privacy section, what becomes true about how data is protected; for a model-
   validation section, what becomes true about model reliability; for a roles-planning section, what
   becomes true about who owns what).`,
    !skipUnusedCoreFields && `priorityActions (3 to 5 items)
   Executable actions for the next 90 days only.
   Must use strong verbs: Define, Deploy, Integrate, Implement, Establish, Launch, Assign.
   Must directly impact delivery or capability execution.
   Do NOT use: improve, enhance, explore, consider, leverage.`,
    !skipUnusedCoreFields && `successMetrics (2 to 4 items)
   Measurable KPIs only. Must be quantifiable (%, time, cost, adoption rate, defect rate).
   Must clearly state direction: increase / decrease / target value.
   Must reflect real execution outcomes.
   Do NOT use vague metrics like "improve quality" or "increase efficiency."`,
    !skipUnusedCoreFields && `leadershipValidation
   An object with two fields:
   - status: always set to "Not Yet Validated" for AI-generated blueprints
   - context: one sentence describing what executive alignment or approval is needed
     (e.g. "Requires CTO sign-off on AI investment allocation for ${industry} program")`,
  ].filter(Boolean);
  const coreFieldsBlock = coreFields.map((f, i) => `${i + 1}. ${f}`).join('\n\n');

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
${coreFields.length ? `
Each section must have ${coreFields.length} required fields:

${coreFieldsBlock}
` : ''}${skipStrategicPosition ? '\nDo NOT include a strategicPosition field — this capability builds directly on the future-state already established by AI Opportunity Discovery earlier in the journey; repeating it here is redundant.\n' : ''}${skipUnusedCoreFields ? '\nDo NOT include priorityActions, successMetrics, or leadershipValidation fields — generate ONLY the fields listed below.\n' : ''}${templateInstructions}
${skipUnusedCoreFields ? `
WRITING STYLE — this capability is read by product/delivery leads who do not have time to read every word:
- Lead with the conclusion, then (only if needed) the one fact that supports it — pyramid principle, not a build-up.
- Prefer concrete named things (systems, metrics, techniques) over abstract nouns (capabilities, initiatives, solutions).
- Cut hedging language: may, could, potentially, aims to, seeks to, in order to, would.
- Every field in this capability must say something the OTHER capabilities in this AI Use Cases journey have not already said — check the PREVIOUS CAPABILITY INSIGHTS context before writing, and do not restate a prior capability's rationale in different words.
` : ''}
HARD RULES:
- Do NOT include a Key Risk section
- Do NOT write essays or paragraphs
- Do NOT describe problems or gaps
- Do NOT exceed bullet limits
- Do NOT add, rename, or remove sections — generate ONLY the ${parsedSections.length} sections listed
- Every output must be scannable in under 30 seconds

${buildOutputFormat(parsedSections)}`;

  const ctxBlock      = transformationCtx ? formatTransformationContext(transformationCtx) : '';
  const insightsBlock = journeyContext
    ? `\n\n==============================\nPREVIOUS CAPABILITY INSIGHTS\n==============================\n${journeyContext}`
    : '';
  const journeyBlock  = (ctxBlock || insightsBlock)
    ? `${ctxBlock}${insightsBlock}\n\nBuild directly on the initiative and context established above. Do not invent a different AI opportunity or initiative.\n\n`
    : '';

  const userMessage = `${enterpriseContext ? `${enterpriseContext}\n\n` : ''}${journeyBlock}CAPABILITY SECTIONS TO GENERATE (${parsedSections.length} sections):

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
BUSINESS OBJECTIVE: ${businessObjective}

Generate the Strategy Brief JSON for all ${parsedSections.length} sections: ${sectionTitles}.`;

  return { systemPrompt, userMessage };
}

// ── AI Opportunity Discovery — staged reasoning pipeline ──────────────────────
// The key-differentiator capability, per this session's design discussion:
// today every other capability is one LLM call reading all context at once.
// This one is 2 calls with an explicit reasoning boundary between them —
// Stage 1 identifies industry problems WITHOUT looking at company data yet
// (matching the intended reasoning order: industry context before company
// context); Stage 2 grounds the actual opportunities in the company's own
// approved capability map (CompanyResearchLibrary.capabilityMap — see
// companyResearchLibraryService.js) instead of re-inferring the connection
// between "industry problem" and "company product" from prose every time.
//
// Output shape is identical to the single-call path — businessProblems/
// workflowSteps/highEffortActivities/aiOpportunities — so this is purely an
// internal generation-mechanism change. Nothing downstream (parseBriefOutput,
// journeyContext extraction, frontend rendering) needs to know which path ran.
async function runOpportunityDiscoveryStaged({ cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext }) {
  const section = parsedSections[0]; // self-titled capability — exactly one section

  // ── Stage 1: extract intent + identify industry problems (industry context only) ──
  const stage1System = `You are an AI transformation strategist analysing a business objective. Your job right now is ONLY to understand the objective and the industry it sits in — do not consider any specific company's products yet, that happens in a later step.

TASK:
1. "intent": 1-2 sentences stating what this objective is really asking for, in plain language.
2. "businessProblems" (4 to 6 items): specific business/engineering challenges in this industry that create the opportunity for AI. Each item 3-6 words, specific to the industry context given below — not generic ("Manual Defect Analysis", not "Inefficiency"). Ground these in the industry context provided; do not invent problems unrelated to it.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences:
{ "intent": "...", "businessProblems": ["...", ...] }`;

  const stage1User = `BUSINESS OBJECTIVE: ${businessObjective}
INDUSTRY: ${industry}
${automotiveBlueprint ? `\nINDUSTRY CONTEXT:\n${automotiveBlueprint}\n` : ''}${section.definition ? `\nFRAMEWORK CONTEXT:\n${section.definition}\n` : ''}
Extract the intent and identify the industry problems.`;

  const stage1 = await callLLM(stage1System, stage1User, 90_000, `${cap.name} (Stage 1 — industry problems)`);
  const intent = String(stage1?.intent || '').trim();
  const businessProblemsFromStage1 = Array.isArray(stage1?.businessProblems)
    ? stage1.businessProblems.map(String).filter(Boolean).slice(0, 6)
    : [];

  // ── Fast lookup, not an LLM call: the company's admin-approved capability map ──
  const capabilityMap = companyProfile.orgName
    ? await getApprovedCapabilityMap(normalizeCompanyName(companyProfile.orgName)).catch(() => [])
    : [];

  // ── Stage 2: generate opportunities grounded in company capabilities, validated against project context ──
  const capabilityMapBlock = capabilityMap.length
    ? `\nCOMPANY CAPABILITY MAP (admin-approved — ground opportunities in these actual products where relevant):\n${capabilityMap.map(m => `- ${m.industryChallenge} -> ${m.companyCapability}${m.mechanism ? ` (${m.mechanism})` : ''}`).join('\n')}\n`
    : '';

  const stage2System = `You are an AI transformation strategist. Given the industry problems already identified, generate the specific AI opportunities that address them — grounded in this company's actual products where a mapping is provided, and consistent with any project constraints given below.

${SECTION_TEMPLATES['AI Opportunity Discovery'].promptInstruction}

ADDITIONAL RULES FOR THIS STAGE:
- The industry problems (businessProblems) were already identified in a prior step and are given to you below — do NOT regenerate or restate them.
- When a COMPANY CAPABILITY MAP is provided below, prefer AI opportunities that strengthen one of the company's existing mapped capabilities, and name that capability explicitly in "why" (e.g. "This strengthens the Odin retrofit platform's fleet coordination by..."). If a project-context block below states a constraint (data handling, security, existing systems, architecture), the opportunities must respect it — do not propose something incompatible with a stated constraint.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation, and NO fields other than these four:
{
  "workflowSteps": ["<step 1>", "<step 2>", "..."],
  "highEffortActivities": ["<activity 1>", "<activity 2>", "..."],
  "aiOpportunities": [{ "name": "<AI technique>", "why": "<1-2 sentences>" }, ...],
  "actionItems": [
    { "title": "<specific, action-oriented next step — one sentence>", "description": "<what completing it actually involves — one sentence>", "assignee": "<suggested owner role>", "reviewer": "<suggested sign-off role — empty string if no review is naturally implied>" }
  ]
}
Generate 2-4 actionItems — concrete things a real project team would need to do, review, or agree on to act on these opportunities (e.g. "Review top 2 opportunities and align on Q1 priority" reviewed by Product Owner/Technical Architect). Infer assignee/reviewer roles from what each action actually is.`;

  const stage2User = `BUSINESS OBJECTIVE: ${businessObjective}
INTENT: ${intent}
INDUSTRY PROBLEMS IDENTIFIED: ${businessProblemsFromStage1.join(', ')}
${capabilityMapBlock}${enterpriseContext ? `\n${enterpriseContext}\n` : ''}
Generate workflowSteps, highEffortActivities, and aiOpportunities as specified.`;

  const stage2 = await callLLM(stage2System, stage2User, 120_000, `${cap.name} (Stage 2 — opportunities)`);

  const brief = {
    businessProblems:     businessProblemsFromStage1,
    workflowSteps:        stage2?.workflowSteps,
    highEffortActivities: stage2?.highEffortActivities,
    aiOpportunities:      stage2?.aiOpportunities,
  };

  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));
  return {
    sections:    parseBriefOutput([{ title: section.title, brief }], validTitles),
    actionItems: normalizeActionItems(stage2?.actionItems),
  };
}

export async function runBriefGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null, transformationCtx = null) {
  if (cap.name === 'AI Opportunity Discovery' && BLUEPRINT_CONFIG.generate.ctoExtras) {
    return runOpportunityDiscoveryStaged({ cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext });
  }

  const { systemPrompt, userMessage } = buildBriefPrompt({
    engagement: companyProfile.engagement,
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
    transformationCtx:   transformationCtx || null,
  });

  const timeoutMs = Math.max(120_000, parsedSections.length * 60_000);
  const parsed    = await callLLM(systemPrompt, userMessage, timeoutMs, cap.name);
  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));
  return {
    sections:    parseBriefOutput(parsed?.sections || [], validTitles),
    actionItems: normalizeActionItems(parsed?.actionItems),
  };
}

// Shared by both generation paths (standard brief + AI Opportunity Discovery's
// staged Stage 2) — validates the model's actionItems array into a clean,
// consistent shape regardless of which call produced it.
function normalizeActionItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(i => i && typeof i === 'object' && String(i.title || '').trim())
    .map(i => ({
      title:       String(i.title       || '').trim(),
      description: String(i.description || '').trim(),
      assignee:    String(i.assignee    || '').trim(),
      reviewer:    String(i.reviewer    || '').trim(),
    }));
}

// ── Pipeline B: Essay → Brief (cascade) ──────────────────────────────────────
// Active when BLUEPRINT_CONFIG.generate.essay = true.
// Step 1 generates long-form prose (section.content).
// Step 2 extracts the structured brief from that prose.
// CTO extras are injected into Step 2 when enabled.

function buildEssayPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null, transformationCtx = null, engagement = null }) {
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

  const ctxBlock      = transformationCtx ? formatTransformationContext(transformationCtx) : '';
  const insightsBlock = journeyContext
    ? `\n\n==============================\nPREVIOUS CAPABILITY INSIGHTS\n==============================\n${journeyContext}`
    : '';
  const journeyBlock  = (ctxBlock || insightsBlock)
    ? `${ctxBlock}${insightsBlock}\n\nBuild directly on the initiative and context established above. Do not invent a different AI opportunity or initiative.\n\n`
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

  // Same ordering rule as the brief pipeline — see buildBriefPrompt.
  const templateInstructions = datasetSourceGuidance(engagement) + (BLUEPRINT_CONFIG.generate.ctoExtras
    ? parsedSections
        .filter(s => SECTION_TEMPLATES[s.title])
        .map(s => SECTION_TEMPLATES[s.title].promptInstruction)
        .join('\n')
    : '');

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

async function runEssayGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint, enterpriseContext, journeyContext = null, transformationCtx = null) {
  const { systemPrompt, userMessage } = buildEssayPrompt({
    engagement: companyProfile.engagement,
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
    transformationCtx:   transformationCtx || null,
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

  // Fetch Enterprise Blueprint + Connected Knowledge grounding context (P0 — silent no-op if none exists)
  const enterpriseContext = companyProfile.orgName
    ? await getCapabilityEnterpriseContext(companyProfile.orgName, cap.id).catch(() => null)
    : null;
  const connectedKnowledgeContext = companyProfile.orgName
    ? await getConnectedKnowledgeContext(companyProfile.orgName, { capabilityId: cap.id, capabilityName: cap.name, businessObjective }).catch(() => null)
    : null;
  const verticalContext = companyProfile.subVertical
    ? await getVerticalContextForCapability(industry, companyProfile.subVertical, cap.id).catch(() => null)
    : null;
  const combinedContext = combineContexts(enterpriseContext, verticalContext, connectedKnowledgeContext);

  if (enterpriseContext) {
    console.log(`[blueprintGen] Enterprise Blueprint context injected for: ${cap.name}`);
  }
  if (connectedKnowledgeContext) {
    console.log(`[blueprintGen] Connected Knowledge context injected for: ${cap.name}`);
  }

  if (BLUEPRINT_CONFIG.generate.essay) {
    // Essay pipeline: long-form prose first, brief extracted from it
    console.log(`[blueprintGen] Essay pipeline active for: ${cap.name}`);
    const essays = await runEssayGeneration(cap, companyProfile, businessObjective, industry, parsedSections, blueprint.automotiveBlueprint, combinedContext);
    return await runBriefExtraction(cap, parsedSections, essays);
  }

  // Brief pipeline (default): direct structured generation.
  // Legacy CompanyBlueprint path — no Action Tracker here, so actionItems
  // from the merged call are intentionally discarded, not saved.
  const { sections } = await runBriefGeneration(cap, companyProfile, businessObjective, industry, parsedSections, blueprint.automotiveBlueprint, combinedContext);
  return sections;
}

// ── Single-section extras regeneration ───────────────────────────────────────
// Regenerates CTO-view visual fields (strategicPillars, kpiHighlights, etc.)
// for specific sections within one capability, using their current
// strategicPosition as the strategic anchor. Does NOT rewrite strategicPosition.

export async function regenerateSectionExtras(blueprintId, capabilityId, sectionTitles, userId) {
  const companyProfile = await loadCompanyProfile(userId, blueprintId);
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
      'matrixQuadrants', 'quarterlyPlan', 'solutionPortfolio', 'solutionComponents', 'teamGroups', 'teamRoles',
      'lifecycleStages', 'roiSummary', 'costItems', 'valueItems', 'impactTimeline',
      'transformationRows', 'improvementScorecard', 'impactAreas', 'pmDashboard',
      'valueJourney', 'valueDimensions', 'customerKpis',
      'waterfallItems', 'sdlcStages', 'flywheelStages',
      'securityPillars', 'ethicsPillars', 'modelLifecycleStages', 'complianceControls',
      'adoptionStages',
      // AI Use Cases extras
      'valueCategories', 'opportunityValues', 'kpiPills', 'businessValueInsight',
      'recommendedStartingPoint', 'recommendedInitiativeName', 'priorityQuadrants', 'dimensionCards', 'implementationPhases',
      'primaryClassification', 'secondaryClassification', 'transformationImplication',
      'businessProblems', 'workflowSteps', 'highEffortActivities', 'aiOpportunities', 'opportunityClassifications',
      // Data Readiness: CDI extras
      'datasets', 'traceabilityChain', 'collectionOrder', 'implementationRoadmap',
      'recommendations', 'coverageSummary', 'relationshipMap',
      'consultantGuidance', 'aiRecommendation',
    ];
    for (const key of extraKeys) {
      if (b[key] !== undefined) {
        setFields[`capabilities.$[cap].sections.$[sec].brief.${key}`] = b[key];
      }
    }

    await CompanyBlueprint.updateOne(
      { _id: blueprintId, userId, 'capabilities.capabilityId': capabilityId },
      { $set: setFields },
      { strict: false, arrayFilters: [{ 'cap.capabilityId': capabilityId }, { 'sec.title': ns.title }] }
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
  const companyProfile = await loadCompanyProfile(userId, blueprintId);
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
      'matrixQuadrants', 'quarterlyPlan', 'solutionPortfolio', 'solutionComponents', 'teamGroups', 'teamRoles',
      'lifecycleStages', 'roiSummary', 'costItems', 'valueItems', 'impactTimeline',
      'transformationRows', 'improvementScorecard', 'impactAreas', 'pmDashboard',
      'valueJourney', 'valueDimensions', 'customerKpis',
      'waterfallItems', 'sdlcStages', 'flywheelStages',
      'securityPillars', 'ethicsPillars', 'modelLifecycleStages', 'complianceControls',
      'adoptionStages',
      // AI Use Cases extras
      'valueCategories', 'opportunityValues', 'kpiPills', 'businessValueInsight',
      'recommendedStartingPoint', 'recommendedInitiativeName', 'priorityQuadrants', 'dimensionCards', 'implementationPhases',
      'primaryClassification', 'secondaryClassification', 'transformationImplication',
      'businessProblems', 'workflowSteps', 'highEffortActivities', 'aiOpportunities', 'opportunityClassifications',
      // Data Readiness extras
      'datasets', 'traceabilityChain', 'collectionOrder', 'implementationRoadmap',
      'recommendations', 'coverageSummary', 'relationshipMap',
      'consultantGuidance', 'aiRecommendation',
      'inputDatasets', 'pipelineStages', 'prepRecommendations', 'dataStats', 'readinessSummary',
      'prepActivities', 'prepWorkPackages', 'firstSteps', 'prepSummary',
      'projectSystems', 'archRecommendations', 'archStats', 'healthTimeline',
      'archLayers', 'archDecisions', 'techStack', 'archSummary', 'archPattern', 'archConsultantGuidance',
      // Technology Infrastructure extras
      'integrationReadiness', 'connectedSystems', 'integrationSummary',
      'siaEngineeringSystems', 'siaWorkflowSteps', 'siaIntegrationPriorities',
      'siaArchLayers', 'siaImplSequence', 'siaIntegrationPrinciples', 'siaConsultantGuidance', 'siaAIRecommendation',
      'platformCapabilities', 'platformBlueprintLayers', 'platformRecs', 'aprImplRoadmap',
      'aprStackLayers', 'aprConsultantGuidance', 'aprAIRecommendation',
      'deploymentBlocks', 'cdsDeploymentFlow', 'techRecommendations', 'cdsArchRationale',
      'deploymentDecisions', 'cdsImplSequence', 'infraItems', 'cdsInvestmentEstimate',
      'cdsConsultantGuidance', 'cdsAIRecommendation',
      'recommendedModelApproach', 'modelSelectionRationale',
      // Skills & Workforce extras
      'projectRoles', 'responsibilityJourney', 'capabilityPriorities', 'workforceStats', 'arcpConsultantGuidance', 'arcpAIRecommendation',
      'skillsReadiness', 'requiredSkills', 'skillsMatrix', 'skillsRecommendations', 'skillsStats', 'skillsCategorySummary',
      'roleLearningJourney', 'adoptionRoadmap', 'enablementActions', 'enablementSummary', 'learningResources', 'alaConsultantGuidance', 'alaAIRecommendation',
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
        strict: false,
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
  const companyProfile = await loadCompanyProfile(userId, blueprintId);
  const industryFit       = await resolveIndustryFit(blueprintId, businessObjective);
  const industry          = industryLabel(industryFit, companyProfile);
  const groundingIndustry = industryFit.industry || NO_KB_FOLDER_INDUSTRY;

  const domain = getDomain(domainId);
  if (!domain) throw new Error(`Domain not found in registry: ${domainId}`);

  // Old blueprints may store capability IDs that were renamed. Map them to the
  // current KB ID so they can still be regenerated.
  const LEGACY_CAP_ID_MAP = {
    'ai-use-case-prioritization': 'ai-implementation-prioritization',
    'ai-skills-assessment': 'ai-roles-capability-planning',
  };
  const resolvedCapabilityId = LEGACY_CAP_ID_MAP[capabilityId] ?? capabilityId;

  const caps = getDomainCapabilities(domain.kbPath);
  const cap  = caps.find(c => c.id === resolvedCapabilityId);
  if (!cap) throw new Error(`Capability not found: ${capabilityId} in ${domain.kbPath}`);

  try {
    await TransformationBlueprint.updateOne(
      { _id: blueprintId },
      { $set: { 'domains.$[dom].capabilities.$[cap].status': 'in-progress', 'domains.$[dom].capabilities.$[cap].errorMessage': '' } },
      { arrayFilters: [{ 'dom.domainId': domainId }, { 'cap.capabilityId': capabilityId }] }
    );

    const capBlueprint    = getDomainCapabilityBlueprint(cap.id, domain.kbPath, groundingIndustry);
    const enterpriseContext = companyProfile.orgName
      ? await getCapabilityEnterpriseContext(companyProfile.orgName, cap.id).catch(() => null)
      : null;
    const connectedKnowledgeContext = companyProfile.orgName
      ? await getConnectedKnowledgeContext(companyProfile.orgName, { capabilityId: cap.id, capabilityName: cap.name, businessObjective }).catch(() => null)
      : null;
    const verticalContext = (companyProfile.subVertical && groundingIndustry !== NO_KB_FOLDER_INDUSTRY)
      ? await getVerticalContextForCapability(industry, companyProfile.subVertical, cap.id).catch(() => null)
      : null;
    const linkedProjectContext = await getLinkedProjectContext(blueprintId).catch(() => null);
    console.log(`[transformationGen] Linked Confluence context for ${cap.name}: ${linkedProjectContext ? 'INCLUDED' : 'none'}`);
    const combinedContext = combineContexts(enterpriseContext, verticalContext, connectedKnowledgeContext, linkedProjectContext);

    // Build both context structures from capabilities completed before this one
    const blueprintDoc      = await TransformationBlueprint.findById(blueprintId).lean();
    const journeyContext    = buildJourneyContextForRegen(blueprintDoc, domainId, resolvedCapabilityId);
    const transformationCtx = buildTransformationCtxForRegen(blueprintDoc, domainId, resolvedCapabilityId, businessObjective);
    console.log(`[transformationGen] Journey context for ${cap.name}: ${journeyContext ? 'AVAILABLE' : 'NONE'} | Ctx initiative: ${transformationCtx.selectedInitiative || 'none'}`);

    const { sections, actionItems } = await runBriefGeneration(
      cap, companyProfile, businessObjective, groundingIndustry,
      capBlueprint.sections, capBlueprint.automotiveBlueprint, combinedContext, journeyContext, transformationCtx
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

    // Replace (not append) — this capability's content just changed, its
    // action items should reflect the new content, same as sections itself.
    saveActionItems({
      blueprintId, domainId, domainName: domain.name,
      capabilityId: cap.id, capabilityName: cap.name, actionItems, replace: true,
    }).catch(err => console.error(`[actionItems] Save failed for ${cap.name} (non-fatal):`, err.message));
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
  const companyProfile = await loadCompanyProfile(userId, blueprintId);
  const industry       = industryLabel(await resolveIndustryFit(blueprintId, businessObjective), companyProfile);
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
  const companyProfile = await loadCompanyProfile(userId, blueprintId);
  const industry       = industryLabel(await resolveIndustryFit(blueprintId, businessObjective), companyProfile);
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
    if (b.aiOpportunities?.length)      lines.push(`Identified AI Opportunities: ${b.aiOpportunities.map(o => o?.name || o).join(', ')}`);
    if (b.businessProblems?.length)     lines.push(`Business Problems: ${b.businessProblems.join(', ')}`);
    if (b.workflowSteps?.length)        lines.push(`Current Workflow: ${b.workflowSteps.join(' → ')}`);
    if (b.highEffortActivities?.length) lines.push(`High-Effort Activities: ${b.highEffortActivities.join(', ')}`);
    if (b.opportunityClassifications?.length) lines.push(`AI Classifications: ${b.opportunityClassifications.map(o => `${o.opportunity} → ${o.classification}`).join('; ')}`);
    if (b.primaryClassification?.name)  lines.push(`Primary AI Classification: ${b.primaryClassification.name}${b.primaryClassification.rationale ? ` — ${b.primaryClassification.rationale}` : ''}`);
    if (b.secondaryClassification?.name) lines.push(`Secondary AI Classification: ${b.secondaryClassification.name}`);
    if (b.transformationImplication)     lines.push(`Transformation Implication: ${b.transformationImplication}`);
    if (b.opportunityValues?.length)    lines.push(`Business Value Map: ${b.opportunityValues.map(o => `${o.opportunity} → ${o.valueArea}`).join('; ')}`);
    if (b.valueCategories?.length)      lines.push(`Business Value Areas: ${b.valueCategories.map(v => v.title).join(', ')}`);
    if (b.kpiPills?.length)             lines.push(`Target KPIs: ${b.kpiPills.join(', ')}`);
    if (b.recommendedStartingPoint)     lines.push(`Recommended Implementation: ${b.recommendedStartingPoint}`);
    if (b.implementationPhases?.length) lines.push(`Implementation Roadmap: ${b.implementationPhases.map(p => `${p.phase} (${p.initiatives.join(', ')})`).join('; ')}`);
    // ── Data Readiness carry-forward ──────────────────────────────────────────
    if (b.datasets?.length)
      lines.push(`Critical Datasets Identified: ${b.datasets.map(d => `${d.name}${d.typicalSource ? ` (${d.typicalSource})` : ''}`).join(', ')}`);
    if (b.traceabilityChain?.length)
      lines.push(`Engineering Traceability Chain: ${b.traceabilityChain.join(' → ')}`);
    if (b.prepWorkPackages?.length)
      lines.push(`Data Preparation Repositories: ${b.prepWorkPackages.map(p => p.name).join(', ')}`);
    if (b.prepSummary?.estimatedDuration)
      lines.push(`Data Preparation Duration: ${b.prepSummary.estimatedDuration}`);
    if (b.archLayers?.length)
      lines.push(`Recommended Architecture Layers: ${b.archLayers.map(l => `${l.name}: ${(l.recommended || []).join(', ')}`).join('; ')}`);
    if (b.archDecisions?.length)
      lines.push(`Architecture Decisions: ${b.archDecisions.map(d => `${d.decisionArea || d.decision}: ${d.recommendation || d.benefit}`).join('; ')}`);
    if (b.techStack?.length)
      lines.push(`Approved Technology Stack: ${b.techStack.map(t => `${t.layer}: ${t.recommendation}`).join(' | ')}`);
    if (b.archPattern?.length)
      lines.push(`Architecture Pattern: ${b.archPattern.join(' → ')}`);
    if (b.archConsultantGuidance)
      lines.push(`Architecture Guidance: ${b.archConsultantGuidance}`);
    // ── Technology Infrastructure: System Integration & Architecture carry-forward ─
    if (b.siaEngineeringSystems?.length)
      lines.push(`Integration Systems: ${b.siaEngineeringSystems.map(s => `${s.name}${s.purpose ? ` (${s.purpose})` : ''}`).join(', ')}`);
    if (b.siaIntegrationPrinciples?.length)
      lines.push(`Integration Principles: ${b.siaIntegrationPrinciples.join('; ')}`);
    if (b.siaConsultantGuidance)
      lines.push(`Integration Guidance: ${b.siaConsultantGuidance}`);
    if (b.siaAIRecommendation)
      lines.push(`Integration AI Recommendation: ${b.siaAIRecommendation}`);
    // ── Technology Infrastructure: AI Platform Readiness carry-forward ───────────
    if (b.platformCapabilities?.some(c => c.purpose))
      lines.push(`AI Platform Capabilities: ${b.platformCapabilities.filter(c => c.purpose).map(c => c.name).join(', ')}`);
    if (b.platformRecs?.length)
      lines.push(`Platform Recommendations: ${b.platformRecs.map(r => r.title || r.action || r).filter(Boolean).join(', ')}`);
    if (b.aprConsultantGuidance)
      lines.push(`Platform Guidance: ${b.aprConsultantGuidance}`);
    if (b.aprAIRecommendation)
      lines.push(`Platform AI Recommendation: ${b.aprAIRecommendation}`);
    // ── Technology Infrastructure: AI Compute & Deployment Strategy carry-forward ─
    if (b.deploymentBlocks?.length)
      lines.push(`Deployment Building Blocks: ${b.deploymentBlocks.map(d => d.name).filter(Boolean).join(', ')}`);
    if (b.cdsDeploymentFlow?.length)
      lines.push(`Deployment Flow: ${b.cdsDeploymentFlow.join(' → ')}`);
    if (b.cdsConsultantGuidance)
      lines.push(`Deployment Guidance: ${b.cdsConsultantGuidance}`);
    if (b.cdsAIRecommendation)
      lines.push(`Deployment AI Recommendation: ${b.cdsAIRecommendation}`);
    if (b.recommendedModelApproach)
      lines.push(`Recommended Model Approach: ${b.recommendedModelApproach}${b.modelSelectionRationale ? ` — ${b.modelSelectionRationale}` : ''}`);
    // ── Skills & Workforce: AI Roles & Capability Planning carry-forward ─────────
    if (b.projectRoles?.length)
      lines.push(`Required Project Roles: ${b.projectRoles.map(r => `${r.name} (${r.primaryResponsibility})`).join(', ')}`);
    if (b.responsibilityJourney?.length)
      lines.push(`Responsibility Journey: ${b.responsibilityJourney.join(' → ')}`);
    if (b.capabilityPriorities?.length)
      lines.push(`Capability Development Priorities: ${b.capabilityPriorities.map(p => `${p.role}: ${p.capability}`).join(', ')}`);
    if (b.arcpConsultantGuidance)
      lines.push(`Workforce Guidance: ${b.arcpConsultantGuidance}`);
    if (b.arcpAIRecommendation)
      lines.push(`Workforce AI Recommendation: ${b.arcpAIRecommendation}`);
    // ── Skills & Workforce: AI Learning & Adoption carry-forward ─────────────────
    if (b.roleLearningJourney?.length)
      lines.push(`Role Learning Paths: ${b.roleLearningJourney.map(r => `${r.role}: ${(r.learningPath || []).join(', ')}`).join('; ')}`);
    if (b.adoptionRoadmap?.some(st => st.goal))
      lines.push(`AI Adoption Roadmap: ${b.adoptionRoadmap.filter(st => st.goal).map(st => `${st.stage} (${st.goal})`).join(' → ')}`);
    if (b.alaConsultantGuidance)
      lines.push(`Enablement Guidance: ${b.alaConsultantGuidance}`);
    if (b.alaAIRecommendation)
      lines.push(`Enablement AI Recommendation: ${b.alaAIRecommendation}`);
  }
  return lines.join('\n');
}

// Updates the shared transformation context object from a single capability's sections.
// Called after each capability in the journey chain so downstream capabilities always
// know the selected initiative, classification, value areas, and implementation priority.
function updateTransformationContext(ctx, capabilityName, sections) {
  for (const s of sections) {
    const b = s.brief || {};
    // C1: first identified opportunity becomes the selected initiative
    if (b.aiOpportunities?.length && !ctx.selectedInitiative)
      ctx.selectedInitiative = b.aiOpportunities[0]?.name || b.aiOpportunities[0];
    // C2: classification details — keep the full list so C4 can re-look-up the
    // classification if the selected initiative is later corrected by Prioritization.
    if (b.opportunityClassifications?.length) {
      ctx._classificationsByOpportunity = b.opportunityClassifications;
      if (!ctx.primaryClassification) {
        const match = b.opportunityClassifications.find(o => o.opportunity === ctx.selectedInitiative) || b.opportunityClassifications[0];
        if (match?.classification) ctx.primaryClassification = match.classification;
      }
    }
    if (b.primaryClassification?.name)
      ctx.primaryClassification = b.primaryClassification.name;
    if (b.secondaryClassification?.name)
      ctx.secondaryClassification = b.secondaryClassification.name;
    if (b.transformationImplication)
      ctx.transformationImplication = b.transformationImplication;
    // C3: value areas and KPIs
    if (b.opportunityValues?.length)
      ctx.businessValueAreas = [...new Set(b.opportunityValues.map(o => o.valueArea).filter(Boolean))];
    if (b.valueCategories?.length)
      ctx.businessValueAreas = b.valueCategories.map(v => v.title);
    if (b.kpiPills?.length)
      ctx.targetKPIs = b.kpiPills;
    // C4: priority quadrant and implementation recommendation
    if (b.recommendedStartingPoint)
      ctx.recommendedImplementation = b.recommendedStartingPoint;
    // Prioritization is the authoritative "which initiative first" signal — override the
    // placeholder captured in C1 (just whichever opportunity was listed first in AI
    // Opportunity Discovery, before value/feasibility was known) so every downstream
    // capability's "Selected AI Initiative" is the one actually recommended to build first.
    if (b.recommendedInitiativeName && b.recommendedInitiativeName !== ctx.selectedInitiative) {
      ctx.selectedInitiative = b.recommendedInitiativeName;
      const match = ctx._classificationsByOpportunity?.find(o => o.opportunity === ctx.selectedInitiative);
      if (match?.classification) ctx.primaryClassification = match.classification;
    }
    if (b.priorityQuadrants?.length && ctx.selectedInitiative) {
      const keyword = ctx.selectedInitiative.toLowerCase().split(' ')[0];
      for (const q of b.priorityQuadrants) {
        const hit = (q.initiatives || []).some(
          i => i && (i.toLowerCase().includes(keyword) || keyword.includes(i.toLowerCase().split(' ')[0]))
        );
        if (hit) { ctx.implementationPriority = q.label; break; }
      }
    }
    // C5: Data Readiness outputs — carried into Technology Infrastructure
    if (!ctx.dataReadiness) ctx.dataReadiness = { datasets: [], archPattern: [], techStack: [], archDecisions: [] };
    if (b.datasets?.length && !ctx.dataReadiness.datasets.length)
      ctx.dataReadiness.datasets = b.datasets.map(d => `${d.name}${d.typicalSource ? ` (${d.typicalSource})` : ''}`);
    if (b.archPattern?.length && !ctx.dataReadiness.archPattern.length)
      ctx.dataReadiness.archPattern = b.archPattern;
    if (b.techStack?.length && !ctx.dataReadiness.techStack.length)
      ctx.dataReadiness.techStack = b.techStack.map(t => ({ layer: t.layer, recommendation: t.recommendation }));
    if (b.archDecisions?.length && !ctx.dataReadiness.archDecisions.length)
      ctx.dataReadiness.archDecisions = b.archDecisions.map(d => ({ area: d.decisionArea || d.decision, recommendation: d.recommendation || d.benefit }));
  }
}

// Serialises the transformation context into the structured block prepended to every LLM prompt.
function formatTransformationContext(ctx) {
  const entries = [
    ctx.businessObjective         && `Business Objective\n${ctx.businessObjective}`,
    ctx.selectedInitiative        && `Selected AI Initiative\n${ctx.selectedInitiative}`,
    ctx.primaryClassification     && `Primary Classification\n${ctx.primaryClassification}`,
    ctx.secondaryClassification   && `Secondary Classification\n${ctx.secondaryClassification}`,
    ctx.businessValueAreas?.length && `Expected Business Value\n${ctx.businessValueAreas.join('\n')}`,
    ctx.targetKPIs?.length        && `Target KPIs\n${ctx.targetKPIs.join('\n')}`,
    ctx.implementationPriority    && `Implementation Priority\n${ctx.implementationPriority}`,
    ctx.recommendedImplementation && `Recommended Implementation\n${ctx.recommendedImplementation}`,
    ctx.transformationImplication && `Transformation Implication\n${ctx.transformationImplication}`,
  ].filter(Boolean);

  // Data Readiness outputs — injected prominently when moving into Technology Infrastructure
  const dr = ctx.dataReadiness;
  if (dr) {
    const drEntries = [
      dr.datasets?.length      && `Critical Datasets Identified\n${dr.datasets.map(d => `- ${d}`).join('\n')}`,
      dr.archPattern?.length   && `Recommended Architecture Pattern\n${dr.archPattern.join(' → ')}`,
      dr.techStack?.length     && `Approved Technology Stack\n${dr.techStack.map(t => `- ${t.layer}: ${t.recommendation}`).join('\n')}`,
      dr.archDecisions?.length && `Architecture Decisions\n${dr.archDecisions.map(d => `- ${d.area}: ${d.recommendation}`).join('\n')}`,
    ].filter(Boolean);

    if (drEntries.length) {
      entries.push('--- DATA READINESS OUTPUTS (use these as the foundation) ---');
      entries.push(...drEntries);
    }
  }

  if (!entries.length) return '';
  return ['==============================', 'TRANSFORMATION CONTEXT', '==============================', '', ...entries].join('\n');
}

// Builds the transformation context for a single-capability regeneration by replaying
// updateTransformationContext over all capabilities completed before the target.
function buildTransformationCtxForRegen(blueprint, currentDomainId, resolvedCapabilityId, businessObjective) {
  const ctx = {
    businessObjective:       businessObjective || '',
    selectedInitiative:      '',
    primaryClassification:   '',
    secondaryClassification: '',
    businessValueAreas:      [],
    targetKPIs:              [],
    implementationPriority:  '',
    recommendedImplementation: '',
    transformationImplication: '',
    dataReadiness:           { datasets: [], archPattern: [], techStack: [], archDecisions: [] },
  };
  if (!blueprint) return ctx;

  for (const domEntry of enabledDomains()) {
    const domDoc = (blueprint.domains || []).find(d => d.domainId === domEntry.id);
    const kbCaps = getDomainCapabilities(domEntry.kbPath);

    for (const kbCap of kbCaps) {
      if (domEntry.id === currentDomainId && kbCap.id === resolvedCapabilityId) break;
      const dbCap = domDoc?.capabilities?.find(c => c.capabilityId === kbCap.id);
      if (dbCap?.status === 'completed' && dbCap.sections?.length)
        updateTransformationContext(ctx, dbCap.capabilityName, dbCap.sections);
    }

    if (domEntry.id === currentDomainId) break;
  }

  return ctx;
}

// Builds the journey context string for a single-capability regeneration call.
// Iterates the blueprint's domains/capabilities in KB-defined order, collecting
// extractJourneyContext output for every capability that completed before the
// target capability. Mirrors the journeyContextParts accumulator in generateTransformationAsync.
function buildJourneyContextForRegen(blueprint, currentDomainId, currentCapabilityId) {
  if (!blueprint) return null;
  const parts = [];

  for (const domEntry of enabledDomains()) {
    const domDoc = (blueprint.domains || []).find(d => d.domainId === domEntry.id);
    const kbCaps = getDomainCapabilities(domEntry.kbPath);

    for (const kbCap of kbCaps) {
      if (domEntry.id === currentDomainId && kbCap.id === currentCapabilityId) break;

      const dbCap = domDoc?.capabilities?.find(c => c.capabilityId === kbCap.id);
      if (dbCap?.status === 'completed' && dbCap.sections?.length) {
        parts.push(extractJourneyContext(dbCap.capabilityName, dbCap.sections));
      }
    }

    if (domEntry.id === currentDomainId) break;
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

// ── Multi-domain transformation generation ────────────────────────────────────

// Generates all enabled domains → capabilities in the TransformationBlueprint.
// Called fire-and-forget. Domains without KB documents are skipped gracefully.
export async function generateTransformationAsync(blueprintId, userId, businessObjective) {
  const companyProfile    = await loadCompanyProfile(userId, blueprintId);
  const industryFit       = await resolveIndustryFit(blueprintId, businessObjective);
  const industry          = industryLabel(industryFit, companyProfile);
  // 'General' has no knowledge_base/.../General/ folder, so the industry-file
  // read fails closed to core-only content — see NO_KB_FOLDER_INDUSTRY above.
  const groundingIndustry = industryFit.industry || NO_KB_FOLDER_INDUSTRY;
  const domains           = enabledDomains();
  const enterpriseCtxMap  = await preloadEnterpriseContextMap(companyProfile.orgName || '');
  const connectedKnowledgeMap = await preloadConnectedKnowledgeMap(companyProfile.orgName || '');
  // Only preload vertical context when this objective actually fits the
  // industry KB — same gating groundingIndustry already applies to the
  // synchronous Core/Industry KB read just below.
  const verticalCtxMap = (companyProfile.subVertical && groundingIndustry !== NO_KB_FOLDER_INDUSTRY)
    ? await preloadVerticalContextMap(industry, companyProfile.subVertical)
    : new Map();

  // Single journey chain spanning all domains — each capability receives the
  // full context of everything generated before it across the entire blueprint.
  // Domain order in domainRegistry.js defines the chain sequence.
  const journeyContextParts = [];

  // Transformation Context: a structured key-facts block that accumulates the
  // selected initiative, classification, KPIs, and priority so every downstream
  // capability knows exactly what was decided — without having to infer it.
  const transformationCtx = {
    businessObjective:       businessObjective || '',
    selectedInitiative:      '',
    primaryClassification:   '',
    secondaryClassification: '',
    businessValueAreas:      [],
    targetKPIs:              [],
    implementationPriority:  '',
    recommendedImplementation: '',
    transformationImplication: '',
    dataReadiness:           { datasets: [], archPattern: [], techStack: [], archDecisions: [] },
  };

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
        const capBlueprint = getDomainCapabilityBlueprint(cap.id, domain.kbPath, groundingIndustry);
        const parsedSections = capBlueprint.sections;

        // Reuse the existing generation pipeline
        const capObj = { id: cap.id, name: cap.name, objective: cap.objective };
        const enterpriseContext = enterpriseCtxMap.get(cap.id) ?? null;
        const connectedKnowledgeContext = await connectedKnowledgeMap.get(cap.id, cap.name);
        const verticalContext = verticalCtxMap.get(cap.id) ?? null;
        // Fetched fresh per capability (not preloaded like the maps above) so a
        // document the user links mid-run can still reach later capabilities.
        const linkedProjectContext = await getLinkedProjectContext(blueprintId).catch(() => null);
        console.log(`[transformationGen] Linked Confluence context for ${cap.name}: ${linkedProjectContext ? 'INCLUDED' : 'none'}`);
        const combinedContext = combineContexts(enterpriseContext, verticalContext, connectedKnowledgeContext, linkedProjectContext);
        const journeyContext    = journeyContextParts.length
          ? journeyContextParts.join('\n\n')
          : null;

        let sections, actionItems = [];
        if (BLUEPRINT_CONFIG.generate.essay) {
          const essays = await runEssayGeneration(
            capObj, companyProfile, businessObjective, groundingIndustry,
            parsedSections, capBlueprint.automotiveBlueprint, combinedContext, journeyContext, transformationCtx
          );
          sections = await runBriefExtraction(capObj, parsedSections, essays);
        } else {
          ({ sections, actionItems } = await runBriefGeneration(
            capObj, companyProfile, businessObjective, groundingIndustry,
            parsedSections, capBlueprint.automotiveBlueprint, combinedContext, journeyContext, transformationCtx
          ));
        }

        // Feed this capability's output into both accumulators for the next capability
        journeyContextParts.push(extractJourneyContext(cap.name, sections));
        updateTransformationContext(transformationCtx, cap.name, sections);

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

        // Skipped for guest generation (userId is null pre-login) — see
        // generateSpecificDomainsAsync for the matching guest-skip + claim-backfill design.
        if (userId) {
          saveActionItems({
            blueprintId, domainId: domain.id, domainName: domain.name,
            capabilityId: cap.id, capabilityName: cap.name, actionItems,
          }).catch(err => console.error(`[actionItems] Save failed for ${cap.name} (non-fatal):`, err.message));
        }
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
  reportRun('full blueprint');
}

/**
 * Regenerates only the specified domains on an existing blueprint.
 * Domains already completed are left untouched (unless explicitly included).
 * Called fire-and-forget from the controller.
 */
export async function generateSpecificDomainsAsync(blueprintId, userId, businessObjective, domainIds) {
  try {
  const companyProfile = await loadCompanyProfile(userId, blueprintId);
  const industryFit       = await resolveIndustryFit(blueprintId, businessObjective);
  const industry          = industryLabel(industryFit, companyProfile);
  const groundingIndustry = industryFit.industry || NO_KB_FOLDER_INDUSTRY;
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

        const capBlueprint   = getDomainCapabilityBlueprint(cap.id, domain.kbPath, groundingIndustry);
        const parsedSections = capBlueprint.sections;
        const capObj         = { id: cap.id, name: cap.name, objective: cap.objective };
        const enterpriseContext = companyProfile.orgName
          ? await getCapabilityEnterpriseContext(companyProfile.orgName, cap.id).catch(() => null)
          : null;
        const connectedKnowledgeContext = companyProfile.orgName
          ? await getConnectedKnowledgeContext(companyProfile.orgName, { capabilityId: cap.id, capabilityName: cap.name, businessObjective }).catch(() => null)
          : null;
        const verticalContext = (companyProfile.subVertical && groundingIndustry !== NO_KB_FOLDER_INDUSTRY)
          ? await getVerticalContextForCapability(industry, companyProfile.subVertical, cap.id).catch(() => null)
          : null;
        const linkedProjectContext = await getLinkedProjectContext(blueprintId).catch(() => null);
        console.log(`[domainRegen] Linked Confluence context for ${cap.name}: ${linkedProjectContext ? 'INCLUDED' : 'none'}`);
        const combinedContext = combineContexts(enterpriseContext, verticalContext, connectedKnowledgeContext, linkedProjectContext);

        // Replay every capability already completed before this one — across all
        // domains, including domains generated in an earlier run — so this
        // domain-selective path carries the same "Selected AI Initiative" /
        // journey grounding as the full-generation path. Without this, capabilities
        // generated here never learned which opportunity AI Use Cases prioritized
        // and re-derived generic themes from the raw business objective instead.
        const blueprintSnapshot = await TransformationBlueprint.findById(blueprintId).lean();
        const transformationCtx = buildTransformationCtxForRegen(blueprintSnapshot, domain.id, cap.id, businessObjective);
        const journeyContext    = buildJourneyContextForRegen(blueprintSnapshot, domain.id, cap.id);

        let sections, actionItems = [];
        if (BLUEPRINT_CONFIG.generate.essay) {
          const essays = await runEssayGeneration(
            capObj, companyProfile, businessObjective, groundingIndustry,
            parsedSections, capBlueprint.automotiveBlueprint, combinedContext, journeyContext, transformationCtx
          );
          sections = await runBriefExtraction(capObj, parsedSections, essays);
        } else {
          ({ sections, actionItems } = await runBriefGeneration(
            capObj, companyProfile, businessObjective, groundingIndustry,
            parsedSections, capBlueprint.automotiveBlueprint, combinedContext, journeyContext, transformationCtx
          ));
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

        // Action items now come from the same call as the content itself
        // (merged — see buildOutputFormat/runBriefGeneration), not a separate
        // extraction call. Still skipped for guest generation (userId is null
        // pre-login) — a guest who never claims the blueprint shouldn't cost
        // anything extra. Claimed guest blueprints get a one-time backfill via
        // extractActionItemsForCapability — see claimGuestBlueprint in
        // strategyCanvasController.js, which is now the ONLY caller of that
        // separate-LLM-call extraction path, alongside lazy tab-open backfill.
        if (userId) {
          saveActionItems({
            blueprintId, domainId: domain.id, domainName: domain.name,
            capabilityId: cap.id, capabilityName: cap.name, actionItems,
          }).catch(err => console.error(`[actionItems] Save failed for ${cap.name} (non-fatal):`, err.message));
        }
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
  reportRun(domainIds.join(', '));

  } catch (err) {
    console.error(`[domainRegen] Fatal error for blueprint ${blueprintId}:`, err.message);
    await TransformationBlueprint.updateOne(
      { _id: blueprintId },
      { $set: { status: 'error', updatedAt: new Date() } }
    ).catch(() => {});
  }
}
