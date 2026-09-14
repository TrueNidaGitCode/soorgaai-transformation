/**
 * The answer is finished long before the sentence about it is.
 *
 * A question takes about eight seconds: two to plan, a moment to read and
 * check the records, and five for the model to write prose about facts that
 * were settled seconds earlier. All of it arrived at once, so the customer
 * watched nothing happen for eight seconds and then got everything.
 *
 * Who was absent, how many, from which dataset — all of that is computed by
 * code and validated by code, and by the time the writing starts none of it
 * can change. Holding it back to arrive with the prose was a choice, and it
 * was the wrong one.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const say = vi.fn();

vi.mock('../eame-template/services/connectorService.js', () => ({
  dataVersion: () => 1,
  bumpDataVersion: () => {},
  readIndex: () => [{ name: 'Roll Call', columns: ['player_name', 'status'], file: 'r.csv' }],
  datasetKey: () => 'player_name',
  findDataset: (n) => ({ name: n, columns: ['player_name', 'status'], file: 'r.csv' }),
  readAllRows: async () => ({
    columns: ['player_name', 'status'],
    rows: [
      { cells: ['Arjun Bose', 'absent'], source: 'own' },
      { cells: ['Rohan Sharma', 'absent'], source: 'own' },
    ],
    sample: false,
  }),
}));

vi.mock('../eame-template/services/llmService.js', () => ({
  generate: (...a) => say(...a),
  generateRaw: async () => ({
    text: JSON.stringify({
      reading: 'who was absent',
      intent: 'lookup',
      steps: [{
        id: 'a', op: 'select', dataset: 'Roll Call', label: 'Absent', category: 'absent',
        entity: 'player_name', where: [['status', 'is', 'absent']],
      }],
    }),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  say.mockReset();
});

describe('the evidence arrives before the sentence', () => {
  it('hands over the records while the model is still writing', async () => {
    const order = [];
    let evidence = null;

    say.mockImplementation(async () => {
      // Whatever the model is doing, the evidence is already out.
      order.push('model-called');
      return { text: 'Arjun Bose and Rohan Sharma are absent.' };
    });

    const { answer } = await import('../eame-template/services/answerService.js');
    await answer({
      question: 'Who is absent?',
      onStage: (name, payload) => {
        order.push(name);
        if (name === 'evidence') evidence = payload;
      },
    });

    expect(order.indexOf('evidence')).toBeGreaterThan(-1);
    expect(order.indexOf('evidence')).toBeLessThan(order.indexOf('model-called'));
    expect(evidence.groups[0].items.map(i => i.name)).toEqual(['Arjun Bose', 'Rohan Sharma']);
  });

  it('is the real evidence, not a placeholder to be corrected later', async () => {
    let evidence = null;
    say.mockResolvedValue({ text: 'Two are absent.' });

    const { answer } = await import('../eame-template/services/answerService.js');
    const final = await answer({
      question: 'Who is absent?',
      onStage: (n, p) => { if (n === 'evidence') evidence = p; },
    });

    // Everything except the prose must already be final. If any of this
    // changed afterwards, sending it early would be a lie on screen.
    expect(evidence.groups).toEqual(final.groups);
    expect(evidence.state).toBe(final.state);
    expect(evidence.sources).toEqual(final.sources);
    expect(evidence.answer).toBe('');
  });

  it('reports the stages in the order the work happens', async () => {
    const seen = [];
    say.mockResolvedValue({ text: 'Two are absent.' });
    const { answer } = await import('../eame-template/services/answerService.js');
    await answer({ question: 'Who is absent?', onStage: (n) => seen.push(n) });
    expect(seen).toEqual(['planning', 'reading', 'checking', 'evidence', 'writing']);
  });

  it('answers exactly as before when nobody is watching', async () => {
    say.mockResolvedValue({ text: 'Arjun Bose and Rohan Sharma are absent.' });
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({ question: 'Who is absent?' });
    expect(out.answer).toContain('Arjun Bose');
    expect(out.groups.length).toBe(1);
  });

  it('never lets a watcher that throws break the answer', async () => {
    say.mockResolvedValue({ text: 'Two are absent.' });
    const { answer } = await import('../eame-template/services/answerService.js');
    const out = await answer({
      question: 'Who is absent?',
      onStage: () => { throw new Error('the browser went away'); },
    });
    expect(out.answer).toBeTruthy();
  });
});

describe('the route and the page that carry it', () => {
  const read = (p) => import('fs').then(fs =>
    fs.readFileSync(new URL(p, import.meta.url), 'utf8'));

  it('streams only when asked, and answers JSON otherwise', async () => {
    const c = await read('../eame-template/controllers/chatController.js');
    expect(c).toContain('function wantsStream(req)');
    // The plain path has to stay exactly as it was: qa_suite, and anything
    // else that posts and reads a body, must not have to learn a new protocol.
    expect(c).toContain('if (!wantsStream(req)) {');
    expect(c).toContain('return res.json(out);');
  });

  it('records a streamed turn, which the middleware cannot see', async () => {
    const c = await read('../eame-template/controllers/chatController.js');
    // turnMiddleware wraps res.json, and a stream never calls it — so without
    // this every streamed turn would be missing from the conversation a
    // customer gets back after a reload. Which is every turn.
    expect(c).toContain('await recordTurn({');
    expect(c).toMatch(/sessionId: req\.user\?\.userId/);
  });

  it('stops proxies buffering the stream back into a single response', async () => {
    const c = await read('../eame-template/controllers/chatController.js');
    expect(c).toContain("'X-Accel-Buffering': 'no'");
  });

  it('draws the evidence as it lands and writes the sentence into it', async () => {
    const page = await read('../eame-template/frontend/answer.js');
    expect(page).toContain('async function readStream(r, work)');
    expect(page).toContain("event === 'evidence'");
    expect(page).toContain('insertAdjacentHTML');
    // Drawn once: the final envelope must not repaint what is already there.
    expect(page).toContain('if (!d.ch_drawn) answerNode(d);');
  });

  it('still works against an application built before streaming existed', async () => {
    const page = await read('../eame-template/frontend/answer.js');
    // The page and the server it talks to are updated by separate rebuilds, so
    // one of them is older than the other for a while every time.
    expect(page).toMatch(/text\\\/event-stream/);
    expect(page).toContain('streamed ? await readStream(r, work) : await r.json()');
  });

  it('shows the stage the server reports, not a timer\'s guess', async () => {
    const page = await read('../eame-template/frontend/answer.js');
    expect(page).toContain('STAGE_WORDS');
    expect(page).toContain('clearInterval(t);                       // the server is talking; stop guessing');
  });
});
