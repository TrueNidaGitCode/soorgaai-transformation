/**
 * Phase C of "connectors in the application": the conversation stays in the
 * tenant, only the fixed list of signals leaves, the platform refuses
 * anything off that list, the Learner reads what arrives, and the privacy
 * page says the same thing the application does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = '../eame-template/services/';

// ── The application's side ──────────────────────────────────────────────────

describe('tenantSignals (in the application)', () => {
  const ORIGINAL = { url: process.env.SVARG_SIGNALS_URL, key: process.env.SELFHOSTED_API_KEY };
  afterEach(() => { process.env.SVARG_SIGNALS_URL = ORIGINAL.url || ''; process.env.SELFHOSTED_API_KEY = ORIGINAL.key || ''; });

  it('sends nothing when no endpoint is set, and refuses kinds not on the list', async () => {
    process.env.SVARG_SIGNALS_URL = '';
    const { sendSignal, pending, SIGNALS } = await import(T + 'tenantSignals.js');
    expect(sendSignal('question_asked', { capability: 'thing' })).toBe(false);
    process.env.SVARG_SIGNALS_URL = 'http://127.0.0.1:1/signals';
    expect(sendSignal('message_body', { text: 'the whole question' })).toBe(false);
    expect(pending()).toEqual([]);
    expect(Object.keys(SIGNALS)).toEqual(['question_asked', 'feedback', 'correction', 'import']);
  });

  it('delivers a batch with the gateway token and nothing but the listed fields', async () => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => { received.push({ auth: req.headers.authorization, body: JSON.parse(body) }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    process.env.SVARG_SIGNALS_URL = `http://127.0.0.1:${server.address().port}/signals`;
    process.env.SELFHOSTED_API_KEY = 'svd_token';
    const { sendSignal, flush } = await import(T + 'tenantSignals.js');
    sendSignal('question_asked', { capability: 'attendance', question: 'who missed practice', answer: 'Arjun' });
    sendSignal('feedback', { capability: 'attendance', vote: 'down', answer: 'the whole answer' });
    sendSignal('correction', { capability: 'attendance', correction: 'It should count U-13 only.' });
    sendSignal('import', { datasetName: 'Attendance', source: 'whatsapp', rows: 42, row: ['secret'] });
    expect(await flush()).toBe(4);
    server.close();
    expect(received[0].auth).toBe('Bearer svd_token');
    const kinds = received[0].body.signals.map(s => s.kind);
    expect(kinds).toEqual(['question_asked', 'feedback', 'correction', 'import']);
    const text = JSON.stringify(received[0].body);
    expect(text).not.toMatch(/who missed practice|Arjun|the whole answer|secret/);
    expect(text).toMatch(/It should count U-13 only/);
  });
});

describe('turnLog (in the application)', () => {
  it('finds the answer in a reply whatever it is called, and the capability from the path', async () => {
    const { answerText, capabilityOf } = await import(T + 'turnLog.js');
    expect(answerText({ reply: 'Twelve players.' })).toBe('Twelve players.');
    expect(answerText({ ok: true, data: { summary: 'A longer answer here', n: 3 } })).toBe('A longer answer here');
    expect(answerText('plain')).toBe('plain');
    expect(capabilityOf('/api/attendance/ask?x=1')).toBe('attendance');
    expect(capabilityOf('/health')).toBe('');
  });

  it('only watches POSTs carrying { message } outside the runtime routes', async () => {
    const { turnMiddleware } = await import(T + 'turnLog.js');
    const calls = [];
    const run = (method, p, body) => {
      const json = (b) => { calls.push(b); return res; };
      const res = { statusCode: 200, json };
      const req = { method, path: p, originalUrl: p, body };
      let nexted = false;
      turnMiddleware(req, res, () => { nexted = true; });
      return { nexted, wrapped: res.json !== json };
    };
    const watched = run('POST', '/api/thing/ask', { message: 'hi' });
    expect(watched.nexted).toBe(true);
    expect(watched.wrapped).toBe(true);
    expect(run('POST', '/api/data/import', { message: 'x' }).wrapped).toBe(false);
    expect(run('GET', '/api/thing', {}).wrapped).toBe(false);
    expect(run('POST', '/api/thing/ask', { query: 'no message field' }).wrapped).toBe(false);
  });
});

// ── The platform's side ─────────────────────────────────────────────────────

describe('tenantSignalService (on Svarg)', () => {
  it('normalises what is on the list and drops what is not', async () => {
    const { normaliseSignal } = await import('../services/tenantSignalService.js');
    const now = new Date('2026-09-13T10:00:00Z');
    expect(normaliseSignal({ kind: 'question_asked', capability: 'attendance', at: '2026-09-13T09:00:00Z', question: 'leak' }, now))
      .toEqual({ kind: 'question_asked', capability: 'attendance', at: new Date('2026-09-13T09:00:00Z') });
    expect(normaliseSignal({ kind: 'feedback', vote: 'sideways' }, now).vote).toBe('up');
    expect(normaliseSignal({ kind: 'correction', correction: '   ' }, now)).toBeNull();
    expect(normaliseSignal({ kind: 'conversation', text: 'everything' }, now)).toBeNull();
    expect(normaliseSignal({ kind: 'import', datasetName: 'A', source: 'jira', rows: '12' }, now)).toMatchObject({ rows: 12, source: 'jira' });
  });

  it('summarises counts, votes and corrections into a block the Learner can read', async () => {
    const { summariseSignals, signalsToText } = await import('../services/tenantSignalService.js');
    const rows = [
      { kind: 'question_asked', capability: 'attendance' }, { kind: 'question_asked', capability: 'attendance' }, { kind: 'question_asked', capability: 'fees' },
      { kind: 'feedback', vote: 'up', capability: 'attendance' }, { kind: 'feedback', vote: 'down', capability: 'fees' },
      { kind: 'correction', capability: 'fees', correction: 'Quarterly fees are due on the 5th.' },
      { kind: 'import', datasetName: 'Attendance', source: 'whatsapp', rows: 42 },
    ];
    const s = summariseSignals(rows);
    expect(s.questions).toBe(3);
    expect(s.byCapability.get('attendance')).toBe(2);
    expect(s.votes).toEqual({ up: 1, down: 1 });
    const text = signalsToText(s);
    expect(text).toMatch(/Questions answered: 3 \(attendance: 2, fees: 1\)/);
    expect(text).toMatch(/1 up, 1 down \(down on fees: 1\)/);
    expect(text).toMatch(/Customer correction \(fees\): "Quarterly fees are due on the 5th."/);
    expect(text).toMatch(/42 rows onto "Attendance" from whatsapp/);
    expect(signalsToText(summariseSignals([]))).toBe('');
  });

  it('keeps the two lists -- what the application sends and what the platform accepts -- the same', async () => {
    const { SIGNALS } = await import(T + 'tenantSignals.js');
    const { SIGNAL_KINDS } = await import('../models/TenantSignal.js');
    expect(Object.keys(SIGNALS).sort()).toEqual([...SIGNAL_KINDS].sort());
    // And the privacy page names every one of them.
    const page = fs.readFileSync(path.join(HERE, '..', '..', '..', 'frontend', 'privacy', 'privacy.html'), 'utf8');
    for (const k of SIGNAL_KINDS) expect(page).toContain(`<code>${k}</code>`);
  });
});

// ── The Learner reads the live application ──────────────────────────────────

const { mockFindOne, mockUpdateOne, mockThreads, mockGenerate, mockSince } = vi.hoisted(() => ({
  mockFindOne: vi.fn(), mockUpdateOne: vi.fn(), mockThreads: vi.fn(), mockGenerate: vi.fn(), mockSince: vi.fn(),
}));
vi.mock('../models/CustomerUnderstanding.js', () => ({ default: { findOne: mockFindOne, updateOne: mockUpdateOne } }));
vi.mock('../services/conversationMemoryService.js', () => ({ threadsForBlueprint: mockThreads }));
vi.mock('../services/llmService.js', () => ({ generate: mockGenerate }));
vi.mock('../services/tenantSignalService.js', async () => {
  const real = await vi.importActual('../services/tenantSignalService.js');
  return { ...real, signalsSince: mockSince };
});

describe('learnFromConversation with a live application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
    mockThreads.mockResolvedValue([]);
    mockGenerate.mockResolvedValue({ text: '{"business":"","recurringTasks":[],"preferences":[],"needs":["count attendance for U-13 only"]}' });
    mockSince.mockResolvedValue({ rows: [], newest: null });
  });

  it('learns from a correction even with no platform conversation, and advances the signal watermark', async () => {
    const { learnFromConversation } = await import('../services/customerUnderstandingService.js');
    const newest = new Date('2026-09-13T10:05:00Z');
    mockSince.mockResolvedValue({ rows: [
      { kind: 'question_asked', capability: 'attendance' },
      { kind: 'feedback', vote: 'down', capability: 'attendance' },
      { kind: 'correction', capability: 'attendance', correction: 'Only the U-13 batch trains on Tuesdays.' },
    ], newest });
    const out = await learnFromConversation({ userId: 'u1', blueprintId: 'bp1', force: true });
    expect(out).toMatchObject({ learned: true, reason: 'ok' });
    const prompt = mockGenerate.mock.calls[0][0].userMessage;
    expect(prompt).toMatch(/THE LIVE APPLICATION/);
    expect(prompt).toMatch(/Only the U-13 batch trains on Tuesdays/);
    expect(prompt).not.toMatch(/NEW CONVERSATION/);
    expect(mockUpdateOne.mock.calls[0][1].$set.signalsReadAt).toEqual(newest);
  });

  it('counts only corrections and down-votes toward the threshold; usage alone does not buy a model call', async () => {
    const { learnFromConversation } = await import('../services/customerUnderstandingService.js');
    mockSince.mockResolvedValue({ rows: Array.from({ length: 50 }, () => ({ kind: 'question_asked', capability: 'x' })), newest: new Date() });
    const out = await learnFromConversation({ userId: 'u1', blueprintId: 'bp1' });
    expect(out).toMatchObject({ learned: false, reason: 'nothing-new' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});
