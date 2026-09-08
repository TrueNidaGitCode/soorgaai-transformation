/**
 * Svarg — sales signals
 *
 * Who to contact, and why, read from the records the product already writes.
 * No CRM and no synthetic rows: every signal here is a query over a collection
 * that exists because the product works.
 *
 * ── One board, three consumers ──────────────────────────────────────────────
 *
 * The CLI (scripts/sales_agent.mjs), the admin screen, and the model that
 * answers questions all read from collectSignals() and renderBoard(). That is
 * the point of this module existing rather than the logic living in the
 * script: an operator on a call must never be told something the screen does
 * not show, and the only way to guarantee that is for there to be one
 * definition of the board.
 *
 * ── Silence is a signal, not an absence ─────────────────────────────────────
 *
 * `live` deployments split by whether anything has queried them. A live app
 * nobody talks to is the earliest churn evidence available and the only one
 * visible before renewal — filed under the same heading as a busy deployment,
 * the one row worth acting on disappears.
 *
 * ── Repeat visitors are one lead, not many ──────────────────────────────────
 *
 * A guest who comes back four times gets four guestIds and four blueprint
 * rows. Counted as four leads that is the loudest demand signal on the board
 * misread as background noise, so unclaimed blueprints are grouped by their
 * objective text and carry a visit count.
 *
 * Read-only. Every query here is a find/lean; nothing in this module writes.
 */

import { User } from '../models/user.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import HostedDeployment from '../models/HostedDeployment.js';
import UsageLedger from '../models/UsageLedger.js';
import { generate } from './llmService.js';

const DAY = 86400000;

/** A live deployment unqueried for this long is a churn signal, not an active account. */
const QUIET_DAYS = 7;

// ── Formatting helpers ───────────────────────────────────────────────────────

export function daysAgo(date) {
  if (!date) return null;
  return (Date.now() - new Date(date).getTime()) / DAY;
}

