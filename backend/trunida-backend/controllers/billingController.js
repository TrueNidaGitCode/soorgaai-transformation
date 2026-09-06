/**
 * Svarg — plans and usage
 *
 * What the account is on, what it has used, and what it may still do. Read by
 * the usage panel and by anything that wants to warn before a gate refuses.
 *
 * Payment is not here yet. There is no Razorpay integration, no checkout and
 * no webhook, so the only way onto a paid tier today is an admin setting it —
 * which is deliberate rather than a stub: a self-serve upgrade button that
 * takes money before GST invoicing exists would be the wrong thing to ship
 * first.
 */

import AccountPlan from '../models/AccountPlan.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import { User } from '../models/user.js';
import { usageSummary, PLANS, planKey } from '../services/entitlements.js';
import { ledgerFor } from '../services/usageLedgerService.js';

function auditLog(action, actorId, extra = {}) {
  console.log(JSON.stringify({
    audit: 'Billing', action, actor: String(actorId), ts: new Date().toISOString(), ...extra,
  }));
}

// ── GET /api/billing/plan ────────────────────────────────────────────────────

/**
 * This account's tier, limits and usage.
 *
 * Spend is deliberately absent. It is Svarg's cost, not what the customer is
 * billed on, and showing a number they cannot verify invites an argument about
 * arithmetic instead of a decision about a plan.
 */
export async function getMyPlan(req, res) {
  try {
    const s = await usageSummary(req.user._id);
    return res.json({
      plan: s.plan,
      planLabel: PLANS[planKey(s.plan)].label,
      status: s.status,
      // What they can actually do right now, which differs from `plan` only
      // while a subscription is unpaid.
      effective: s.effective,
      effectiveLabel: PLANS[planKey(s.effective)].label,
      lapsed: s.lapsed,
      currentPeriodEnd: s.currentPeriodEnd,
      limits: s.limits,
      used: s.used,
      windowResetsAt: s.windowResetsAt,
    });
  } catch (err) {
    console.error('[billing] plan read error:', err.message);
    return res.status(500).json({ error: 'Could not read your plan.' });
  }
}

// ── POST /api/billing/archive/:blueprintId ───────────────────────────────────

/**
 * Retire an objective, or bring it back.
 *
 * Pro carries one active objective, so without this the limit is a dead end:
 * the customer has no way to put one down, and "archive the one you have" in
 * the refusal message would name an action that does not exist. Nothing is
 * deleted — an archived blueprint is still readable, still downloadable, and
 * unarchiving is a second call to the same route.
 */
export async function setArchived(req, res) {
  try {
    const archived = req.body?.archived !== false;
    const bp = await TransformationBlueprint.findOneAndUpdate(
      { _id: req.params.blueprintId, userId: req.user._id },
      { $set: { archived, archivedAt: archived ? new Date() : null } },
      { new: true }
    ).select('_id archived archivedAt businessObjective').lean();

    if (!bp) return res.status(404).json({ error: 'Blueprint not found.' });

    // Un-archiving can put an account back over its limit — it is the one
    // direction that grants something. Refuse rather than let a plan be
    // stepped around by archiving and restoring.
    if (!archived) {
      const s = await usageSummary(req.user._id);
      if (s.limits.activeBlueprints !== null && s.used.activeBlueprints > s.limits.activeBlueprints) {
        await TransformationBlueprint.updateOne(
          { _id: bp._id, userId: req.user._id },
          { $set: { archived: true, archivedAt: new Date() } }
        );
        return res.status(402).json({
          error: `${PLANS[planKey(s.effective)].label} covers ${s.limits.activeBlueprints} active objective`
            + `${s.limits.activeBlueprints === 1 ? '' : 's'}. Archive another one first, or move up a plan.`,
          code: 'limit_reached',
        });
      }
    }

    auditLog(archived ? 'ARCHIVED' : 'UNARCHIVED', req.user._id, { blueprintId: String(bp._id) });
    return res.json({ blueprintId: bp._id, archived: bp.archived, archivedAt: bp.archivedAt });
  } catch (err) {
    console.error('[billing] archive error:', err.message);
    return res.status(500).json({ error: 'Could not change the archive state.' });
  }
}

// ── Admin ────────────────────────────────────────────────────────────────────

/**
 * PUT /api/billing/admin/plan — put an account on a tier.
 *
 * The only route onto a paid plan until Razorpay exists. Audit-logged with the
 * actor, because "who put this customer on Ultra" is a question that gets
 * asked exactly once, at the worst possible time.
 */
export async function adminSetPlan(req, res) {
  try {
    const { email, plan, status = 'active', overrides = {}, note = '' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required.' });

    const key = String(plan || '').trim().toLowerCase();
    if (!PLANS[key]) {
      return res.status(400).json({ error: `Unknown plan "${plan}". One of: ${Object.keys(PLANS).join(', ')}.` });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('_id email').lean();
    if (!user) return res.status(404).json({ error: 'No account with that email.' });

    // Only the five known override keys, and only numbers. An override is a
    // hand-typed exception; letting arbitrary keys through would put junk in
    // the document that entitlements.js would then read past silently.
    const clean = {};
    for (const k of ['newBlueprintsPerMonth', 'activeBlueprints', 'applications', 'launches', 'deploymentCostUsd']) {
      if (overrides[k] === null) clean[k] = null;
      else if (Number.isFinite(Number(overrides[k]))) clean[k] = Number(overrides[k]);
    }

    const doc = await AccountPlan.findOneAndUpdate(
      { userId: user._id },
      { $set: { userId: user._id, plan: key, status, overrides: clean, overrideNote: note } },
      { upsert: true, new: true }
    ).lean();

    auditLog('PLAN_SET', req.user._id, { target: user.email, plan: key, status, overrides: clean });
    return res.json({ email: user.email, plan: doc.plan, status: doc.status, overrides: doc.overrides });
  } catch (err) {
    console.error('[billing] admin set plan error:', err.message);
    return res.status(500).json({ error: 'Could not set the plan.' });
  }
}

/**
 * GET /api/billing/admin/usage?email=… — what an account cost.
 *
 * Admin-only for the reason getMyPlan omits it: this is Svarg's cost of
 * serving someone, not a figure the customer is billed on.
 */
export async function adminGetUsage(req, res) {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email is required.' });

    const user = await User.findOne({ email }).select('_id email').lean();
    if (!user) return res.status(404).json({ error: 'No account with that email.' });

    const [summary, months] = await Promise.all([
      usageSummary(user._id),
      ledgerFor(user._id, 12),
    ]);

    return res.json({
      email: user.email,
      plan: summary.plan,
      used: summary.used,
      limits: summary.limits,
      months: months.map(m => ({
        period: m.period, calls: m.calls,
        inputTokens: m.inputTokens, outputTokens: m.outputTokens,
        costUsd: Number((m.costUsd || 0).toFixed(4)),
        byStage: m.byStage || {},
      })),
    });
  } catch (err) {
    console.error('[billing] admin usage error:', err.message);
    return res.status(500).json({ error: 'Could not read usage.' });
  }
}
