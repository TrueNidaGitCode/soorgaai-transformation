/**
 * Svarg — writing model spend to the ledger
 *
 * Called from llmService.recordCall for every generation, so a call site
 * cannot be added that goes unrecorded.
 *
 * ── Never fails the customer's work ────────────────────────────────────────
 *
 * Every write here is fire-and-forget and every error is swallowed after a
 * warning. A blueprint that took four minutes must not be lost because an
 * accounting row would not save; the ledger is Svarg's bookkeeping, not the
 * customer's deliverable. The cost of that choice is that a database outage
 * loses spend silently, which is why the warning names the account.
 *
 * ── The cost figure is an estimate, and stays one ──────────────────────────
 *
 * Prices come from the advisory catalog, which carries list prices that drift
 * and are flagged in-code as unreconciled. The row is for comparing tiers and
 * checking a cap against reality, not for billing anyone — nothing in Svarg
 * charges a customer from this number.
 */

import UsageLedger from '../models/UsageLedger.js';
import { estimateCostUsd } from './gatewayService.js';

/** The five pipeline stages, plus a bucket for everything else. */
const STAGES = ['cob', 'aria', 'arth', 'eame', 'yusu'];

/**
 * Which stage a call belongs to.
 *
 * Labels are already prefixed at the call sites that matter — 'cob:section',
 * 'aria:dataset-match', 'arth:recommend'. The rest are named for what they do
 * rather than which stage they serve, so they are mapped explicitly; anything
 * unrecognised lands in 'other' rather than being guessed into a stage and
 * quietly distorting the breakdown the tiers will be priced from.
 */
const LABEL_STAGE = {
  'objective-guard': 'cob',
  'engagement-classification': 'cob',
  'industry-grounding': 'cob',
};

export function stageFromLabel(label, explicit = '') {
  if (STAGES.includes(explicit)) return explicit;
  const l = String(label || '').trim();
  const prefix = l.split(':')[0].toLowerCase();
  if (STAGES.includes(prefix)) return prefix;
  if (LABEL_STAGE[l]) return LABEL_STAGE[l];
  // chat:<screen> — the screen IS the stage, and chat is a real cost per stage.
  if (prefix === 'chat') {
    const screen = l.split(':')[1];
    if (STAGES.includes(screen)) return screen;
  }
  return 'other';
}

/** "YYYY-MM" in UTC. See the model for why this is a calendar month. */
export function periodKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

/**
 * Add one call to an account's month.
 *
 * Upsert plus $inc: two generations finishing at the same instant on a fresh
 * month would otherwise race to create the row, and a read-modify-write would
 * lose one of them. The unique index on (userId, period) is what makes the
 * upsert safe rather than a source of duplicate rows.
 */
export async function recordLedgerCall({ userId, label, stage, model, inputTokens = 0, outputTokens = 0 }) {
  if (!userId) return; // guest preview, or a script with no attribution
  const period = periodKey();
  const bucket = stageFromLabel(label, stage);
  const costUsd = estimateCostUsd(model, inputTokens, outputTokens);

  try {
    await UsageLedger.updateOne(
      { userId, period },
      {
        $inc: {
          calls: 1, inputTokens, outputTokens, costUsd,
          [`byStage.${bucket}.calls`]: 1,
          [`byStage.${bucket}.inputTokens`]: inputTokens,
          [`byStage.${bucket}.outputTokens`]: outputTokens,
          [`byStage.${bucket}.costUsd`]: costUsd,
        },
        $set: { lastCallAt: new Date() },
        $setOnInsert: { userId, period },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn(`[usage-ledger] could not record a ${bucket} call for ${userId} — ${err.message}`);
  }
}

/** One account's months, newest first. Admin-facing; costs are Svarg's, not the customer's. */
export async function ledgerFor(userId, months = 6) {
  return UsageLedger.find({ userId }).sort({ period: -1 }).limit(months).lean().catch(() => []);
}
