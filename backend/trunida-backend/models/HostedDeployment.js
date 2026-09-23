/**
 * Svarg — Hosted Deployment
 *
 * One customer AI application running on Svarg's infrastructure: the record
 * of where it lives, what it is allowed to spend, and what it has spent.
 *
 * Two things deliberately are NOT stored in plaintext:
 *  - `gatewayTokenHash` — the token the deployed app authenticates with. It
 *    is shown once at provisioning time and only its SHA-256 is kept, so a
 *    database leak cannot be replayed against the gateway.
 *  - provider API keys — they are never handed to the tenant at all. The
 *    deployed app talks to Svarg's gateway, which holds the real keys. That
 *    is what makes `usage` below trustworthy: there is no path from the
 *    tenant to a provider that bypasses this record.
 */

import mongoose from 'mongoose';

const hostedDeploymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true,
  },
  blueprintId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'TransformationBlueprint',
    required: true, unique: true, index: true,
  },

  // Where the application will run. Arth decides this; Svarg-hosted is the
  // only environment Svarg prepares today. 'self' is a real choice, not a
  // placeholder — it means Eame ships deployment docs and Svarg prepares
  // nothing, which is the honest outcome rather than a disabled button.
  hosting: {
    type: String,
    enum: ['svarg', 'self'],
    default: 'svarg',
  },

  // prepared: the environment exists but no application is attached to it.
  // That state is the whole point of Arth owning preparation — it can be
  // reached before Eame has written anything.
  status: {
    type: String,
    /*
     * 'degraded' is serving but says it is not well — the application's own
     * /api reports a missing database, unreadable datasets or no model. It is
     * distinct from 'failed', which never started, and from 'live', which is
     * what a crashed application used to be called for a week.
     *
     * updateOne skips validators, so an out-of-enum status writes cleanly and
     * then fails on the next save() of the document.
     */
    enum: ['queued', 'preparing', 'prepared', 'attaching', 'live', 'degraded', 'failed', 'suspended', 'destroyed'],
    default: 'queued',
    index: true,
  },
  statusMessage: { type: String, default: '' },

  // Where it runs. Empty until the deploy target reports back.
  railway: {
    projectId:     { type: String, default: '' },
    // Checked by assertDestroyable before any delete — a project without the
    // tenant prefix is refused, so this is a safety field, not a label.
    projectName:   { type: String, default: '' },
    serviceId:     { type: String, default: '' },
    environmentId: { type: String, default: '' },
    region:        { type: String, default: '' },
    url:           { type: String, default: '' },
  },

  // Tenant database on the shared Atlas cluster. Logical isolation — shape A
  // is aimed at startups; physical isolation is what a dedicated project buys.
  dbName: { type: String, default: '' },

  // What Railway deploys from — the repo Eame already pushed to.
  repo: {
    owner: { type: String, default: '' },
    name:  { type: String, default: '' },
  },

  // SHA-256 of the bearer token the deployed app presents to the gateway.
  gatewayTokenHash: { type: String, default: '', index: true },
  /**
   * The owner key's hash. The key unlocks the application's Data page --
   * importing the customer's own records, connecting their sources -- and is
   * issued at go-live, injected into the tenant as APP_OWNER_KEY, shown once,
   * and never stored in plaintext here. The public session that opens the
   * chat cannot reach any of that.
   */
  /*
   * Whether this deployment is held to its plan’s coverage limits.
   *
   * Set when a deployment is attached, never inferred. An application that
   * launched before coverage existed keeps watching everything it already
   * watches: the alternative was three of Vesoma’s five business areas going
   * dark on a restart, with nobody told.
   */
  coverageEnforced: { type: Boolean, default: false },

  ownerKeyHash: { type: String, default: '' },

  // Snapshot of the Arth decision, as env vars were derived from it. Kept
  // because the catalog can change and the deployment should still explain
  // what it was built to run on.
  model: {
    modelId:     { type: String, default: '' },
    displayName: { type: String, default: '' },
    providerId:  { type: String, default: '' },
  },

  // Metered at the gateway, incremented atomically per request.
  usage: {
    requests:     { type: Number, default: 0 },
    inputTokens:  { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    costUsd:      { type: Number, default: 0 },
    periodStart:  { type: Date,   default: Date.now },
    lastRequestAt:{ type: Date,   default: null },
  },

  // The ceiling. Svarg's own API keys are behind the gateway, so without this
  // a runaway loop in a tenant's app bills Svarg with no limit.
  limits: {
    maxCostUsd:   { type: Number, default: 5 },
    maxRequests:  { type: Number, default: 20000 },
  },

  /*
   * What the AI conformance checks last found in this application.
   *
   * Governance & Ethics as a check rather than a chapter: the suite runs real
   * questions through the delivered application's own pipeline against the
   * customer's own data, and this is where the verdict is kept so a screen can
   * show it without paying to re-run it.
   *
   * Absent means never run, which a screen must say rather than read as a
   * pass. Strict: false so the shape can grow a check without a migration.
   */
  /**
   * May this application read Svarg's own operations data?
   *
   * For the one tenant Svarg runs itself on. The gateway token that reaches
   * the ops endpoint is the same kind every customer application holds, so
   * without this flag a compromised tenant could read every other customer's
   * deployment and the whole pipeline. It is set by a script run by hand and
   * by nothing else — no API writes it, which is what makes it a gate rather
   * than a field.
   */
  internal: { type: Boolean, default: false },

  /**
   * How many messages this application has had Svarg send its owner today.
   *
   * On the deployment rather than in memory: a restart must not hand somebody
   * a fresh allowance, and a loop inside a tenant must not become a mailing.
   */
  notify: {
    day:    { type: String, default: '' },
    count:  { type: Number, default: 0 },
    lastAt: { type: Date,   default: null },
  },

  conformance: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },

  preparedAt:      { type: Date,   default: null },
  liveAt:          { type: Date,   default: null },
  suspendedAt:     { type: Date,   default: null },
  suspendedReason: { type: String, default: '' },

}, { timestamps: true });

