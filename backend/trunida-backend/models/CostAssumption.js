/**
 * Svarg — the costs that are decided rather than measured
 *
 * ── Why these are separate from the ledger ─────────────────────────────────
 *
 * Model spend is metered: UsageLedger counts Svarg's own calls and
 * HostedDeployment counts each delivered application's, both per request, both
 * priced from the model catalog. Those numbers are facts.
 *
 * The rest of what an account costs is not measurable from anything this
 * system holds. What the platform cost to build, what an integration cost to
 * write, what a Railway container costs a month, what a share of one Atlas
 * cluster is worth against a particular account — every one of those is a
 * judgement, and some are a judgement about money already spent.
 *
 * Mixing the two would be the expensive mistake. A page that adds a measured
 * $0.58 to an assumed $400 and prints one total invites a price to be set from
 * a number nobody can defend, and there would be nothing on the screen to say
 * which half was which. So they are held apart, stored apart, and shown apart:
 * the finance page prints metered cost, then assumed cost, then the sum, and
 * every assumption carries the note that says who decided it and why.
 *
 * ── One document ───────────────────────────────────────────────────────────
 *
 * There is one of these, found by `key: 'default'`. Not a document per month:
 * an assumption is what you currently believe, and a history of superseded
 * beliefs is a different feature that nobody has asked for. `updatedAt` and
 * `updatedBy` are what make a change accountable, which is what was actually
 * wanted.
 *
 * Absence means every figure is zero, which shows on the page as "no
 * assumptions entered" rather than as a flattering margin. A finance page whose
 * unset state implies free is a finance page that lies by default.
 */

import mongoose from 'mongoose';

/**
 * A fixed cost the business carries, amortised over a number of months.
 *
 * `totalInr` is what it cost outright and `overMonths` is how long it is spread
 * across — so platform development at ₹12,00,000 over 36 months is ₹33,333 a
 * month, and the page can show both figures rather than only the derived one.
 * A reader who sees ₹33,333 with no idea what it came from cannot argue with
 * it, and an assumption nobody can argue with is one nobody will correct.
 *
 * overMonths of 0 or less means "not amortised — charge it all to this month",
 * which is the honest reading of a one-off that has not been spread yet.
 */
const amortisedSchema = new mongoose.Schema({
  label:      { type: String, default: '' },
  totalInr:   { type: Number, default: 0 },
  overMonths: { type: Number, default: 0 },
  note:       { type: String, default: '' },
}, { _id: false });

const costAssumptionSchema = new mongoose.Schema({
  /** One document. The key exists so the upsert has something to find. */
  key: { type: String, default: 'default', unique: true, index: true },

  /**
   * What a dollar of metered spend is worth in rupees.
   *
   * Every cost this platform meters is in USD and every price it charges is in
   * INR, so nothing can be compared without this. Default 0 would make all
   * model spend free, which is the one wrong answer that looks like a working
   * page — so it defaults to a plausible rate and the page says it is an
   * assumption, not a live quote.
   */
  inrPerUsd: { type: Number, default: 88 },

  /*
   * ── Fixed, amortised ─────────────────────────────────────────────────────
   *
   * Spread across months, then across accounts. These are the two figures the
   * owner said have to be factored in and that nothing in the system knows.
   */

  /** Building the platform itself. */
  platformDevelopment: { type: amortisedSchema, default: () => ({ label: 'Platform development' }) },

  /**
   * Writing the integrations.
   *
   * A list rather than one figure, because they were not built at once and
   * their costs are not alike — Zoho CRM is not Exotel is not WhatsApp — and a
   * single "integrations" number hides which connector is worth keeping. Each
   * amortises on its own terms.
   */
  integrations: { type: [amortisedSchema], default: () => [] },

  /*
   * ── Fixed, monthly ───────────────────────────────────────────────────────
   *
   * Recurring platform costs, in rupees a month. Shared across active accounts
   * rather than metered, because none of them can be attributed to one account
   * — every tenant is on one Atlas cluster, and the control plane is one
   * container serving all of them.
   */
  monthly: {
    /** The Atlas cluster every tenant shares. */
    atlasInr:    { type: Number, default: 0 },
    /** Svarg's own container, as distinct from a tenant's. */
    controlPlaneInr: { type: Number, default: 0 },
    /** Brevo, and anything else billed as a flat subscription. */
    brevoInr:    { type: Number, default: 0 },
    /** Domains, certificates, and the rest of the small recurring things. */
    otherInr:    { type: Number, default: 0 },
    otherNote:   { type: String, default: '' },
  },

  /*
   * ── Per account, per month ───────────────────────────────────────────────
   *
   * A cost that genuinely belongs to one account but that nothing meters. A
   * delivered application is its own Railway container, so its hosting is
   * attributable even though no number in this database records it.
   */
  perAccount: {
    /** One tenant container, per month. */
    tenantHostingInr: { type: Number, default: 0 },
    tenantHostingNote: { type: String, default: '' },
  },

  /*
   * ── Per unit ─────────────────────────────────────────────────────────────
   *
   * Metered elsewhere or not at all, but priced per event. Kept so the page can
   * show what a call recording or an email actually adds, and flag the ones
   * that are an estimate because nothing counts them yet.
   */
  perUnit: {
    /** Transcribing one call recording. */
    transcriptionInrPerCall: { type: Number, default: 0 },
    /** One transactional email. */
    emailInr:                { type: Number, default: 0 },
  },

  /** Who last changed these, so a figure can be asked about. */
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('CostAssumption', costAssumptionSchema);
