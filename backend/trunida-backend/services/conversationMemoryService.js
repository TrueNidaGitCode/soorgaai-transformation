/**
 * Svarg — what the customer actually said, kept
 *
 * The screen chat has always been stateless on the server: screenChat receives
 * `conversationHistory` from the browser, answers, and forgets. That is fine
 * for answering a question and useless for learning from one — a reload or a
 * second device and the history is gone, and nothing server-side ever sees the
 * customer describe a need twice.
 *
 * This records both halves of every exchange so the Learner has something to
 * read. It is deliberately the only thing in this file: capture is separate
 * from interpretation, so a change to what we learn never risks losing what
 * was said.
 *
 * ── Why it reuses Conversation rather than adding a model ──────────────────
 *
 * Conversation already is this: an append-only turns[] of {role, content},
 * unique per (userId, domainId), with a rolling-summary design for when the
 * history outgrows a context window. Screen chat is namespaced into that key
 * space as `screen:<blueprintId>:<screen>` — one thread per stage per
 * blueprint, which is also the grain a customer thinks in ("what I told Cob
 * about my students").
 *
 * ── Recording must never break chatting ───────────────────────────────────
 *
 * Every call here is fire-and-forget from the controller's point of view. A
 * customer whose message was answered but not recorded has lost a learning
 * opportunity; a customer whose message was recorded but not answered has lost
 * the product. So this swallows its own failures and logs them, and the caller
 * does not await it.
 */

import Conversation from '../models/Conversation.js';

/** Turns kept per thread. The document has a 16MB ceiling and these are
 *  small, but "small times unbounded" is how documents die. Older turns fall
 *  off the front; the Learner reads turns as they arrive rather than
 *  re-reading the whole history, so the cap costs it nothing. */
const MAX_TURNS = 400;

/** Longest single turn stored. The controller already caps an inbound message;
 *  this bounds a long model reply, which nothing else does. */
const MAX_CONTENT = 8000;

/**
 * One thread per stage per blueprint.
 *
 * Namespaced so it cannot collide with the domain conversations that already
 * use this collection — those domainIds are plain domain slugs, and none of
 * them contains a colon.
 */
export function screenThreadId(blueprintId, screen) {
  return `screen:${blueprintId}:${screen}`;
}

const clip = (s) => String(s ?? '').slice(0, MAX_CONTENT);

/**
 * Append the user's message and the reply it produced.
 *
 * Both go in one update: they are one exchange, and a crash between two
 * separate pushes would leave a question with no answer, which reads as the
 * assistant ignoring the customer.
 *
 * Returns the thread id so a caller can hand it to the Learner without
 * rebuilding it, and null when there was nothing worth writing.
 */
export async function recordExchange({ userId, blueprintId, screen, message, reply }) {
  if (!userId || !blueprintId || !screen) return null;

  const turns = [];
  if (message) turns.push({ role: 'user', content: clip(message), createdAt: new Date() });
  if (reply) turns.push({ role: 'assistant', content: clip(reply), createdAt: new Date() });
  if (!turns.length) return null;

  const domainId = screenThreadId(blueprintId, screen);

  try {
    await Conversation.updateOne(
      { userId, domainId },
      {
        $push: { turns: { $each: turns, $slice: -MAX_TURNS } },
        $set:  { lastActivityAt: new Date() },
      },
      { upsert: true }
    );
    return domainId;
  } catch (err) {
    // Losing a turn is not worth failing a reply that already reached the
    // customer. Logged loudly enough to notice, quiet enough to ignore.
    console.error('[conversationMemory] could not record exchange:', err.message);
    return null;
  }
}

/**
 * The most recent turns of one thread, oldest first.
 *
 * `limit` is a turn count, not an exchange count — asking for 20 gets roughly
 * the last ten exchanges.
 */
export async function recentTurns({ userId, blueprintId, screen, limit = 40 }) {
  const domainId = screenThreadId(blueprintId, screen);
  const doc = await Conversation.findOne({ userId, domainId }).select('turns').lean();
  if (!doc?.turns?.length) return [];
  return doc.turns.slice(-limit);
}

/**
 * Every screen thread for one blueprint, newest activity first.
 *
 * The Learner wants the whole picture, not one stage of it: a customer
 * describes what their business needs wherever they happen to be standing.
 */
export async function threadsForBlueprint({ userId, blueprintId }) {
  // Escaped rather than interpolated raw: this reaches the query straight from
  // a route parameter, and a blueprintId is only an ObjectId by convention.
  // Anchored at ^ so the (userId, domainId) index still does the work.
  const prefix = String(blueprintId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Conversation.find({
    userId,
    domainId: new RegExp(`^screen:${prefix}:`),
  })
    .select('domainId turns lastActivityAt')
    .sort({ lastActivityAt: -1 })
    .lean();
}
