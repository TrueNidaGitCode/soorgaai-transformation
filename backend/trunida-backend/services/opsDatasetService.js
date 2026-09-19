/**
 * Svarg's own operations, as datasets an application can watch.
 *
 * Svarg is going to run itself on Svarg: one tenant, "Svarg Operations", with
 * agents watching deployments, leads and blueprints. That tenant needs Svarg's
 * own data the way any other tenant needs a Jira or a spreadsheet — as rows,
 * pulled on a schedule, through the connector machinery that already exists.
 *
 * ── Two rules this file exists to enforce ──────────────────────────────────
 *
 * ONE DEPLOYMENT MAY READ THIS. A flag on the deployment record, off by
 * default, that nothing in any API can set — only a script run by hand. The
 * gateway token that reaches here is the same kind of token every customer
 * application holds, so without that flag a compromised tenant would be able
 * to read every other customer's deployment and every lead in the pipeline.
 * The flag is the whole gate; there is no second one.
 *
 * ONLY WHAT MONITORING NEEDS. Every row is built field by field from an
 * allow-list, never spread from a document. Agents report; they do not
 * contact anybody, so a lead's email and phone do not leave — the company,
 * the lane and the state are enough to say "nine walk-ins have sat untouched
 * for a fortnight". Nothing here ever returns a token, a hash or a key.
 */
import HostedDeployment from '../models/HostedDeployment.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import ColdLead from '../models/ColdLead.js';
import { User } from '../models/user.js';
import { isRunning } from '../models/HostedDeployment.js';

export const DATASETS = ['deployments', 'leads', 'blueprints'];

const MAX_ROWS = 2000;

/** Whole days since an instant, or null when it never happened. */
function daysSince(at) {
  if (!at) return null;
  return Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
}

const iso = (d) => (d ? new Date(d).toISOString() : '');

/**
 * Every live application, and whether anybody is using it.
 *
 * The row Steward exists to read: `daysSinceUse` is the difference between a
 * customer who is getting value and one who is quietly gone, and nothing on
 * the Svarg side reports it today.
 */
async function deployments() {
  const deps = await HostedDeployment.find({}).sort({ createdAt: 1 }).limit(MAX_ROWS).lean();
  const rows = [];
  for (const d of deps) {
    const [bp, owner] = await Promise.all([
      TransformationBlueprint.findById(d.blueprintId).select('appName companyName').lean().catch(() => null),
      User.findById(d.userId).select('email').lean().catch(() => null),
    ]);
    const c = d.conformance || null;
    rows.push({
      app: bp?.appName || '(unnamed)',
      company: bp?.companyName || '',
      owner: owner?.email || '',
      status: d.status || '',
      running: isRunning(d.status) ? 'yes' : 'no',
      url: d.railway?.url || '',
      requests: d.usage?.requests ?? 0,
      lastUsed: iso(d.usage?.lastRequestAt),
      daysSinceUse: daysSince(d.usage?.lastRequestAt),
      liveAt: iso(d.liveAt),
      createdAt: iso(d.createdAt),
      conformanceRan: c?.ran ? 'yes' : 'no',
      conformancePassed: c?.passed ?? null,
      conformanceFailed: c?.failed ?? null,
      conformanceAt: iso(c?.at),
    });
  }
  return rows;
}

/**
 * The pipeline, without the people in it.
 *
 * No email, no phone, no name. An agent watching this reports that a lane has
 * gone cold; it never writes to anybody, and a copy of every prospect's
 * contact details sitting in a second database is a liability with no use.
 */
async function leads() {
  const docs = await ColdLead.find({}).sort({ createdAt: 1 }).limit(MAX_ROWS).lean();
  return docs.map((l) => ({
    company: l.company || '',
    motion: l.motion || '',
    status: l.status || '',
    industry: l.industry || '',
    location: l.location || '',
    nextStep: l.nextStep || '',
    nextStepAt: iso(l.nextStepAt),
    lastContactedAt: iso(l.lastContactedAt),
    daysSinceContact: daysSince(l.lastContactedAt),
    emailsSent: l.sequence?.sentCount ?? 0,
    createdAt: iso(l.createdAt),
  }));
}

/** What has been generated, and whether it ever became an application. */
async function blueprints() {
  const docs = await TransformationBlueprint.find({})
    .select('appName companyName industryFit createdAt userId guestId')
    .sort({ createdAt: 1 }).limit(MAX_ROWS).lean();
  const built = new Set(
    (await HostedDeployment.find({}).select('blueprintId').lean())
      .map((d) => String(d.blueprintId)),
  );
  return docs.map((b) => ({
    app: b.appName || '',
    company: b.companyName || '',
    industry: b.industryFit?.industry || '',
    industryMatched: b.industryFit?.matched ? 'yes' : 'no',
    deployed: built.has(String(b._id)) ? 'yes' : 'no',
    guest: b.guestId ? 'yes' : 'no',
    createdAt: iso(b.createdAt),
    daysOld: daysSince(b.createdAt),
  }));
}

const BUILDERS = { deployments, leads, blueprints };

/**
 * Rows for one dataset.
 *
 * @param {object} deployment  resolved from the gateway token
 * @param {string} name        one of DATASETS
 */
export async function opsRows(deployment, name) {
  // The gate. Not a role, not an allow-list of ids kept somewhere else — one
  // flag on the record, off unless somebody set it deliberately.
  if (!deployment?.internal) {
    const err = new Error('This deployment may not read Svarg operations data.');
    err.status = 403;
    throw err;
  }
  const build = BUILDERS[String(name || '')];
  if (!build) {
    const err = new Error(`Unknown dataset. One of: ${DATASETS.join(', ')}.`);
    err.status = 404;
    throw err;
  }
  return build();
}
