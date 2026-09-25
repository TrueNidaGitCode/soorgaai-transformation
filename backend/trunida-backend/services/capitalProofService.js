/**
 * Svarg — the numbers an investor is shown, measured rather than remembered.
 *
 * ── Why this is a service and not a slide ──────────────────────────────────
 *
 * Every figure on the Capital page was typed in by hand once, from a query
 * run once, on a date printed beside it. That is honest for a day and a lie
 * by the end of the month: the watchers keep running, findings keep being
 * raised and resolved, and a deck that says 285 when the database says 400
 * has stopped being evidence and become decoration.
 *
 * So the page asks for them. Every number below is a count of something that
 * has already happened, read from the live databases at the moment somebody
 * opens the page.
 *
 * ── What it deliberately does not do ───────────────────────────────────────
 *
 * It does not project, annualise or derive a run rate. It does not report the
 * cost of BUILDING an application, because that is not measured — the usage
 * ledger holds nine rows for thirty-six blueprints, and a number that is
 * wrong by an unknown multiple is worse than an absent one. The page says so
 * in its own words; this file simply refuses to supply it.
 *
 * ── Why it reads tenant databases directly ─────────────────────────────────
 *
 * The findings live in the customer's own database, one per deployment, and
 * there is no aggregate anywhere else. Counting them is the only way to say
 * what the product has actually done. Counts only: no row, no name and no
 * customer record leaves the tenant.
 */
import mongoose from 'mongoose';

/** Deployments that have a URL are the ones somebody could actually open. */
function reachable(deployments) {
  return deployments.filter((d) => d?.railway?.url).length;
}

/** Every tenant database this cluster holds. */
async function tenantNames() {
  const admin = mongoose.connection.getClient().db().admin();
  const { databases } = await admin.listDatabases();
  return databases.map((d) => d.name).filter((n) => n.startsWith('tenant_'));
}

/**
 * What one delivered application has done, and whether anybody looked.
 *
 * Counts only. The rows behind a finding are the customer's and never leave
 * their database — which is the same rule the product itself keeps.
 */
async function tenantTotals(name, now) {
  const t = mongoose.connection.useDb(name, { useCache: true });
  const count = (c, q = {}) => t.collection(c).countDocuments(q).catch(() => 0);

  const collections = await t.db.listCollections().toArray().catch(() => []);
  const theirs = collections.map((c) => c.name).filter((c) => !c.startsWith('svarg_'));
  let rows = 0;
  for (const c of theirs) rows += await count(c);

  const seen = await t.collection('svarg_users')
    .find({ lastSeenAt: { $ne: null } }, { projection: { lastSeenAt: 1 } })
    .sort({ lastSeenAt: -1 }).limit(1).toArray()
    .catch(() => []);
  const last = seen[0]?.lastSeenAt ? new Date(seen[0].lastSeenAt).getTime() : 0;

  return {
    watchers: await count('svarg_agents'),
    findings: await count('svarg_findings'),
    resolved: await count('svarg_findings', { state: 'resolved' }),
    questions: await count('svarg_conversations'),
    hasRealRows: rows > 0,
    openedThisWeek: last > 0 && now - last < 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * How many findings anybody has actually opened.
 *
 * Read from the signals a delivered application reports, NOT from the
 * findings themselves: the application signals that somebody opened one and
 * stores no flag on the record. Counting `openedAt` on findings returns zero
 * because the field is never written, which reads as "nobody ever looked" and
 * is a measurement artefact rather than a fact. This is the only record there
 * is, and it is the one the page quotes.
 */
async function openedCount() {
  return mongoose.connection.collection('tenantsignals')
    .countDocuments({ kind: 'finding_opened' }).catch(() => 0);
}

export async function capitalProof({ now = Date.now() } = {}) {
  const db = mongoose.connection;
  const count = (c, q = {}) => db.collection(c).countDocuments(q).catch(() => 0);

  const deployments = await db.collection('hosteddeployments')
    .find({}, { projection: { 'railway.url': 1, usage: 1, limits: 1 } }).toArray().catch(() => []);

  let requests = 0;
  let spendUsd = 0;
  let busiest = 0;
  for (const d of deployments) {
    requests += d.usage?.requests || 0;
    spendUsd += Number(d.usage?.costUsd || 0);
    busiest = Math.max(busiest, Number(d.usage?.costUsd || 0));
  }

  const names = await tenantNames();
  const totals = await Promise.all(names.map((n) => tenantTotals(n, now)));
  const sum = (f) => totals.reduce((t, x) => t + (Number(f(x)) || 0), 0);

  // Which industry the funnel is actually full of, in its own words.
  const byIndustry = await db.collection('coldleads').aggregate([
    { $match: { industry: { $nin: [null, ''] } } },
    { $group: { _id: '$industry', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray().catch(() => []);

  return {
    measuredAt: new Date(now).toISOString(),

    built: {
      blueprints: await count('transformationblueprints'),
      completed: await count('transformationblueprints', { status: 'completed' }),
      applications: deployments.length,
      deployed: reachable(deployments),
      tenants: names.length,
      withRealRecords: totals.filter((t) => t.hasRealRows).length,
    },

    product: {
      watchers: sum((t) => t.watchers),
      findings: sum((t) => t.findings),
      resolved: sum((t) => t.resolved),
    },

    customers: {
      questionsAsked: sum((t) => t.questions),
      findingsOpened: await openedCount(),
      openedThisWeek: totals.filter((t) => t.openedThisWeek).length,
      accounts: await count('users'),
    },

    cost: {
      requests,
      // Four decimals: this is tens of cents, and rounding it to two would
      // print $0.00 for an application that has genuinely been running.
      spendUsd: Number(spendUsd.toFixed(4)),
      busiestUsd: Number(busiest.toFixed(4)),
      capUsd: deployments[0]?.limits?.maxCostUsd ?? null,
    },

    pipeline: {
      companies: await count('coldleads'),
      largestIndustry: byIndustry[0]?._id || '',
      largestIndustryCount: byIndustry[0]?.n || 0,
      withoutIndustry: await count('coldleads', { $or: [{ industry: null }, { industry: '' }] }),
    },
  };
}
