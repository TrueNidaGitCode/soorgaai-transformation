/**
 * The conversation, kept here.
 *
 * Every question this application answers is recorded in its own database
 * (svarg_conversations), with the answer, so the owner can read back what
 * was asked and the application has its own history to draw on. None of it
 * is sent to Svarg: what leaves is a count (tenantSignals.js).
 *
 * ── How a turn is caught ───────────────────────────────────────────────────
 *
 * The application's own routes are written per use case, so their shapes
 * differ; the one thing every one of them has is a POST taking { message }
 * that answers it (that is the contract the generator writes to). turnMiddleware
 * watches every /api/ POST for that shape, lets the handler answer, and then
 * records the question with whatever text the reply carried. It never changes
 * the reply and never delays it: the record is written after the response
 * has gone.
 *
 * The runtime's own routes (session, data, connectors, signals, agents) are
 * not conversations and are skipped by path.
 */
import mongoose from 'mongoose';
import { sendSignal } from './tenantSignals.js';

const SKIP = /^\/api\/(session|data|connectors|signals|agents)(\/|$)/;
const MAX_TEXT = 4000;

export function turnsCollection() {
  return mongoose.connection.collection('svarg_conversations');
}

export function feedbackCollection() {
  return mongoose.connection.collection('svarg_feedback');
}

/** The capability that answered: the first path segment after /api/. */
export function capabilityOf(path) {
  // After the last /api/, so a module that doubled the prefix (/api/api/thing)
  // still names its capability.
  const p = String(path || '');
  const m = /\/api\/([^/?]+)/.exec(p.slice(p.lastIndexOf('/api/')));
  return m && m[1] !== 'api' ? m[1] : '';
}

/**
 * The answer inside a JSON reply, whatever it was called. The named fields
 * first; failing those, the longest string in the object, one level down.
 */
export function answerText(body) {
  if (!body || typeof body !== 'object') return typeof body === 'string' ? body : '';
  for (const k of ['reply', 'answer', 'response', 'text', 'message', 'result']) {
    if (typeof body[k] === 'string' && body[k].trim()) return body[k];
  }
  let best = '';
  for (const v of Object.values(body)) {
    if (typeof v === 'string' && v.length > best.length) best = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const w of Object.values(v)) if (typeof w === 'string' && w.length > best.length) best = w;
    }
  }
  return best;
}

export async function recordTurn({ question, answer, capability, sessionId = '', planHash = '' }) {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    const doc = {
      question: String(question || '').slice(0, MAX_TEXT),
      answer: String(answer || '').slice(0, MAX_TEXT),
      capability: String(capability || ''),
      sessionId: String(sessionId || ''),
      // How the question was answered, not how it was worded. Empty when the
      // route did not produce a plan — which is most of them, and correct.
      planHash: String(planHash || ''),
      at: new Date(),
    };
    const r = await turnsCollection().insertOne(doc);
    sendSignal('question_asked', { capability: doc.capability });
    return r.insertedId;
  } catch (err) {
    console.warn('[turns] not recorded —', err.message);
    return null;
  }
}

/**
 * The conversation this person had, oldest first.
 *
 * Every turn was already being written down — for the continuous builder, and
 * so the owner can see what the application is being asked. Nothing ever read
 * them back to the person who said them, so pressing reload emptied the
 * conversation: the turns survived and the window onto them did not.
 *
 * Scoped to one sessionId, which is the signed-in user's id. A person gets
 * their own conversation back and nobody else's.
 */
export async function recentTurns(sessionId, limit = 20) {
  if (mongoose.connection.readyState !== 1) return [];
  if (!sessionId) return [];
  const rows = await turnsCollection()
    .find({ sessionId: String(sessionId) })
    .sort({ at: -1 })
    .limit(Math.min(Math.max(1, limit), 50))
    .toArray();
  return rows.reverse().map(r => ({
    question: r.question || '',
    answer: r.answer || '',
    at: r.at || null,
  }));
}

export function turnMiddleware(req, res, next) {
  if (req.method !== 'POST' || SKIP.test(req.path) || !req.path.startsWith('/api/')) return next();
  const question = req.body && typeof req.body.message === 'string' ? req.body.message : '';
  if (!question.trim()) return next();
  const original = res.json.bind(res);
  res.json = (body) => {
    const out = original(body);
    if (res.statusCode < 400) {
      recordTurn({
        question,
        answer: answerText(body),
        capability: capabilityOf(req.originalUrl || req.path),
        sessionId: req.user?.userId || '',
        // Read off the reply rather than passed in, so a generated route that
        // answers some other way simply records no shape instead of breaking.
        planHash: (body && typeof body.planHash === 'string') ? body.planHash : '',
      });
    }
    return out;
  };
  next();
}
