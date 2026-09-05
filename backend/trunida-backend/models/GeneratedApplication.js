/**
 * Svarg — the application Eame wrote for one blueprint
 *
 * Only the GENERATED files are stored. The fixed runtime is composed back on
 * every read, so a fix to server.js or the gateway wiring reaches applications
 * that were built before it — and a stored copy of the runtime would silently
 * pin them to the version that happened to be current on build day.
 *
 * It also keeps the document small: the generated application is tens of
 * kilobytes, the runtime is hundreds.
 *
 * ── Status is not decoration ───────────────────────────────────────────────
 *
 * A build that failed verification is kept, with its history, rather than
 * discarded. "It could not be built, and here is where it broke" is a usable
 * answer; a missing record looks like a build that was never attempted.
 */

import mongoose from 'mongoose';

const generatedFileSchema = new mongoose.Schema({
  path:    { type: String, required: true },
  content: { type: String, required: true },
}, { _id: false });

/** One verification attempt, kept so a failure can be read afterwards. */
const attemptSchema = new mongoose.Schema({
  attempt:  { type: Number, default: 0 },
  stage:    { type: String, default: '' },   // syntax | local-imports | dependencies | install | boot | smoke
  failures: { type: [String], default: [] },
  wrote:    { type: [String], default: [] },
}, { _id: false });

const generatedApplicationSchema = new mongoose.Schema({
  blueprintId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransformationBlueprint', required: true, index: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

  // building | passed | failed. Plain strings: an enum whose default is not a
  // member rejects every document on save, which cost three days once.
  status: { type: String, default: 'building' },

  // What the screen shows while it runs. Generation takes tens of seconds and
  // verification can take minutes, so a spinner alone would say nothing about
  // whether anything is happening.
  progress: {
    attempt: { type: Number, default: 0 },
    phase:   { type: String, default: '' },   // generating | verifying | failed | passed
    detail:  { type: String, default: '' },
    startedAt: { type: Date, default: null },
  },

  files: { type: [generatedFileSchema], default: [] },

  /** The furthest gate this build reached: the strongest claim that can be made. */
  verifiedTo: { type: String, default: '' },
  /** Gates deliberately not run, e.g. boot with no throwaway database. */
  skipped: { type: [String], default: [] },

  history: { type: [attemptSchema], default: [] },
  reason:  { type: String, default: '' },

  // What it was built from and by, so a bad application can be traced to the
  // brief and the model that produced it rather than re-guessed.
  useCase:  { type: String, default: '' },
  provider: { type: String, default: '' },
  warnings: { type: [String], default: [] },
}, { timestamps: true });

export default mongoose.model('GeneratedApplication', generatedApplicationSchema);
