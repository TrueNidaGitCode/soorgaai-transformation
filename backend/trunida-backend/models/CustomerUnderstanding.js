/**
 * Svarg — what the Learner has worked out about one customer
 *
 * The evolving picture: what their business is, the work they keep coming
 * back to, how they prefer it done, and what they have asked for that the
 * application cannot do yet.
 *
 * ── Why this is not CompanyContext ────────────────────────────────────────
 *
 * CompanyContext answers "who are we?" — one generated prose profile, drawn
 * from website pages the customer connected, written once and re-generated on
 * demand. This answers "what do they keep telling us?" — accumulated from
 * conversation, never rewritten from scratch, and carrying counts and dates
 * because a need mentioned three times over a month is a different signal from
 * one mentioned once in passing. Merging the two would lose that.
 *
 * ── Nothing here is ever replaced ─────────────────────────────────────────
 *
 * Every list grows by merge: a repeated observation bumps `mentions` and
 * `lastSeenAt` rather than appending a near-duplicate, and nothing is dropped
 * because a later extraction failed to mention it. A model that returns a
 * short answer on a bad day must not be able to erase a month of learning,
 * which is exactly what "replace the document with the latest extraction"
 * would do.
 *
 * ── Watermarks are what keep this affordable ──────────────────────────────
 *
 * Learning re-reads nothing. Each thread records how many turns have been
 * folded in, so a conversation costs one extraction over the new turns and
 * never the whole history again.
 */

import mongoose from 'mongoose';

/**
 * One thing we believe about the customer.
 *
 * `mentions` and the two dates are the whole reason this is a document rather
 * than a line of prose: they let the Learner tell a passing remark from a
 * standing requirement without asking a model to re-judge it every time.
 */
const observationSchema = new mongoose.Schema({
  text:        { type: String, required: true },
  mentions:    { type: Number, default: 1 },
  firstSeenAt: { type: Date,   default: Date.now },
  lastSeenAt:  { type: Date,   default: Date.now },
}, { _id: false });

/**
 * Something the customer wants that the application does not do yet.
 *
 * Carries the blueprint it was said against, because a need belongs to an
 * application even though the understanding belongs to the customer.
 *
 * `status` is deliberately inert at this stage. Phase 2 only notices and
 * remembers; deciding to act on one of these is the next piece of work, and
 * writing the field now means that piece does not have to migrate every
 * document that already exists.
 */
const needSchema = new mongoose.Schema({
  text:        { type: String, required: true },
  blueprintId: { type: String, default: '' },
  mentions:    { type: Number, default: 1 },
  firstSeenAt: { type: Date,   default: Date.now },
  lastSeenAt:  { type: Date,   default: Date.now },

  // noticed — seen and recorded, no decision taken (everything starts here)
  // planned | building | ready | live — owned by later phases
  // dismissed — the customer said no, or it turned out to be a misreading
  status:      { type: String, default: 'noticed' },
}, { _id: false });

/** How far the Learner has read one conversation thread. */
const watermarkSchema = new mongoose.Schema({
  threadId:  { type: String, required: true },
  turnsSeen: { type: Number, default: 0 },
}, { _id: false });

const customerUnderstandingSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true,
    index:    true,
  },

  /** A few sentences, rewritten as it sharpens. The one field that IS
   *  replaced rather than merged — it is a summary, and a summary that only
   *  ever grows stops being one. */
  business: { type: String, default: '' },

  recurringTasks: { type: [observationSchema], default: [] },
  preferences:    { type: [observationSchema], default: [] },
  needs:          { type: [needSchema],        default: [] },

  watermarks: { type: [watermarkSchema], default: [] },
  /** The newest live-application signal the Learner has read (tenantSignalService). */
  signalsReadAt: { type: Date, default: null },

  /** Accounting, so a runaway learner is visible rather than merely expensive. */
  lastLearnedAt: { type: Date,   default: null },
  learnCount:    { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('CustomerUnderstanding', customerUnderstandingSchema);
