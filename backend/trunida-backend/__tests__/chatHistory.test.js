/**
 * The conversation has to survive a reload.
 *
 * Pressing refresh emptied the chat. Every turn was already written down — for
 * the continuous builder, and so the owner can see what the application is
 * being asked — and nothing ever read them back to the person who said them.
 * The turns survived; the window onto them did not.
 *
 * Worse than looking empty: the model lost the thread too. The page keeps the
 * last turns in a plain array and sends them with each question, so after a
 * reload "what about their fees?" had nothing to resolve against, and the
 * conversation-memory behaviour silently stopped working.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const rows = [];
const find = vi.fn(() => ({
  sort: () => ({
    limit: (n) => ({ toArray: async () => rows.slice(0, n) }),
  }),
}));

// Mocked at the mongoose boundary, because recentTurns calls turnsCollection()
// as a module-local reference and a spy on the export never reaches it.
const collection = vi.fn(() => ({ find }));
vi.mock('mongoose', () => ({
  default: { connection: { readyState: 1, collection: (...a) => collection(...a) } },
}));

vi.mock('../eame-template/services/tenantSignals.js', () => ({ sendSignal: vi.fn() }));

const T = '../eame-template/services/turnLog.js';

beforeEach(() => {
  rows.length = 0;
  find.mockClear();
  vi.resetModules();
});

async function turnLog() {
  return import(T);
}

describe('the conversation comes back', () => {
  it('returns a person\'s turns oldest first, the way they were said', async () => {
    const mod = await turnLog();
    // Stored newest-first by the query; the page replays them in order.
    rows.push(
      { question: 'What about their fees?', answer: 'Six are overdue.', at: new Date('2026-09-15T10:02:00Z') },
      { question: 'Who missed practice?',   answer: 'Arjun and Rohan.', at: new Date('2026-09-15T10:00:00Z') },
    );
    const out = await mod.recentTurns('user-1', 20);
    expect(out.map(t => t.question)).toEqual(['Who missed practice?', 'What about their fees?']);
    expect(out[0].answer).toBe('Arjun and Rohan.');
  });

  it('asks only for the caller\'s own turns', async () => {
    const mod = await turnLog();
    await mod.recentTurns('user-1', 20);
    expect(find).toHaveBeenCalledWith({ sessionId: 'user-1' });
  });

  it('returns nothing when there is no session, rather than everyone\'s', async () => {
    const mod = await turnLog();
    rows.push({ question: 'q', answer: 'a', at: new Date() });
    expect(await mod.recentTurns('', 20)).toEqual([]);
    expect(await mod.recentTurns(undefined, 20)).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('keeps the limit sane whatever it is asked for', async () => {
    const mod = await turnLog();
    for (let i = 0; i < 80; i++) rows.push({ question: 'q' + i, answer: 'a', at: new Date() });
    expect((await mod.recentTurns('user-1', 500)).length).toBe(50);
    expect((await mod.recentTurns('user-1', 0)).length).toBe(1);
  });
});

describe('the page and the route that carry it', () => {
  const read = (p) => import('fs').then(fs =>
    fs.readFileSync(new URL(p, import.meta.url), 'utf8'));

  it('exposes the history behind the same session guard as asking', async () => {
    const routes = await read('../eame-template/routes/chatRoutes.js');
    expect(routes).toContain("router.get('/history', protect, history)");
  });

  it('replays the turns into the log on load, and into the model\'s context', async () => {
    const page = await read('../eame-template/frontend/answer.js');
    expect(page).toContain('/api/chat/history');
    expect(page).toContain('restore()');
    // Both halves matter: what the person sees, and what the next question
    // resolves against. Restoring only the visible half would look fixed and
    // leave follow-ups broken.
    expect(page).toMatch(/history\.push\(\{ role: 'user', text: t\.question \}\)/);
    expect(page).toMatch(/history\.push\(\{ role: 'assistant', text: t\.answer \}\)/);
  });

  it('never lets a failed history read break the page', async () => {
    const page = await read('../eame-template/frontend/answer.js');
    // An unreadable history is an empty conversation, which is what the page
    // showed before this existed — not an error in front of the customer.
    expect(page).toMatch(/catch \(e\) \{ return; \}/);
    const ctrl = await read('../eame-template/controllers/chatController.js');
    expect(ctrl).toContain('return res.json({ turns: [] })');
  });
});
