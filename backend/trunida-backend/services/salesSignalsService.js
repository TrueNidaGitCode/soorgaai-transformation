/**
 * Svarg — the sales funnel
 *
 * Five stages, in the order a customer actually moves through them:
 *
 *   1 Outreach    a cold email you decided to send        (typed in)
 *   2 Discovery   an anonymous guest generated a blueprint (observed)
 *   3 Conversion  they signed up                           (observed)
 *   4 Onboarding  they launched a live application         (observed)
 *   5 Sales       they are on a paid plan                  (observed)
 *
 * Only stage 1 has to be entered by hand. Everything after it is a record the
 * product already writes, which is the whole reason this board can be trusted
 * while dialling: four of the five stages cannot be wrong without the product
 * itself being wrong.
 *
 * ── An account appears once, at its furthest stage ──────────────────────────
 *
 * Someone running a live application has also signed up, and listing them in
 * both makes every count a lie — five stages summing to more than the number
 * of real people. Each account is placed at the furthest stage it has reached
 * and appears nowhere else, so the five counts are a funnel that adds up.
 *
 * ── Conversion is detected, never recorded ──────────────────────────────────
 *
 * A cold lead leaves Outreach when a User exists with the same email, not when
 * somebody remembers to tick a box. The two can therefore never disagree.
 *
 * ── What the product cannot tell you ────────────────────────────────────────
 *
 * A guest blueprint has no email and never will. IP is captured from the day
 * guestMeta shipped and is the only way to tell one company returning from
 * several unrelated visitors — blueprints older than that field have none, and
 * a missing IP means unknown, never "same as another missing IP".
 *
 * Read-only apart from the cold-lead helpers at the bottom.
 */

import { User } from '../models/user.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import HostedDeployment from '../models/HostedDeployment.js';
import UsageLedger from '../models/UsageLedger.js';
import AccountPlan from '../models/AccountPlan.js';
import ColdLead from '../models/ColdLead.js';
import { generate } from './llmService.js';

const DAY = 86400000;

/** A live deployment unqueried for this long is a churn signal, not an active account. */
const QUIET_DAYS = 7;

export const STAGES = ['outreach', 'discovery', 'conversion', 'onboarding', 'sales'];

// ── Formatting helpers ───────────────────────────────────────────────────────

export function daysAgo(date) {
  if (!date) return null;
  return (Date.now() - new Date(date).getTime()) / DAY;
}

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

