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
}, { timestamps: true });

export default mongoose.model('ColdLead', coldLeadSchema);
