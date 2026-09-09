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

  /**
   * How this conversation started — see services/gtmMotions.js.
   *
   * The collection is still named ColdLead because that is what it was when
   * cold email was the only motion with machinery behind it. It isn't any more:
   * a warm introduction, a design partner and a workshop attendee are all
   * someone you are working toward a first real conversation with, and they all
   * need the same row. Renaming a live collection to fix a name is not worth
   * the migration.
   *
   * Plain String with validation in the service, not an enum. An enum whose
   * default is not a member rejects every document on save — the same trap the
   * status field above already documents.
   */
  motion: { type: String, default: 'cold-email', index: true },

  /**
   * The route in, meaning whatever `via` means for THIS motion: who is making
   * the introduction, which firm is bringing the relationship, which event,
   * which post, which existing account.
   *
   * One shared field with a per-motion label rather than nine bespoke ones.
   * Nine columns that are each null eight times out of nine is how a thin
   * record becomes the CRM this file exists to avoid being.
   */
  via: { type: String, default: '', trim: true },

  /**
   * What has to happen next, and when.
   *
   * The cold-email lane has a machine that knows when to act again —
   * sequence.nextSendAt below. Every other motion has a person who has to
   * remember, and a motion whose next step lives only in someone's head is
   * indistinguishable on this screen from one that has stalled. These two
   * fields are the human equivalent of that schedule, and they are why the
   * other lanes can be tracked at all.
   */
  nextStep:   { type: String, default: '', trim: true },
  nextStepAt: { type: Date,   default: null },

  /**
   * The function you are approaching, not their job title.
   *
   * The go-to-market is bottom-up: a power user shows up inside a company,
   * and the outreach that follows goes to whoever holds budget for their
   * department. What matters is therefore which FUNCTION was approached at
   * an organisation — engineering, marketing, sales — because that decides
   * the proposition, and because approaching the same function twice at one
   * company is a mistake you can only see if it was recorded.
   *
   * Free text with suggestions rather than an enum: titles vary wildly, and
   * a lead nobody can file under the available options gets filed wrongly.
   */
  role: { type: String, default: '', trim: true },
  company: { type: String, default: '', trim: true },

  /**
   * Where to read about them before writing.
   *
   * companyUrl is fetched at generation time so the email can name something
   * true about the business rather than something plausible about its
   * industry. linkedinUrl is stored for the human to open — it is not
   * fetched, because LinkedIn does not serve its pages to servers and a
   * scraper that quietly returns a login wall would ground the email in
   * nothing while looking like it worked.
   */
  companyUrl:  { type: String, default: '', trim: true },
  linkedinUrl: { type: String, default: '', trim: true },

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

  /** Whatever the person needs to remember before the next call. Never sent. */
  note: { type: String, default: '' },

  /**
   * The one paragraph that is about THIS organisation, dropped into the shared
   * template wherever {{context}} appears.
   *
   * Split from the body so the generic ninety percent is written once and the
   * specific ten percent is the only thing typed per lead. That ratio is also
   * the honest one: everything else in a cold email is framing any founder
   * could send, and the line about their business is the only reason to reply.
   */
  orgContext: { type: String, default: '' },

  /**
   * Two other subject lines the writer produced, each on a different angle.
   *
   * Stored so changing the subject is a click rather than a regeneration. The
   * operator knows which framing lands in their market; re-rolling the whole
   * email to change six words throws away a paragraph that was already right.
   */
  subjectAlternates: { type: [String], default: [] },

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

  /**
   * The code in this lead's tracked link, so a click that turns into a guest
   * blueprint can be traced back to the email that caused it.
   *
   * Without it, outreach and discovery are two lists that never meet: a
   * prospect who reads the email, visits, and generates a blueprint arrives as
   * an anonymous guest indistinguishable from a stranger, and the one thing
   * worth knowing — that the email worked — is the thing that is lost.
   *
   * Separate from unsubscribeToken on purpose. That one appears in a footer
   * everyone can see and is a destructive action; this one is shared in the
   * body of the mail. One should never be guessable from the other.
   */
  refCode: { type: String, default: '', index: true },
}, { timestamps: true });

export default mongoose.model('ColdLead', coldLeadSchema);