export async function collectSignals() {
  const [users, blueprints, apps, deployments, ledgers, plans, leads] = await Promise.all([
    User.find({}).select('_id email name role createdAt').lean(),
    TransformationBlueprint.find({ archived: { $ne: true } })
      .select('_id userId guestId guestMeta businessObjective status createdAt opportunityApproval')
      .lean(),
    GeneratedApplication.find({}).select('_id blueprintId userId status useCase createdAt updatedAt').lean(),
    HostedDeployment.find({}).select('_id userId blueprintId status usage railway liveAt preparedAt').lean(),
    UsageLedger.find({}).select('userId scope calls costUsd byStage lastCallAt').lean(),
    AccountPlan.find({}).select('userId plan status currentPeriodEnd updatedAt').lean(),
    ColdLead.find({}).lean(),
  ]);

  const emailOf   = new Map(users.map(u => [String(u._id), u.email]));
  const bpById    = new Map(blueprints.map(b => [String(b._id), b]));
  const planOf    = new Map(plans.map(p => [String(p.userId), p]));
  const ledgerOf  = new Map(ledgers.map(l => [String(l.userId), l]));
  const knownEmails = new Set(users.map(u => String(u.email || '').toLowerCase()));

  const appsByBp = new Map(apps.map(a => [String(a.blueprintId), a]));
  const depByBp  = new Map(deployments.map(d => [String(d.blueprintId), d]));

  // Per-account rollups, so each stage decision is a lookup rather than a scan.
  const bpsByUser = new Map();
  for (const b of blueprints) {
    if (!b.userId) continue;
    const k = String(b.userId);
    if (!bpsByUser.has(k)) bpsByUser.set(k, []);
    bpsByUser.get(k).push(b);
  }

  const liveByUser = new Map();
  for (const d of deployments) {
    if (d.status !== 'live') continue;
    const k = String(d.userId);
    if (!liveByUser.has(k)) liveByUser.set(k, []);
    liveByUser.get(k).push(d);
  }

  // ── 1. Outreach — cold emails, minus anyone who has since signed up ────────
  const outreach = leads
    .filter(l => !knownEmails.has(String(l.email || '').toLowerCase()))
    .map(l => ({
      id: String(l._id),
      at: l.lastContactedAt || l.createdAt,
      email: l.email,
      name: l.name || '',
      company: l.company || '',
      status: l.status || 'to-contact',
      note: l.note || '',
      addedAt: l.createdAt,
      lastContactedAt: l.lastContactedAt,
      unsubscribedAt: l.unsubscribedAt || null,
      sequence: {
        enabled:      !!l.sequence?.enabled,
        subject:      l.sequence?.subject || '',
        body:         l.sequence?.body || '',
        intervalDays: l.sequence?.intervalDays ?? 7,
        maxSends:     l.sequence?.maxSends ?? 6,
        sentCount:    l.sequence?.sentCount || 0,
        lastSentAt:   l.sequence?.lastSentAt || null,
        nextSendAt:   l.sequence?.nextSendAt || null,
        stoppedReason: l.sequence?.stoppedReason || '',
      },
      // Only failures are carried to the screen. A list of successful sends is
      // just the counter again; a failed one is the thing you must act on.
      lastError: [...(l.sends || [])].reverse().find(s => !s.ok)?.error || '',
    }))
    .sort(byRecency);

  // Leads that did sign up — not a stage, but the only proof outreach works.
  const converted = leads
    .filter(l => knownEmails.has(String(l.email || '').toLowerCase()))
    .map(l => ({ id: String(l._id), email: l.email, company: l.company || '', at: l.createdAt }));

  // ── 2. Discovery — anonymous guests, grouped into one row per prospect ─────
  const unclaimed = blueprints.filter(b => b.guestId && !b.userId);
  const grouped = new Map();
  for (const b of unclaimed) {
    const key = objectiveKey(b.businessObjective) || String(b._id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        at: b.createdAt, firstSeen: b.createdAt, visits: 0, completed: 0,
        who: `guest:${String(b.guestId).slice(0, 8)}`,
        objective: b.businessObjective,
        ips: new Set(), userAgents: new Set(), referers: new Set(),
      });
    }
    const g = grouped.get(key);
    g.visits += 1;
    if (b.status === 'completed') g.completed += 1;
    if (b.guestMeta?.ip) g.ips.add(b.guestMeta.ip);
    if (b.guestMeta?.userAgent) g.userAgents.add(b.guestMeta.userAgent);
    if (b.guestMeta?.referer) g.referers.add(b.guestMeta.referer);
    if (new Date(b.createdAt) > new Date(g.at)) g.at = b.createdAt;
    if (new Date(b.createdAt) < new Date(g.firstSeen)) g.firstSeen = b.createdAt;
  }

  const discovery = [...grouped.values()].map(g => {
    const ips = [...g.ips];
    return {
      ...g,
      ips,
      // Said explicitly rather than left as an empty cell: a blank IP column
      // reads as "different visitor" when it actually means "not recorded".
      ipLabel: ips.length ? ips.join(', ') : 'not recorded',
      userAgents: [...g.userAgents],
      referers: [...g.referers],
      note: g.visits > 1
        ? `came back ${g.visits}× over ${age(g.firstSeen)}, ${g.completed} finished, never signed up`
        : (g.completed ? 'saw a finished blueprint, never signed up' : 'started, did not finish'),
    };
  }).sort((a, b) => (b.visits - a.visits) || byRecency(a, b));

  // ── 3-5. Every account, placed at the furthest stage it has reached ────────
  const conversion = [];
  const onboarding = [];
  const sales = [];

  for (const u of users) {
    if (u.role === 'admin') continue; // staff are not prospects

    const uid  = String(u._id);
    const plan = planOf.get(uid);
    const live = liveByUser.get(uid) || [];
    const bps  = bpsByUser.get(uid) || [];
    const ledger = ledgerOf.get(uid);

    const base = {
      id: uid,
      email: u.email,
      name: u.name || '',
      signedUpAt: u.createdAt,
      blueprints: bps.length,
      spendUsd: ledger?.costUsd || 0,
      calls: ledger?.calls || 0,
    };

    // Stage 5 — a paid plan. Nothing is above this.
    if (plan && plan.plan && plan.plan !== 'hobby') {
      sales.push({
        ...base,
        at: plan.updatedAt || u.createdAt,
        plan: plan.plan,
        planStatus: plan.status || 'active',
        currentPeriodEnd: plan.currentPeriodEnd || null,
        note: `${plan.plan}${plan.status && plan.status !== 'active' ? ` (${plan.status})` : ''}`
            + `${plan.currentPeriodEnd ? `, renews ${new Date(plan.currentPeriodEnd).toISOString().slice(0, 10)}` : ''}`,
      });
      continue;
    }

    // Stage 4 — something of theirs is live.
    if (live.length) {
      const requests = live.reduce((n, d) => n + (d.usage?.requests || 0), 0);
      const last = live.map(d => d.usage?.lastRequestAt).filter(Boolean).sort().pop();
      const quiet = requests === 0 || (daysAgo(last) ?? 99) > QUIET_DAYS;
      onboarding.push({
        ...base,
        at: last || live[0].liveAt,
        liveCount: live.length,
        requests,
        quiet,
        url: live[0].railway?.url || '',
        objective: bpById.get(String(live[0].blueprintId))?.businessObjective || '',
        note: requests === 0
          ? `live ${age(live[0].liveAt)}, never queried — nobody is using it`
          : `${requests} queries, last ${age(last)} ago${quiet ? ' — going quiet' : ''}`,
      });
      continue;
    }

    // Stage 3 — signed up, nothing live yet. The blocker is the useful part.
    const approvedNotBuilt = bps.filter(b => b.opportunityApproval?.approved && !appsByBp.has(String(b._id)));
    const builtNotLive = bps.filter(b => {
      const app = appsByBp.get(String(b._id));
      return app?.status === 'passed' && depByBp.get(String(b._id))?.status !== 'live';
    });

    let note;
    if (builtNotLive.length)          note = 'application built and passed, never launched';
    else if (approvedNotBuilt.length) note = `approved an opportunity ${age(approvedNotBuilt[0].opportunityApproval.approvedAt)} ago, no build started`;
    else if (bps.length)              note = `${bps.length} blueprint(s), no application yet`;
    else                              note = 'signed up, never generated a blueprint';

    conversion.push({
      ...base,
      at: bps[0]?.createdAt || u.createdAt,
      blocker: builtNotLive.length ? 'not-launched' : (approvedNotBuilt.length ? 'not-built' : ''),
      objective: bps[0]?.businessObjective || '',
      note,
    });
  }

  conversion.sort(byRecency);
  onboarding.sort(byRecency);
  sales.sort(byRecency);

  return {
    outreach, discovery, conversion, onboarding, sales,
    converted,
    counts: {
      outreach: outreach.length, discovery: discovery.length, conversion: conversion.length,
      onboarding: onboarding.length, sales: sales.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function section(n, title, hint, rows, render) {
  const head = `\n${n}. ${title.toUpperCase()}  ·  ${hint}  ·  ${rows.length}`;
  if (!rows.length) return `${head}\n   (nothing)`;
  return `${head}\n${rows.map(r => `   ${render(r)}`).join('\n')}`;
}

/**
 * The board, as text — what the CLI prints and what the model is given, so an
 * answer can never cite something the operator cannot see.
 */
export function renderBoard(s) {
  const c = s.counts;
  return [
    `SVARG SALES FUNNEL — ${new Date(s.generatedAt).toISOString().slice(0, 16).replace('T', ' ')}`,
    `outreach ${c.outreach} → discovery ${c.discovery} → conversion ${c.conversion} `
      + `→ onboarding ${c.onboarding} → sales ${c.sales}`,
    `(each account appears once, at the furthest stage it has reached)`,

    section(1, 'Outreach', 'cold emails you are working', s.outreach,
      r => `${age(r.at).padStart(5)}  ${String(r.status).padEnd(11)} ${r.email.padEnd(32)} `
         + `${clip(r.company, 24)}${r.note ? `\n         ${clip(r.note, 90)}` : ''}`),

    section(2, 'Discovery', 'anonymous guests — no email exists for these', s.discovery,
      r => `${age(r.at).padStart(5)}  ${String(r.visits).padStart(2)}×  ${r.who.padEnd(16)} `
         + `${clip(r.objective, 52)}\n            ip: ${r.ipLabel}\n            ${r.note}`),

    section(3, 'Conversion', 'signed up, nothing live yet', s.conversion,
      r => `${age(r.at).padStart(5)}  ${r.email.padEnd(32)} ${clip(r.objective, 40)}\n         ${r.note}`),

    section(4, 'Onboarding', 'running a live application', s.onboarding,
      r => `${age(r.at).padStart(5)}  ${r.email.padEnd(32)} ${clip(r.objective, 40)}\n         ${r.note}`),

    section(5, 'Sales', 'on a paid plan', s.sales,
      r => `${age(r.at).padStart(5)}  ${r.email.padEnd(32)} ${r.note}`),

    s.converted.length
      ? `\nCONVERTED FROM OUTREACH · ${s.converted.length}\n`
        + s.converted.map(r => `   ${r.email}${r.company ? ` (${r.company})` : ''}`).join('\n')
      : '',
  ].filter(Boolean).join('\n');
}

// ── The agent ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
`You are Nole, the sales analyst for Svarg, an AI transformation platform. You
are given a live five-stage funnel read from Svarg's own database, and you
answer the operator's question about it while they are actively selling.

The stages are Outreach (cold emails, typed in by hand), Discovery (anonymous
guests who generated a blueprint), Conversion (signed up), Onboarding (running
a live application) and Sales (on a paid plan). Each account appears once, at
the furthest stage it has reached.

Rules:
- Answer only from the board. It is the complete picture available.
- Name specific rows — the email or guest id, and the age. Vague advice is useless.
- When you recommend contacting someone, say what to open with, based on what
  the row shows they actually did. They got somewhere and stopped; the opener
  should reference that, not a generic pitch.
- Discovery rows are anonymous: there is no email behind a guest id. Say so
  rather than inventing one, and treat them as evidence of demand, not as
  contactable leads. An IP of "not recorded" means the visit predates IP
  capture — it does NOT mean it is the same visitor as another blank one.
- A repeat visitor (visits > 1) is one prospect, not several. Weigh them by how
  many times they came back.
- If the board does not support an answer, say what is missing. Never invent a
  row, a name, a number, or a date.
- Be brief. The operator is between calls.

Write in PLAIN TEXT. The chat panel renders your reply literally, so markdown
does not become formatting — it becomes visible punctuation. No asterisks for
bold, no backticks around addresses, no # headings, no markdown tables. Use
short paragraphs, and a plain "- " where you need a list.`;

/**
 * @param {string} board renderBoard() output — the only evidence the model gets.
 * @param {string} question
 * @param {Array<{role: string, text: string}>} history
 *   Earlier turns, so "what about the second one" means something. Replayed as
 *   plain text rather than provider message roles because generate() takes a
 *   single user message, and because the board — not the transcript — has to
 *   stay the authority on facts.
 */
export async function askBoard(board, question, history = []) {
  const transcript = history
    .slice(-8) // enough for a follow-up to make sense, short enough to stay cheap
    .map(t => `${t.role === 'user' ? 'Operator' : 'Nole'}: ${String(t.text).slice(0, 1500)}`)
    .join('\n');

  const userMessage = transcript
    ? `${board}\n\n---\nEarlier in this conversation:\n${transcript}\n\n---\nOperator: ${question}`
    : `${board}\n\n---\nOperator: ${question}`;

  const { text } = await generate({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    label: 'sales-agent',
    maxTokens: 1200,
  });
  return text;
}

// ── Cold leads (the only writes in this module) ──────────────────────────────

const LEAD_STATUSES = ['to-contact', 'contacted', 'replied', 'dead'];

export async function addLead({ email, name, company, note, subject, body, addedByUserId }) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) throw new Error('A valid email is required.');

  // Upsert rather than reject: re-adding someone you already have should show
  // you the row you already have, not an error you have to read and dismiss.
  return ColdLead.findOneAndUpdate(
    { email: clean },
    {
      $setOnInsert: { email: clean, status: 'to-contact', addedByUserId: addedByUserId || null },
      $set: {
        ...(name    !== undefined ? { name:    String(name).trim() }    : {}),
        ...(company !== undefined ? { company: String(company).trim() } : {}),
        ...(note    !== undefined ? { note:    String(note).trim() }    : {}),
        // Written straight onto the sequence so one form can add the person
        // and the message together. `enabled` is untouched — adding a lead
        // never starts a sequence; sending is always an explicit press.
        ...(subject !== undefined ? { 'sequence.subject': String(subject).slice(0, 300) }   : {}),
        ...(body    !== undefined ? { 'sequence.body':    String(body).slice(0, 10000) }    : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function updateLead(id, { status, note, name, company, markContacted }) {
  const set = {};
  if (status !== undefined) {
    if (!LEAD_STATUSES.includes(status)) throw new Error(`Unknown status "${status}".`);
    set.status = status;
    // Marking someone contacted without recording when is how a list turns
    // into a list of people you are not sure you emailed.
    if (status === 'contacted') set.lastContactedAt = new Date();
  }
  if (note    !== undefined) set.note    = String(note).trim();
  if (name    !== undefined) set.name    = String(name).trim();
  if (company !== undefined) set.company = String(company).trim();
  if (markContacted) set.lastContactedAt = new Date();

  if (!Object.keys(set).length) throw new Error('Nothing to update.');

  const doc = await ColdLead.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
  if (!doc) throw new Error('Lead not found.');
  return doc;
}

export async function deleteLead(id) {
  const r = await ColdLead.deleteOne({ _id: id });
  if (!r.deletedCount) throw new Error('Lead not found.');
  return true;
}
