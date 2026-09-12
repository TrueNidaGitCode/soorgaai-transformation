/**
 * Svarg — signals from live applications
 *
 * The half of "learning from the tenant" that lives on the platform. A hosted
 * application keeps its conversations to itself and sends a short list of
 * signals here (see eame-template/services/tenantSignals.js for the list, and
 * TenantSignal.js for the row). This file accepts a batch, refuses anything
 * off the list, and turns what has arrived since the Learner last looked into
 * a block of text the Learner can read alongside the platform conversation.
 *
 * The summary is deliberately plain: counts by capability, votes, the
 * corrections verbatim. The model does the noticing; this does the counting.
 */
import TenantSignal, { SIGNAL_KINDS } from '../models/TenantSignal.js';

const MAX_BATCH = 200;
const MAX_CORRECTION = 1000;

/** One signal, as the application sent it, or null if it is not on the list. */
export function normaliseSignal(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '');
  if (!SIGNAL_KINDS.includes(kind)) return null;
  const at = raw.at ? new Date(raw.at) : now;
  const doc = {
    kind,
    capability: String(raw.capability || '').slice(0, 80),
    at: isNaN(at.getTime()) ? now : at,
  };
  if (kind === 'feedback') doc.vote = raw.vote === 'down' ? 'down' : 'up';
  if (kind === 'correction') {
    doc.correction = String(raw.correction || '').slice(0, MAX_CORRECTION).trim();
    if (!doc.correction) return null;
  }
  if (kind === 'import') {
    doc.datasetName = String(raw.datasetName || '').slice(0, 120);
    doc.source = String(raw.source || '').slice(0, 40);
    doc.rows = Math.max(0, Number(raw.rows) || 0);
  }
  return doc;
}

/**
 * Accept a batch from a deployment. Returns what was kept and what was
 * refused, so the application's log can say so; nothing here throws for a
 * bad entry, only for a bad caller.
 */
export async function acceptSignals(deployment, signals = []) {
  if (!deployment?._id || !deployment.blueprintId || !deployment.userId) throw new Error('A deployment with a blueprint and an owner is required.');
  const list = Array.isArray(signals) ? signals.slice(0, MAX_BATCH) : [];
  const now = new Date();
  const docs = [];
  let refused = 0;
  for (const raw of list) {
    const doc = normaliseSignal(raw, now);
    if (!doc) { refused++; continue; }
    docs.push({ ...doc, deploymentId: deployment._id, blueprintId: deployment.blueprintId, userId: deployment.userId, receivedAt: now });
  }
  if (docs.length) await TenantSignal.insertMany(docs, { ordered: false });
  return { kept: docs.length, refused, corrections: docs.filter(d => d.kind === 'correction').length, downvotes: docs.filter(d => d.kind === 'feedback' && d.vote === 'down').length };
}

/** Counts and corrections since `since`, shaped for a prompt. Pure over the rows. */
export function summariseSignals(rows = []) {
  const byCap = new Map();
  const votes = { up: 0, down: 0 };
  const downByCap = new Map();
  const corrections = [];
  const imports = [];
  for (const r of rows) {
    if (r.kind === 'question_asked') byCap.set(r.capability || '(unnamed)', (byCap.get(r.capability || '(unnamed)') || 0) + 1);
    else if (r.kind === 'feedback') {
      votes[r.vote === 'down' ? 'down' : 'up']++;
      if (r.vote === 'down') downByCap.set(r.capability || '(unnamed)', (downByCap.get(r.capability || '(unnamed)') || 0) + 1);
    }
    else if (r.kind === 'correction') corrections.push({ capability: r.capability, text: r.correction });
    else if (r.kind === 'import') imports.push(`${r.rows} rows onto "${r.datasetName}" from ${r.source || 'a file'}`);
  }
  const questions = [...byCap.values()].reduce((n, v) => n + v, 0);
  return { questions, byCapability: byCap, votes, downByCapability: downByCap, corrections, imports };
}

export function signalsToText(summary) {
  if (!summary || (!summary.questions && !summary.corrections.length && !summary.imports.length && !summary.votes.up && !summary.votes.down)) return '';
  const lines = ['THE LIVE APPLICATION (usage since the last pass; the conversations themselves stay with the customer)'];
  if (summary.questions) {
    const caps = [...summary.byCapability.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}: ${n}`).join(', ');
    lines.push(`Questions answered: ${summary.questions} (${caps}).`);
  }
  if (summary.votes.up || summary.votes.down) {
    const down = [...summary.downByCapability.entries()].map(([c, n]) => `${c}: ${n}`).join(', ');
    lines.push(`Votes on answers: ${summary.votes.up} up, ${summary.votes.down} down${down ? ` (down on ${down})` : ''}.`);
  }
  for (const c of summary.corrections) lines.push(`Customer correction${c.capability ? ` (${c.capability})` : ''}: "${c.text}"`);
  for (const i of summary.imports) lines.push(`Data arrived: ${i}.`);
  return lines.join('\n');
}

/**
 * What arrived for this blueprint after `since`. The Learner calls this with
 * its watermark and advances it to the newest receivedAt it was given.
 */
export async function signalsSince({ blueprintId, since = null, limit = 2000 }) {
  const q = { blueprintId };
  if (since) q.receivedAt = { $gt: since };
  const rows = await TenantSignal.find(q).sort({ receivedAt: 1 }).limit(limit).lean();
  const newest = rows.length ? rows[rows.length - 1].receivedAt : since;
  return { rows, newest };
}
