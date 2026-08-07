/**
 * SoorgaAI — Action Item Extraction
 *
 * Turns one capability's generated content into 2-4 concrete, trackable
 * action items — the "what's next" layer on top of a blueprint, so a
 * capability isn't just prose to read once. Runs automatically once a
 * capability's generation completes (see blueprintGenerationService.js),
 * non-blocking — an extraction failure never fails the capability itself.
 *
 * Brief shapes vary per capability (AI Opportunity Discovery's brief has
 * different fields than a standard strategicPosition/priorityActions brief)
 * — rather than hard-code field names per template, the whole section is
 * serialized to text and handed to the model, which reads it like a human
 * reviewing the capability would.
 */

import ActionItem from '../models/ActionItem.js';
import { generate } from './llmService.js';

function buildSystemPrompt(domainName, capabilityName) {
  return `You are helping a project team turn a completed AI strategy capability into concrete, trackable next steps.

CONTEXT: This is the "${capabilityName}" capability, part of the "${domainName}" domain of an AI transformation blueprint.

TASK: Read the capability content below and extract 2-4 specific, concrete action items — things a real project team would actually need to do, review, or agree on to act on this capability. Not a restatement of the content, actual next steps.

For each action item, suggest:
- A short, specific title (one sentence, action-oriented — e.g. "Review top 2 AI opportunities and align on Q1 priority" not "Review AI Opportunity Discovery")
- A one-sentence description of what completing it actually involves
- A suggested assignee role — whoever would realistically own driving this (e.g. "Product Owner", "Engineering Lead", "Data Engineering Lead") — infer from what the action actually is, not a generic default
- A suggested reviewer role — whoever would need to sign off before it's considered agreed (e.g. "Technical Architect", "CTO", "Legal/Compliance") — infer from the domain and the specific action, can be empty if no review is naturally implied

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "actionItems": [
    { "title": "...", "description": "...", "assignee": "...", "reviewer": "..." }
  ]
}`;
}

function serializeSection(section) {
  const brief = section.brief || {};
  const lines = [`Section: ${section.title}`];

  if (brief.strategicPosition) lines.push(`Strategic Position: ${brief.strategicPosition}`);
  if (brief.priorityActions?.length) lines.push(`Priority Actions: ${brief.priorityActions.join('; ')}`);
  if (brief.successMetrics?.length) lines.push(`Success Metrics: ${brief.successMetrics.join('; ')}`);

  // Catch-all for template-specific fields (AI Opportunity Discovery's
  // businessProblems/aiOpportunities, etc.) not covered by the common fields
  // above — serialize whatever else is on the brief object.
  const knownKeys = new Set(['strategicPosition', 'priorityActions', 'successMetrics', 'leadershipValidation', 'strategicPillars', 'kpiHighlights']);
  for (const [key, value] of Object.entries(brief)) {
    if (knownKeys.has(key) || !value) continue;
    lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }

  if (section.content) lines.push(`Content: ${section.content}`);

  return lines.join('\n');
}

/**
 * Extracts and saves action items for one completed capability.
 * Non-blocking by design — callers should .catch() this, never await-fail
 * the capability's own completion on an extraction error.
 */
export async function extractActionItemsForCapability({
  blueprintId, domainId, domainName, capabilityId, capabilityName, sections,
}) {
  const sectionText = (sections || []).map(serializeSection).join('\n\n');
  if (!sectionText.trim()) return { created: 0 };

  const systemPrompt = buildSystemPrompt(domainName, capabilityName);
  const { text } = await generate({ systemPrompt, userMessage: sectionText, maxTokens: 1200 });

  let parsed;
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { created: 0, error: 'Failed to parse extraction response' };
  }

  const items = Array.isArray(parsed.actionItems) ? parsed.actionItems : [];
  if (!items.length) return { created: 0 };

  const docs = items
    .filter(i => i.title)
    .map(i => ({
      blueprintId, domainId, domainName, capabilityId, capabilityName,
      title:       i.title,
      description: i.description || '',
      assignee:    i.assignee || '',
      reviewer:    i.reviewer || '',
    }));

  await ActionItem.insertMany(docs);
  return { created: docs.length };
}

