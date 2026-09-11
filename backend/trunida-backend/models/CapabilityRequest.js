/**
 * Svarg — a capability the Learner decided to act on
 *
 * A need in CustomerUnderstanding is an observation: the customer said they
 * want something. This is the decision that follows — one record per
 * requirement the system has committed to, carrying it from planned, through
 * building, to live or failed.
 *
 * The two are separate on purpose. Observations are cheap, revisable and
 * frequently wrong; a decision spends money and changes a running application.
 * Keeping them in one list would mean a re-extraction could quietly alter
 * something already being built.
 *
 * ── needKey is the reason this collection exists ──────────────────────────
 *
 * Under unattended building, the expensive failure is not building the wrong
 * thing once — it is building the right thing four times because the customer
 * mentioned it in four messages. That cannot be prevented by remembering to
 * check first; it has to be impossible. needKey is the normalised requirement,
 * and (userId, blueprintId, needKey) is unique, so a second attempt to act on
 * the same requirement fails at the database rather than at whichever code
 * path forgot to look.
 */

import mongoose from 'mongoose';

/**
 * What Cob worked out should be built.
 *
 * `actionable` is the planner's own veto. A need can be real, clearly stated
 * and still not something to build — "I wish students were more punctual" is
 * a wish, not a capability. Recording the refusal with its reason means the
 * same need is not re-planned on every pass.
 */
const planSchema = new mongoose.Schema({
  actionable:  { type: Boolean, default: false },
  reason:      { type: String,  default: '' },
  title:       { type: String,  default: '' },
  summary:     { type: String,  default: '' },
  /** What the application will do, as steps a person would recognise. */
  steps:       { type: [String], default: [] },
  /** Data it needs that the application may not hold yet. */
  dataNeeded:  { type: [String], default: [] },
  /** Outside services required — WhatsApp Business, a payment provider. The
   *  customer has to connect these; the build cannot invent them. */
  connectorsNeeded: { type: [String], default: [] },
}, { _id: false });

const capabilityRequestSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  blueprintId: { type: String, required: true, index: true },

  /** The requirement in the customer's own words, as first understood. */
  need:    { type: String, required: true },
  /** Normalised form. Uniqueness is enforced on this, not on `need`. */
  needKey: { type: String, required: true },

  // planned    — decided and planned, nothing built
  // building   — a build is running
  // ready      — built and deployed; the customer can be told
  // live       — the customer has it (connected anything it needed)
  // failed     — the build did not survive verification
  // dismissed  — not actionable, or the customer said no
  status: { type: String, default: 'planned', index: true },

  plan: { type: planSchema, default: () => ({}) },

  /** How many times the need had been mentioned when this was decided. Kept
   *  because it is the evidence for having acted, and worth being able to
   *  read back when a build turns out to have been a misreading. */
  mentionsAtDecision: { type: Number, default: 1 },

  /** Set once the customer has actually been told. Separate from status so a
   *  notification that failed to send can be retried without re-running a
   *  build that already succeeded. */
  notifiedAt: { type: Date, default: null },

  /** Why a build failed, in the words the build gave. */
  error:    { type: String, default: '' },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

/** One decision per requirement per application. See the note above: this is
 *  the rail that makes repeat-building impossible rather than merely unlikely. */
capabilityRequestSchema.index({ userId: 1, blueprintId: 1, needKey: 1 }, { unique: true });

/** For the guard that allows only one build at a time per application. */
capabilityRequestSchema.index({ blueprintId: 1, status: 1 });

export default mongoose.model('CapabilityRequest', capabilityRequestSchema);