/**
 * Is there an application answering at this address right now?
 *
 * 'degraded' was added the day the health check learned to say no, and it
 * means SERVING BUT UNWELL — the address answers, the customer can open it,
 * and its own /api reports something missing. It is not 'failed', which never
 * started, and not 'attaching', which is not answering yet.
 *
 * Every existing reader asked `status === 'live'` and so read a degraded
 * application as no application at all. That is a different lie from the one
 * degraded was introduced to stop, and a worse one for the reader who is
 * looking at a customer actively using the thing: the sales board showed
 * nobody onboarding, and the customer's own screen would have stopped offering
 * them the link to an application that works.
 *
 * So: one predicate, imported. A seventh reader added later gets the answer
 * right by asking the same question, which is the part that kept going wrong.
 */
export const RUNNING = ['live', 'degraded'];
export const isRunning = (status) => RUNNING.includes(status);

/**
 * Is the customer's application answering requests right now?
 *
 * Not the same question as isRunning, and the difference is a status that
 * lasts minutes and happens to every application whenever Svarg restarts.
 *
 * A redeploy sets the status to 'attaching' while the new container comes up —
 * and the old one goes on serving the whole time. An application that has been
 * live before and is now attaching is, from the customer's side, simply up.
 *
 * Reading only the status made the funnel say nobody had launched anything
 * every time the update sweep ran. An application that has NEVER been live is
 * a different case: attaching there is a first launch, and nothing is serving
 * yet, which is why this asks for liveAt rather than trusting the status alone.
 *
 * Use this for "is this customer live". Use isRunning for "is it safe to run
 * something against it", where mid-deploy is exactly when it is not.
 */
export const isServing = (deployment) =>
  isRunning(deployment?.status)
  || (deployment?.status === 'attaching' && !!deployment?.liveAt);

export default mongoose.models.HostedDeployment || mongoose.model('HostedDeployment', hostedDeploymentSchema);
