/**
 * Feedback on an answer, and the list of what this application reports.
 *
 * A thumbs up or down is anyone's to give (any signed-in session); it is
 * kept here with the question and the answer it was about, and only the
 * vote travels to Svarg. A correction -- what the answer should have been --
 * is text the person chose to write for Svarg to learn from, and is sent as
 * written. The list of signals is the owner's to read on the Data page.
 */
import { SIGNALS, sendSignal, configured } from '../services/tenantSignals.js';
import { feedbackCollection, turnsCollection } from '../services/turnLog.js';

const MAX_TEXT = 4000;
const MAX_CORRECTION = 1000;

export async function feedback(req, res) {
  try {
    const { vote, question, answer, correction, capability } = req.body || {};
    if (vote !== 'up' && vote !== 'down') return res.status(400).json({ error: 'vote must be "up" or "down".' });
    const cap = String(capability || '').slice(0, 80);
    const doc = {
      vote, capability: cap,
      question: String(question || '').slice(0, MAX_TEXT),
      answer: String(answer || '').slice(0, MAX_TEXT),
      correction: String(correction || '').slice(0, MAX_CORRECTION),
      sessionId: req.user?.userId || '', at: new Date(),
    };
    await feedbackCollection().insertOne(doc).catch(() => {});
    sendSignal('feedback', { capability: cap, vote });
    if (doc.correction.trim()) sendSignal('correction', { capability: cap, correction: doc.correction });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** What leaves this application, and how much has been kept here. Owner only. */
export async function report(req, res) {
  try {
    const [turns, votes] = await Promise.all([
      turnsCollection().countDocuments().catch(() => 0),
      feedbackCollection().countDocuments().catch(() => 0),
    ]);
    res.json({ configured: configured(), sends: SIGNALS, kept: { conversations: turns, feedback: votes } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