/**
 * Saves action items already produced by the main generation call (merged
 * into the same call that generates a capability's content — see
 * blueprintGenerationService.js) — no LLM call here, just persistence.
 * Distinct from extractActionItemsForCapability above, which is now used
 * only for backfilling content that predates this merge (lazy tab-open,
 * claimed-guest-blueprint backfill).
 *
 * @param {boolean} [replace=false] - on regeneration, replace this
 *   capability's existing action items rather than appending duplicates —
 *   matches how `sections` itself is fully overwritten on regenerate, not appended.
 */
export async function saveActionItems({ blueprintId, domainId, domainName, capabilityId, capabilityName, actionItems, replace = false }) {
  if (replace) {
    await ActionItem.deleteMany({ blueprintId, capabilityId });
  }
  if (!actionItems?.length) return { created: 0 };

  const docs = actionItems.map(i => ({
    blueprintId, domainId, domainName, capabilityId, capabilityName,
    title: i.title, description: i.description || '', assignee: i.assignee || '', reviewer: i.reviewer || '',
  }));
  await ActionItem.insertMany(docs);
  return { created: docs.length };
}

export async function listActionItems(blueprintId) {
  return ActionItem.find({ blueprintId }).sort({ createdAt: 1 }).lean();
}

export async function updateActionItem(actionItemId, blueprintId, updates, updatedByUserId) {
  const allowed = ['title', 'description', 'assignee', 'reviewer', 'status', 'dueDate'];
  const $set = { updatedBy: updatedByUserId };
  for (const key of allowed) {
    if (updates[key] !== undefined) $set[key] = updates[key];
  }
  const doc = await ActionItem.findOneAndUpdate({ _id: actionItemId, blueprintId }, { $set }, { new: true });
  if (!doc) throw new Error('Action item not found.');
  return doc;
}

// Completed capabilities with content but no action items yet — the set
// either backfill path needs to fill.
async function findCapabilityGaps(blueprint) {
  const existingCapIds = new Set(
    (await ActionItem.find({ blueprintId: blueprint._id }, { capabilityId: 1 }).lean())
      .map(i => i.capabilityId)
  );

  const gaps = [];
  for (const domain of blueprint.domains || []) {
    for (const cap of domain.capabilities || []) {
      if (cap.status !== 'completed' || !cap.sections?.length) continue;
      if (existingCapIds.has(cap.capabilityId)) continue;
      gaps.push({
        blueprintId:    blueprint._id,
        domainId:       domain.domainId,
        domainName:     domain.domainName || domain.domainId,
        capabilityId:   cap.capabilityId,
        capabilityName: cap.capabilityName,
        sections:       cap.sections,
      });
    }
  }
  return gaps;
}

/**
 * One-time backfill for a blueprint that was generated as a guest (where
 * extraction is skipped — see blueprintGenerationService.js) and has just
 * been claimed on login. Sequential — fire-and-forget from the caller,
 * never blocks the claim response, so there's no rush.
 */
export async function backfillActionItemsForClaimedBlueprint(blueprint) {
  const gaps = await findCapabilityGaps(blueprint);
  for (const gap of gaps) {
    await extractActionItemsForCapability(gap)
      .catch(err => console.error(`[actionItems] Claim backfill failed for ${gap.capabilityName} (non-fatal):`, err.message));
  }
}

/**
 * Lazy backfill for a blueprint that predates this feature entirely (no
 * guest→claim event to hook into — the user logged in and generated long
 * before action items existed). Triggered on first Action Tracker tab open
 * — see actionItemController.js. Runs in parallel, not sequential, since
 * this one DOES block a real page load and a 16-capability blueprint
 * running sequentially would be an unreasonable wait.
 */
export async function backfillIfNeeded(blueprint) {
  const gaps = await findCapabilityGaps(blueprint);
  if (!gaps.length) return;

  await Promise.all(
    gaps.map(gap =>
      extractActionItemsForCapability(gap)
        .catch(err => console.error(`[actionItems] Lazy backfill failed for ${gap.capabilityName} (non-fatal):`, err.message))
    )
  );
}
