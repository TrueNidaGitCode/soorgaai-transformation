/**
 * Svarg — what an account actually cost
 *
 * One row per user per calendar month, incremented with $inc so concurrent
 * generations cannot lose a write to a read-modify-write race.
 *
 * This enforces nothing. Every limit in entitlements.js counts artefacts —
 * blueprints, applications, launches — because those are what a customer
 * understands and what the pricing page sells. This measures the other side:
 * what those artefacts cost Svarg in model spend.
 *
 * It exists because the tier limits were set from an estimate — roughly
 * $0.25–$0.30 per blueprint, output measured and input guessed — and a price
 * set against a guess is one you find out about from a bill. Once there are a
 * few months of rows here, the caps can be set from measurement instead.
 *
 * Broken down by stage so the expensive part is visible rather than inferred:
 * a blueprint is ~32 model calls and an Eame build is one, and a total alone
 * would hide that.
 */

import mongoose from 'mongoose';

const stageUsageSchema = new mongoose.Schema({
  calls:        { type: Number, default: 0 },
  inputTokens:  { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  costUsd:      { type: Number, default: 0 },
}, { _id: false });

const usageLedgerSchema = new mongoose.Schema({
  /**
   * Null for guest previews, which have no account by design.
   *
   * The unique index below is on (userId, period), and Mongo treats null as a
   * value — so every guest preview in a month lands in exactly one row. That
   * is the right shape: nobody wants a row per anonymous visitor, they want
   * "what did the free tier cost in September".
   */
  userId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true,
  },

  /** user | guest. Readability — the null userId above already carries it. */
  scope: { type: String, default: 'user' },

  /**
   * "YYYY-MM", UTC. A calendar month rather than a rolling window because this
   * is for reading and reconciling against provider invoices, which arrive by
   * calendar month. The entitlement counters use a rolling window instead —
   * see entitlements.js, where the reason is the opposite one.
   */
  period: { type: String, required: true },

  calls:        { type: Number, default: 0 },
  inputTokens:  { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  costUsd:      { type: Number, default: 0 },

  /** cob | aria | arth | eame | yusu | other */
  byStage: { type: Map, of: stageUsageSchema, default: () => new Map() },

  lastCallAt: { type: Date, default: null },
}, { timestamps: true });

// One row per user per month. Unique so a concurrent first-write of the same
// month cannot create two rows that then each hold half the truth.
usageLedgerSchema.index({ userId: 1, period: 1 }, { unique: true });

export default mongoose.model('UsageLedger', usageLedgerSchema);
