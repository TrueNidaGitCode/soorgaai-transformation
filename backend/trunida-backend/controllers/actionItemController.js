/**
 * SoorgaAI — Action Item Controller
 *
 * GET   /api/action-items/:blueprintId          list all action items for a blueprint
 * PATCH /api/action-items/:blueprintId/:itemId   update one (status, assignee, reviewer, etc.)
 *
 * New blueprints get action items automatically, merged into the same call
 * that generates a capability's content (blueprintGenerationService.js).
 * Blueprints that predate that — generated before this feature existed, no
 * guest→claim event to hook a backfill into — get a lazy backfill right
 * here, the first time this list endpoint is called for them.
 */

import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { listActionItems, updateActionItem, backfillIfNeeded } from '../services/actionItemService.js';

async function loadOwnedBlueprint(blueprintId, userId) {
  const bp = await TransformationBlueprint.findOne({ _id: blueprintId, userId }).lean();
  if (!bp) throw new Error('Blueprint not found.');
  return bp;
}

export async function list(req, res) {
  try {
    const { blueprintId } = req.params;
    const blueprint = await loadOwnedBlueprint(blueprintId, req.user._id);

    let items = await listActionItems(blueprintId);
    if (!items.length) {
      // Lazy backfill — only runs when there's actually nothing yet, so a
      // blueprint that already has items never pays this cost again.
      await backfillIfNeeded(blueprint);
      items = await listActionItems(blueprintId);
    }

    return res.json({ items });
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }
}

export async function update(req, res) {
  try {
    const { blueprintId, itemId } = req.params;
    await loadOwnedBlueprint(blueprintId, req.user._id);
    const doc = await updateActionItem(itemId, blueprintId, req.body || {}, req.user._id);
    return res.json({ item: doc });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
