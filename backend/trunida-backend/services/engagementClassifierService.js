/**
 * Svarg — Engagement Classifier
 *
 * Decides what KIND of AI work a blueprint is, before any of it is generated.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Almost everything customers ask for falls into one of two categories, and
 * they need opposite things from the rest of the pipeline:
 *
 *   product-ai            Put AI inside the product the company sells. The
 *                         sources that matter are their own code, their own
 *                         application database, and — only in an established
 *                         organisation — separate requirement and architecture
 *                         documents. The deliverable is a change to their
 *                         codebase.
 *
 *   workflow-automation   Automate work the company does internally. The
 *                         sources that matter are the tools of one specific
 *                         workflow area. The deliverable is an application of
 *                         its own.
 *
 * Nothing in the pipeline knew this, so dataset generation asked every customer
 * for automotive engineering tooling and Aria offered every customer the same
 * two connectors.
 *
 * ── Why company context is not optional here ────────────────────────────────
 *
 * The first customer this was built for proves the objective text alone is not
 * enough. An academy-management software company wrote:
 *
 *   "Studio owners and teachers spend hours every week on attendance, fee
 *    collection, scheduling and parent communication…"
 *
 * Read as text that is workflow automation — hours spent, manual admin,
 * repetitive work. It is not. The people with the workflow are the company's
 * CUSTOMERS, and the company sells them software, so the answer is a feature in
 * their product. The discriminating question is whose workflow it is and
 * whether this company sells software to those people, and that lives in
 * company context rather than in the objective.
 *
 * A classifier given only the objective would confidently get this backwards
 * and misdirect an entire generation run.
 *
 * ── Posture ─────────────────────────────────────────────────────────────────
 *
 * Conservative, in the same way industryFitService is: a null category means
 * "undecided", every caller keeps its existing behaviour, and nothing downstream
 * is steered. Being undecided costs a generic blueprint. Being wrong costs a
 * blueprint pointed at the wrong systems entirely, which is worse.
 */

import { generate } from './llmService.js';

/** Workflow areas we can name. Extending this list is a content change. */
export const WORKFLOW_AREAS = [
  'requirements',
  'design',
  'code',
  'test',
  'deploy',
  'support',
];

export const CATEGORIES = ['product-ai', 'workflow-automation'];
export const MATURITIES = ['enterprise', 'startup'];

/**
 * @typedef {Object} Engagement
 * @property {'product-ai'|'workflow-automation'|null} category
 *   null means undecided — callers must fall back to their existing behaviour.
 * @property {string|null} subArea
 *   One of WORKFLOW_AREAS when category is workflow-automation, else null.
 * @property {'enterprise'|'startup'|'unknown'} maturity
 * @property {number} confidence 0–1.
 * @property {string} reason One short sentence.
 */

/** Undecided, in the shape every caller expects. */
function undecided(reason = '') {
  return { category: null, subArea: null, maturity: 'unknown', confidence: 0, reason };
}

const SYSTEM_PROMPT =
`You classify what kind of AI work a company is asking for. Two categories:

product-ai — AI built INTO the product or service this company sells to its own
customers. The work ends up in their codebase.

workflow-automation — AI that automates work THIS COMPANY'S OWN STAFF do
internally. The work ends up as a separate tool their staff use.

THE DISCRIMINATING QUESTION, and the one that is most often got wrong:
Whose workflow is being described, and does this company sell software to those
people? An objective describing painful manual work is product-ai when the
people doing that work are the company's CUSTOMERS and the company sells them
software. It is workflow-automation only when the people doing that work are the
company's own employees.

Example of the trap: a company that sells academy-management software writes
"studio owners and teachers spend hours on attendance and fee collection". The
studio owners are its customers, not its staff, so this is product-ai.

If category is workflow-automation, also pick the area of work it automates:
requirements, design, code, test, deploy, support.

Also judge organisational maturity:
enterprise — an established organisation that maintains requirement and
architecture documents separately from its code.
startup — a young company whose code IS its specification; no separate
requirement or architecture documents exist.

Return null for category when you cannot tell from the evidence given. Null is a
correct and expected answer — classifying wrongly points the entire blueprint at
the wrong systems, which is far worse than not classifying at all. In
particular, return null when there is no company context and the objective alone
is ambiguous about whose workflow it describes.

Respond with ONLY compact JSON, no other text:
{"category": "product-ai" | "workflow-automation" | null, "subArea": "<area>" | null, "maturity": "enterprise" | "startup" | "unknown", "confidence": <0-1>, "reason": "<one sentence, under 25 words>"}`;

/**
 * @param {string} businessObjective
 * @param {string} [companyContext] What the company does — the evidence that
 *   decides whose workflow the objective describes. Absent for guests.
 * @returns {Promise<Engagement>}
 */
export async function resolveEngagement(businessObjective, companyContext = '') {
  const objective = String(businessObjective || '').trim();
  if (!objective) return undecided('No objective to classify.');

  const context = String(companyContext || '').trim();

  try {
    const result = await generate({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: context
        ? `COMPANY CONTEXT (what this company does, and who it sells to):\n${context.slice(0, 4000)}\n\nOBJECTIVE:\n${objective}`
        // Said explicitly rather than left out: without it the model reads the
        // objective as if it described the company's own staff, which is the
        // exact misclassification this service exists to avoid.
        : `COMPANY CONTEXT: none available — you do not know what this company sells or who its customers are.\n\nOBJECTIVE:\n${objective}`,
      maxTokens: 250,
      label: 'engagement-classification',
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in classifier response');
    const parsed = JSON.parse(jsonMatch[0]);

    // Trust the vocabulary, not the model. A value outside these lists would be
    // stored and then silently fail to match anything downstream, which reads
    // as "the feature does not work" rather than "the model said something odd".
    const category = CATEGORIES.includes(parsed.category) ? parsed.category : null;
    if (!category) {
      return undecided(String(parsed.reason || '').slice(0, 300));
    }

    // subArea only means anything for workflow automation.
    const subArea = category === 'workflow-automation' && WORKFLOW_AREAS.includes(parsed.subArea)
      ? parsed.subArea
      : null;

    const maturity = MATURITIES.includes(parsed.maturity) ? parsed.maturity : 'unknown';

    const rawConfidence = Number(parsed.confidence);
    const confidence = Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0;

    return {
      category,
      subArea,
      maturity,
      confidence,
      reason: String(parsed.reason || '').slice(0, 300),
    };
  } catch (err) {
    // Undecided, never a guess. Every caller already handles a null category by
    // behaving exactly as it did before this service existed, so a classifier
    // outage degrades the product rather than breaking it.
    console.error('[engagement] classification failed — leaving it undecided:', err.message);
    return undecided('');
  }
}
