/**
 * Svarg — a cold lead
 *
 * The one stage of the funnel the product cannot observe. Everything after
 * this — a guest blueprint, a signup, a live deployment, a paid plan — is a
 * record the product writes by itself. Outreach is a person deciding to email
 * someone, so it has to be typed in.
 *
 * Kept deliberately thin. This is not a CRM and should not grow into one: it
 * exists so that the top of the funnel is not a blank column, and so that a
 * cold email can be matched against a later signup. The moment it needs
 * sequences, owners or custom fields, it is the wrong tool.
 *
 * ── Conversion is detected, not recorded ────────────────────────────────────
 *
 * There is no "converted" status. Whether a lead signed up is answered by
 * looking for a User with the same email, so the two can never disagree — a
 * lead cannot sit in Outreach marked cold while the person is already paying.
 */

import mongoose from 'mongoose';

const coldLeadSchema = new mongoose.Schema({
  /**
   * Lowercased on write. The match against User.email is the only reason this
   * collection is worth having, and a case difference would silently break it.
   */
  email: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true,
    lowercase: true,
  },

  name:    { type: String, default: '', trim: true },
  company: { type: String, default: '', trim: true },

  /**
   * to-contact — on the list, not yet emailed
   * contacted  — reached out, no reply yet
   * replied    — they responded; a real conversation exists
   * dead       — explicitly not interested, kept so they are not emailed twice
   *
   * Plain String, not an enum: an enum whose default is not a member rejects
   * every document on save, which has cost this codebase days before.
   */
  status: { type: String, default: 'to-contact' },

  /** Whatever the person needs to remember before the next call. */
  note: { type: String, default: '' },

  lastContactedAt: { type: Date, default: null },

  addedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    default: null,
  },

  /**
   * The follow-up sequence.
   *
   * intervalDays and maxSends are per-lead rather than global constants
   * because the right cadence is a judgement about one prospect, and a single
   * hard-coded number is how a sensible follow-up becomes a complaint. The
   * floor on intervalDays is enforced in outreachService, not here, so the
   * limit lives next to the thing that could break the sending domain.
   */
  sequence: {
    enabled:      { type: Boolean, default: false },
    subject:      { type: String,  default: '' },
    body:         { type: String,  default: '' },
    intervalDays: { type: Number,  default: 7 },
    maxSends:     { type: Number,  default: 6 },
    sentCount:    { type: Number,  default: 0 },
    lastSentAt:   { type: Date,    default: null },

    /**
     * When the sweep may next send. Null means "not scheduled".
     *
     * The sweep claims a lead by conditionally clearing this, so two overlapping
     * runs cannot both send the same email — the cheap failure is a follow-up a
     * day late, the expensive one is the same message twice in a minute.
     */
    nextSendAt:   { type: Date,    default: null, index: true },

    /** Why the sequence stopped, in words, for the screen to show. */
    stoppedReason: { type: String, default: '' },
  },

  /**
   * Every attempt, successful or not.
   *
   * Kept on the document rather than inferred from sentCount because "did this
   * person actually receive six emails" is the question you need answered when
   * they complain, and a counter cannot answer it.
   */
  sends: {
    type: [new mongoose.Schema({
      at:      { type: Date,   default: Date.now },
      subject: { type: String, default: '' },
      ok:      { type: Boolean, default: false },
      error:   { type: String, default: '' },
      manual:  { type: Boolean, default: false },
    }, { _id: false })],
    default: [],
  },

  /**
   * Opt-out. Set by the public unsubscribe link, never by an admin.
   *
   * A cold email without a working unsubscribe is not a product decision, it is
   * a legal one, so this is checked before every send including a manual one.
   */
  unsubscribedAt: { type: Date, default: null },
  unsubscribeToken: { type: String, default: '', index: true },
}, { timestamps: true });

export default mongoose.model('ColdLead', coldLeadSchema);
