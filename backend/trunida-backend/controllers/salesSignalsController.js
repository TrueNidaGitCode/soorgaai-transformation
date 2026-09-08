/**
 * Svarg — Sales Signals Controller
 *
 * Platform-admin-only. Every route here is gated by adminMiddleware.js's
 * adminOnly (mounted in routes/salesSignalsRoutes.js).
 *
 * GET  /api/admin/sales-signals        The board: structured rows + the text rendering.
 * POST /api/admin/sales-signals/ask    Ask a question about the board.
 *
 * The board is recomputed on every read rather than cached. It is five lean
 * finds, it is read by one or two people a day, and a sales board that is
 * quietly minutes stale is worse than one that takes an extra moment — the
 * whole value is that the operator can trust a row while dialling.
 */

import { collectSignals, renderBoard, askBoard } from '../services/salesSignalsService.js';

export async function getBoard(req, res) {
  try {
    const signals = await collectSignals();
    return res.json({ signals, board: renderBoard(signals) });
  } catch (err) {
    console.error('[salesSignals] board failed:', err);
    return res.status(500).json({ error: 'Could not read sales signals.' });
  }
}

export async function ask(req, res) {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'A question is required.' });
  if (question.length > 2000) return res.status(400).json({ error: 'Question is too long.' });

  try {
    // Rebuilt here rather than accepted from the client: the board is the
    // model's only evidence, so letting a caller supply it would let a caller
    // supply facts. It is also what keeps the answer current with the screen.
    const board = renderBoard(await collectSignals());
    const answer = await askBoard(board, question);
    return res.json({ answer });
  } catch (err) {
    console.error('[salesSignals] ask failed:', err);
    return res.status(502).json({ error: `The model could not answer: ${err.message}` });
  }
}
