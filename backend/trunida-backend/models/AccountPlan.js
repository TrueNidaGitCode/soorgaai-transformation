/**
 * Svarg — what an account is entitled to
 *
 * One record per user. Absence means Hobby: the free tier is the default, so
 * an account that has never touched billing needs no row, and a failure to
 * read this collection can never accidentally grant someone a paid plan.
 *
 * The tier name is the only thing stored. Every limit is derived from it in
 * services/entitlements.js — a copy of the numbers here would be a second
 * source of truth that drifts the first time pricing changes, and the numbers
 * on the pricing page would then describe neither.
 *
 * `overrides` is the exception: a per-account exception an admin can grant
 * without inventing a tier for one customer. Null means "use the plan's
 * number", which is why every field defaults to null rather than 0 — 0 is a
 * real limit meaning "none allowed".
 *
 * ── Plain strings, deliberately ────────────────────────────────────────────
 *
 * `plan` and `status` are not enums. A Mongoose enum whose default is not a
 * member rejects every save, and an enum that gains a value in code before it
 * gains one in the schema fails at write time rather than at review time.
 * Validation lives in entitlements.js, which treats an unknown tier as Hobby.
 */

import mongoose from 'mongoose';

const accountPlanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User',
    required: true, unique: true, index: true,
  },

  /** hobby | pro | ultra | enterprise */
  plan: { type: String, default: 'hobby' },

  /**
   * active | past_due | cancelled
   *
   * Separate from `plan` because a lapsed Pro subscription is not the same as
   * a Hobby account: the customer's work stays theirs and stays readable, they
   * simply cannot start new work until they pay. Collapsing the two would mean
   * a failed card silently deleted the distinction.
   */
  status: { type: String, default: 'active' },

  /** When the paid period ends. Null on Hobby, which never expires. */
  currentPeriodEnd: { type: Date, default: null },

  razorpay: {
    customerId:     { type: String, default: '' },
    subscriptionId: { type: String, default: '', index: true },
    planId:         { type: String, default: '' },
  },

  /**
   * Webhook idempotency. Razorpay retries, and applying `subscription.charged`
   * twice would extend the period twice — a customer who paid once getting two
   * months is the cheap failure; the expensive one is the same bug in reverse.
   */
  lastEventId: { type: String, default: '' },

  /** Null means "whatever the tier says". 0 is a real limit meaning none. */
  overrides: {
    newBlueprintsPerMonth: { type: Number, default: null },
    activeBlueprints:      { type: Number, default: null },
    applications:          { type: Number, default: null },
    launches:              { type: Number, default: null },
    deploymentCostUsd:     { type: Number, default: null },
  },

  /** Why an override exists, so the next person can tell a deal from a bug. */
  overrideNote: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('AccountPlan', accountPlanSchema);
