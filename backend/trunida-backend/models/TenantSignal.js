/**
 * Svarg — what a live application tells us about itself
 *
 * One row per signal a hosted application sends: a question was answered
 * (by which capability), a vote on an answer, a correction the owner chose to
 * write, rows arriving on a dataset. Never a question, an answer or a row —
 * the list of what can arrive is fixed on the application's side
 * (eame-template/services/tenantSignals.js) and refused here if it is not on
 * that list.
 *
 * This is what the Learner reads once the application is live, in place of
 * the conversation it can no longer see, because that conversation stays in
 * the tenant. Counts say what the customer does; corrections say what they
 * want; together they are enough to notice the next capability.
 */
import mongoose from 'mongoose';

export const SIGNAL_KINDS = ['question_asked', 'feedback', 'correction', 'import'];

const tenantSignalSchema = new mongoose.Schema({
  deploymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'HostedDeployment', required: true, index: true },
  blueprintId:  { type: mongoose.Schema.Types.ObjectId, ref: 'TransformationBlueprint', required: true, index: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  kind:        { type: String, enum: SIGNAL_KINDS, required: true },
  capability:  { type: String, default: '' },
  vote:        { type: String, enum: ['up', 'down', ''], default: '' },
  correction:  { type: String, default: '', maxlength: 1000 },
  datasetName: { type: String, default: '' },
  source:      { type: String, default: '' },
  rows:        { type: Number, default: 0 },

  /** When the application says it happened; receivedAt is when it got here. */
  at:         { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now },
}, { timestamps: false });

tenantSignalSchema.index({ blueprintId: 1, receivedAt: -1 });

export default mongoose.model('TenantSignal', tenantSignalSchema);