/** Short enough to sit inside a table row. */
export function age(date) {
  const d = daysAgo(date);
  return d === null ? '—' : `${d < 1 ? d.toFixed(1) : Math.round(d)}d`;
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function usd(n) {
  return `$${(Number(n) || 0).toFixed(4)}`;
}

/** Newest first, nulls last — the order a salesperson reads in. */
function byRecency(a, b) {
  return new Date(b.at || 0) - new Date(a.at || 0);
}

/**
 * The grouping key for "is this the same prospect coming back".
 *
 * Objective text, normalised. Two visits from one person are near-identical
 * because they retype or paste the same description; two different companies
 * producing the same 60 characters is not a case worth designing around.
 */
function objectiveKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// ── Collection ───────────────────────────────────────────────────────────────

/**
 * Every signal, in one pass.
 *
 * Blueprints load once and index by id, because three of the five signals are
 * really questions about what did NOT happen next to a blueprint and would
 * otherwise each re-read the same collection.
 */
export async function collectSignals() {
  const [users, blueprints, apps, deployments, ledgers] = await Promise.all([
    User.find({}).select('_id email name createdAt').lean(),
    TransformationBlueprint.find({ archived: { $ne: true } })
      .select('_id userId guestId businessObjective status createdAt opportunityApproval')
      .lean(),
    GeneratedApplication.find({}).select('_id blueprintId userId status useCase createdAt updatedAt').lean(),
    HostedDeployment.find({}).select('_id userId blueprintId status usage railway liveAt preparedAt').lean(),
    UsageLedger.find({}).select('userId scope period calls costUsd byStage lastCallAt').lean(),
  ]);

  const emailOf = new Map(users.map(u => [String(u._id), u.email]));
  const bpById = new Map(blueprints.map(b => [String(b._id), b]));

  const appsByBp = new Map();
  for (const a of apps) appsByBp.set(String(a.blueprintId), a);

  const depByBp = new Map();
  for (const d of deployments) depByBp.set(String(d.blueprintId), d);

  const who = (doc) => emailOf.get(String(doc.userId))
    || (doc.guestId ? `guest:${String(doc.guestId).slice(0, 8)}` : 'unknown');

  // 1. Outreach — a guest got far enough to generate a blueprint and never
  //    signed up. They have already seen the product work on their own words.
  //    Grouped, because the same prospect returning is one lead.
  const unclaimed = blueprints.filter(b => b.guestId && !b.userId);
  const grouped = new Map();
  for (const b of unclaimed) {
    const key = objectiveKey(b.businessObjective) || String(b._id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        at: b.createdAt,
        firstSeen: b.createdAt,
        visits: 0,
        who: `guest:${String(b.guestId).slice(0, 8)}`,
        objective: b.businessObjective,
        completed: 0,
      });
    }
    const g = grouped.get(key);
    g.visits += 1;
    if (b.status === 'completed') g.completed += 1;
    if (new Date(b.createdAt) > new Date(g.at)) g.at = b.createdAt;
    if (new Date(b.createdAt) < new Date(g.firstSeen)) g.firstSeen = b.createdAt;
  }

  const outreach = [...grouped.values()].map(g => ({
    ...g,
    note: g.visits > 1
      ? `came back ${g.visits}× over ${age(g.firstSeen)}, ${g.completed} finished blueprint(s), never signed up`
      : (g.completed ? 'saw a finished blueprint, never signed up' : 'started, did not finish'),
  })).sort((a, b) => (b.visits - a.visits) || byRecency(a, b));

  // 2. Conversion — they approved an opportunity and never built it. The
  //    decision is already made; something after it stopped them.
  const conversion = blueprints
    .filter(b => b.opportunityApproval?.approved && !appsByBp.has(String(b._id)))
    .map(b => ({
      at: b.opportunityApproval.approvedAt || b.createdAt,
      who: who(b),
      objective: b.businessObjective,
      note: `approved ${age(b.opportunityApproval.approvedAt)} ago, no build started`,
    }))
    .sort(byRecency);

  // 3. Onboarding — the application passed every gate and was never launched.
  //    The work is done and delivering nothing.
  const onboarding = apps
    .filter(a => a.status === 'passed' && depByBp.get(String(a.blueprintId))?.status !== 'live')
    .map(a => {
      const dep = depByBp.get(String(a.blueprintId));
      return {
        at: a.updatedAt || a.createdAt,
        who: emailOf.get(String(a.userId)) || 'unknown',
        objective: a.useCase || bpById.get(String(a.blueprintId))?.businessObjective,
        note: dep ? `built, deployment stuck at "${dep.status}"` : 'built, never launched',
      };
    })
    .sort(byRecency);

  // 4. Post-sales — live, split by whether anyone actually talks to it.
  const postSales = deployments.filter(d => d.status === 'live').map(d => {
    const requests = d.usage?.requests || 0;
    const last = d.usage?.lastRequestAt;
    return {
      at: last || d.liveAt,
      who: emailOf.get(String(d.userId)) || 'unknown',
      objective: bpById.get(String(d.blueprintId))?.businessObjective,
      requests,
      costUsd: d.usage?.costUsd || 0,
      url: d.railway?.url || '',
      quiet: requests === 0 || (daysAgo(last) ?? 99) > QUIET_DAYS,
      note: requests === 0
        ? `live ${age(d.liveAt)}, never queried`
        : `${requests} queries, last ${age(last)} ago, ${usd(d.usage?.costUsd)}`,
    };
  }).sort(byRecency);

  // 5. Expansion — depth of use, by stage. Spend is the only proxy we have for
  //    how hard someone is leaning on the product.
  const expansion = ledgers
    .filter(l => (l.costUsd || 0) > 0 || (l.calls || 0) > 0)
    .map(l => {
      const stages = Object.entries(l.byStage || {})
        .map(([name, s]) => [name, s?.costUsd || 0])
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1]);
      return {
        at: l.lastCallAt,
        who: emailOf.get(String(l.userId)) || l.scope || 'unknown',
        calls: l.calls || 0,
        costUsd: l.costUsd || 0,
        stages,
        note: stages.length
          ? stages.map(([n, c]) => `${n} ${usd(c)}`).join(', ')
          : `${l.calls || 0} calls`,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    outreach,
    conversion,
    onboarding,
    postSales,
    quiet: postSales.filter(r => r.quiet),
    active: postSales.filter(r => !r.quiet),
    expansion,
    generatedAt: new Date().toISOString(),
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function section(title, stage, rows, render) {
  const head = `\n${title}  ·  ${stage}  ·  ${rows.length}`;
  if (!rows.length) return `${head}\n   (nothing)`;
  return `${head}\n${rows.map(r => `   ${render(r)}`).join('\n')}`;
}

/**
 * The board, as text.
 *
 * This exact string is what the CLI prints and what the model is given, so an
 * answer can never cite something the operator cannot see.
 */
export function renderBoard(s) {
  return [
    `SVARG SALES SIGNALS — ${new Date(s.generatedAt).toISOString().slice(0, 16).replace('T', ' ')}`,
    `${s.outreach.length} unclaimed · ${s.conversion.length} approved-not-built · `
      + `${s.onboarding.length} built-not-live · ${s.quiet.length} live-but-quiet · ${s.active.length} active`,

    section('UNCLAIMED BLUEPRINTS', 'Outreach', s.outreach,
      r => `${age(r.at).padStart(5)}  ${String(r.visits).padStart(2)}×  ${r.who.padEnd(16)} `
         + `${clip(r.objective, 56)}\n            ${r.note}`),

    section('APPROVED, NOT BUILT', 'Conversion', s.conversion,
      r => `${age(r.at).padStart(5)}  ${r.who.padEnd(28)} ${clip(r.objective, 50)}\n         ${r.note}`),

    section('BUILT, NOT LIVE', 'Onboarding', s.onboarding,
      r => `${age(r.at).padStart(5)}  ${r.who.padEnd(28)} ${clip(r.objective, 50)}\n         ${r.note}`),

    section('LIVE BUT QUIET', 'Post-sales — churn risk', s.quiet,
      r => `${age(r.at).padStart(5)}  ${r.who.padEnd(28)} ${clip(r.objective, 50)}\n         ${r.note}`),

    section('LIVE AND USED', 'Post-sales — value realised', s.active,
      r => `${age(r.at).padStart(5)}  ${r.who.padEnd(28)} ${clip(r.objective, 50)}\n         ${r.note}`),

    section('DEPTH OF USE', 'Expansion', s.expansion,
      r => `${usd(r.costUsd).padStart(9)}  ${String(r.who).padEnd(28)} ${r.calls} calls\n         ${r.note}`),
  ].join('\n');
}

// ── The agent ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
`You are a sales analyst for Svarg, an AI transformation platform. You are given
a live board of signals read from Svarg's own database, and you answer the
operator's question about it while they are actively selling.

Rules:
- Answer only from the board. It is the complete picture available.
- Name specific rows — the account or guest id, and the age. Vague advice is useless.
- When you recommend contacting someone, say what to open with, based on what
  the row shows they actually did. They got somewhere and stopped; the opener
  should reference that, not a generic pitch.
- A guest id is anonymous: there is no email. Say so rather than inventing one,
  and treat those as evidence of demand, not as a contactable lead.
- A repeat visitor (visits > 1) is one prospect, not several. Weigh them by how
  many times they came back.
- If the board does not support an answer, say what is missing. Never invent a
  row, a name, a number, or a date.
- Be brief. The operator is between calls.`;

/**
 * @param {string} board renderBoard() output — the only evidence the model gets.
 * @param {string} question
 */
export async function askBoard(board, question) {
  const { text } = await generate({
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `${board}\n\n---\nQuestion: ${question}`,
    label: 'sales-agent',
    maxTokens: 1200,
  });
  return text;
}
