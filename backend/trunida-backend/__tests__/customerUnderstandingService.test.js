/**
 * Unit tests — services/customerUnderstandingService.js
 *
 * The weight is on the three rules the service exists to keep: it never
 * re-reads turns it has already paid for, it never loses an earlier
 * observation, and it never throws into the chat path that fired it.
 *
 * Strategy:
 *  - CustomerUnderstanding and conversationMemoryService are mocked.
 *  - llmService.generate is mocked; no test here makes a real call.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockFindOne, mockUpdateOne, mockThreads, mockGenerate } = vi.hoisted(() => ({
  mockFindOne:  vi.fn(),
  mockUpdateOne: vi.fn(),
  mockThreads:  vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock('../models/CustomerUnderstanding.js', () => ({
  default: { findOne: mockFindOne, updateOne: mockUpdateOne },
}));
vi.mock('../services/conversationMemoryService.js', () => ({
  threadsForBlueprint: mockThreads,
}));
vi.mock('../services/llmService.js', () => ({ generate: mockGenerate }));

const {
  normalise, sameObservation, mergeObservations, unreadTurns,
  advanceWatermarks, parseExtraction, learnFromConversation, LEARN_THRESHOLD,
} = await import('../services/customerUnderstandingService.js');

const USER = 'user-1';
const BP   = 'bp-1';
const thread = (screen, turns) => ({ domainId: `screen:${BP}:${screen}`, turns });
const turns = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ role: 'user', content: `m${from + i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  mockFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  mockUpdateOne.mockResolvedValue({ acknowledged: true });
  mockThreads.mockResolvedValue([]);
  mockGenerate.mockResolvedValue({ text: '{"business":"","recurringTasks":[],"preferences":[],"needs":[]}' });
});

describe('sameObservation', () => {
  it('ignores case and punctuation', () => {
    expect(sameObservation('Send class timings!', 'send class timings')).toBe(true);
  });

  it('treats one phrase containing another as the same requirement', () => {
    expect(sameObservation(
      'send class timings on WhatsApp',
      "send today's class timings to all students on WhatsApp"
    )).toBe(true);
  });

  it('does not merge two genuinely different requests', () => {
    expect(sameObservation('send class timings on WhatsApp', 'raise invoices for students')).toBe(false);
  });

  it('will not let a short fragment swallow an unrelated phrase', () => {
    // Containment only counts past a length floor, or "pay" would match
    // every sentence with the word in it.
    expect(sameObservation('pay', 'payment reminders for overdue student fees')).toBe(false);
  });

  it('is false when either side is empty', () => {
    expect(sameObservation('', 'anything')).toBe(false);
    expect(normalise(null)).toBe('');
  });
});

describe('mergeObservations', () => {
  it('adds something new', () => {
    const out = mergeObservations([], ['raise invoices']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: 'raise invoices', mentions: 1 });
  });

  it('counts a repeat instead of duplicating it', () => {
    const first = new Date('2026-03-01');
    const existing = [{ text: 'send class timings', mentions: 1, firstSeenAt: first, lastSeenAt: first }];
    const now = new Date('2026-09-11');

    const out = mergeObservations(existing, ['send class timings'], { now });
    expect(out).toHaveLength(1);
    expect(out[0].mentions).toBe(2);
    // How long they have wanted it is the signal; it must not be reset.
    expect(out[0].firstSeenAt).toBe(first);
    expect(out[0].lastSeenAt).toBe(now);
  });

  it('keeps the fuller phrasing of a repeated need', () => {
    const existing = [{ text: 'send timings', mentions: 1 }];
    const out = mergeObservations(existing, ['send timings to all students on WhatsApp']);
    expect(out[0].text).toBe('send timings to all students on WhatsApp');
    expect(out[0].mentions).toBe(2);
  });

  // Rule 2. This is the failure that would matter most and be hardest to see.
  it('never drops what was already known when nothing new is observed', () => {
    const existing = [
      { text: 'manage students', mentions: 5 },
      { text: 'raise invoices',  mentions: 2 },
    ];
    expect(mergeObservations(existing, [])).toHaveLength(2);
    expect(mergeObservations(existing, undefined)).toHaveLength(2);
  });

  it('does not mutate the list it was given', () => {
    const existing = [{ text: 'manage students', mentions: 1 }];
    mergeObservations(existing, ['manage students', 'raise invoices']);
    expect(existing).toHaveLength(1);
    expect(existing[0].mentions).toBe(1);
  });

  it('ignores blank and whitespace-only observations', () => {
    expect(mergeObservations([], ['', '   ', null, undefined])).toEqual([]);
  });

  it('caps the list by dropping the weakest signal, not the oldest', () => {
    const existing = Array.from({ length: 60 }, (_, i) => ({
      text: `task ${i}`,
      mentions: i === 0 ? 1 : 9,          // task 0 is the weak one
      lastSeenAt: new Date('2026-01-01'),
    }));
    const out = mergeObservations(existing, ['a brand new task'], { cap: 60 });
    expect(out).toHaveLength(60);
    expect(out.find(o => o.text === 'task 0')).toBeUndefined();
    expect(out.find(o => o.text === 'task 5')).toBeDefined();
  });

  it('stamps extra fields onto new entries only', () => {
    const existing = [{ text: 'old need', mentions: 1, status: 'planned' }];
    const out = mergeObservations(existing, ['new need'], { extra: { status: 'noticed', blueprintId: BP } });
    expect(out.find(o => o.text === 'old need').status).toBe('planned');
    expect(out.find(o => o.text === 'new need')).toMatchObject({ status: 'noticed', blueprintId: BP });
  });
});

describe('unreadTurns', () => {
  it('returns everything for a thread never read', () => {
    const out = unreadTurns([thread('cob', turns(3))], []);
    expect(out[0].turns).toHaveLength(3);
    expect(out[0].turnsSeen).toBe(3);
  });

  // Rule 1. Re-reading is the difference between one model call and one per
  // message for the whole history.
  it('returns only what arrived since the watermark', () => {
    const out = unreadTurns(
      [thread('cob', turns(10))],
      [{ threadId: `screen:${BP}:cob`, turnsSeen: 7 }]
    );
    expect(out[0].turns.map(t => t.content)).toEqual(['m7', 'm8', 'm9']);
    expect(out[0].turnsSeen).toBe(10);
  });

  it('skips a thread that is fully caught up', () => {
    expect(unreadTurns([thread('cob', turns(5))], [{ threadId: `screen:${BP}:cob`, turnsSeen: 5 }])).toEqual([]);
  });

  // The conversation store caps threads, so turns fall off the front and a
  // watermark can end up past the length. That must not re-read the thread.
  it('treats a shrunken thread as caught up rather than starting over', () => {
    expect(unreadTurns([thread('cob', turns(5))], [{ threadId: `screen:${BP}:cob`, turnsSeen: 400 }])).toEqual([]);
  });

  it('limits one pass and leaves the rest for the next', () => {
    const out = unreadTurns([thread('cob', turns(100))], []);
    expect(out[0].turns).toHaveLength(40);
    expect(out[0].turnsSeen).toBe(40);
  });

  it('reads every stage, since a customer says what they need wherever they are', () => {
    const out = unreadTurns([thread('cob', turns(2)), thread('arth', turns(2))], []);
    expect(out.map(p => p.threadId)).toEqual([`screen:${BP}:cob`, `screen:${BP}:arth`]);
  });
});

describe('advanceWatermarks', () => {
  it('adds a watermark for a thread read for the first time', () => {
    expect(advanceWatermarks([], [{ threadId: 't1', turnsSeen: 4 }]))
      .toEqual([{ threadId: 't1', turnsSeen: 4 }]);
  });

  it('advances an existing one and leaves other threads alone', () => {
    const out = advanceWatermarks(
      [{ threadId: 't1', turnsSeen: 2 }, { threadId: 't2', turnsSeen: 9 }],
      [{ threadId: 't1', turnsSeen: 6 }]
    );
    expect(out).toEqual([{ threadId: 't1', turnsSeen: 6 }, { threadId: 't2', turnsSeen: 9 }]);
  });
});

describe('parseExtraction', () => {
  it('reads a bare object', () => {
    const out = parseExtraction('{"business":"A violin school","needs":["send timings on WhatsApp"]}');
    expect(out.business).toBe('A violin school');
    expect(out.needs).toEqual(['send timings on WhatsApp']);
  });

  it('reads it out of a fenced block', () => {
    expect(parseExtraction('```json\n{"business":"A violin school"}\n```').business).toBe('A violin school');
  });

  it('reads it out of surrounding prose', () => {
    expect(parseExtraction('Sure!\n{"business":"A violin school"}\nHope that helps').business).toBe('A violin school');
  });

  it('accepts objects where strings were asked for', () => {
    expect(parseExtraction('{"needs":[{"text":"raise invoices"}]}').needs).toEqual(['raise invoices']);
  });

  // A bad extraction must cost nothing: empty lists merge to no change.
  it('returns empty lists for junk rather than throwing', () => {
    for (const junk of ['', null, 'no json here', '{ broken', '[1,2,3]', '{"needs":"not a list"}']) {
      const out = parseExtraction(junk);
      expect(out.needs).toEqual([]);
      expect(out.business).toBe('');
    }
  });
});

describe('learnFromConversation', () => {
  it('does nothing without the ids it needs', async () => {
    expect(await learnFromConversation({ blueprintId: BP })).toMatchObject({ learned: false, reason: 'missing-ids' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('does nothing when there is no conversation', async () => {
    expect(await learnFromConversation({ userId: USER, blueprintId: BP }))
      .toMatchObject({ learned: false, reason: 'no-conversation' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  // Cost control: a short exchange must not buy a model call.
  it('waits for enough new turns before spending anything', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(LEARN_THRESHOLD - 1))]);
    const out = await learnFromConversation({ userId: USER, blueprintId: BP });
    expect(out).toMatchObject({ learned: false, reason: 'below-threshold' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('learns once enough has been said', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(LEARN_THRESHOLD))]);
    const out = await learnFromConversation({ userId: USER, blueprintId: BP });
    expect(out).toMatchObject({ learned: true, reason: 'ok' });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    // Labelled so learning is visible in usage accounting, not hidden in chat.
    expect(mockGenerate.mock.calls[0][0].label).toBe('learn:understanding');
  });

  it('force overrides the threshold for a caller that needs an answer now', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(1))]);
    const out = await learnFromConversation({ userId: USER, blueprintId: BP, force: true });
    expect(out.learned).toBe(true);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('does not call the model when every thread is caught up', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(5))]);
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve({ watermarks: [{ threadId: `screen:${BP}:cob`, turnsSeen: 5 }] }),
    });
    expect(await learnFromConversation({ userId: USER, blueprintId: BP }))
      .toMatchObject({ learned: false, reason: 'nothing-new' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('folds what it found into what it already believed', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(5))]);
    mockFindOne.mockReturnValue({
      lean: () => Promise.resolve({
        needs: [{ text: 'manage students', mentions: 3 }],
        watermarks: [],
      }),
    });
    mockGenerate.mockResolvedValue({
      text: '{"business":"A violin school","needs":["send class timings on WhatsApp"]}',
    });

    await learnFromConversation({ userId: USER, blueprintId: BP });
    const [, update] = mockUpdateOne.mock.calls[0];

    expect(update.$set.business).toBe('A violin school');
    expect(update.$set.needs.map(n => n.text))
      .toEqual(['manage students', 'send class timings on WhatsApp']);
    expect(update.$set.needs.find(n => n.text.includes('WhatsApp')))
      .toMatchObject({ status: 'noticed', blueprintId: BP });
    expect(update.$inc).toEqual({ learnCount: 1 });
  });

  it('leaves the summary alone when the model offered none', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(5))]);
    mockFindOne.mockReturnValue({ lean: () => Promise.resolve({ business: 'A violin school', watermarks: [] }) });
    mockGenerate.mockResolvedValue({ text: '{"needs":["raise invoices"]}' });

    await learnFromConversation({ userId: USER, blueprintId: BP });
    expect(mockUpdateOne.mock.calls[0][1].$set.business).toBeUndefined();
  });

  // Otherwise a thread that keeps yielding nothing is re-billed forever.
  it('advances the watermark even when the extraction came back empty', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(6))]);
    mockGenerate.mockResolvedValue({ text: 'the model said something useless' });

    await learnFromConversation({ userId: USER, blueprintId: BP });
    expect(mockUpdateOne.mock.calls[0][1].$set.watermarks)
      .toEqual([{ threadId: `screen:${BP}:cob`, turnsSeen: 6 }]);
  });

  // Rule 3. It runs unawaited behind a reply the customer already has.
  it('reports a model failure instead of throwing into the chat path', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(5))]);
    mockGenerate.mockRejectedValue(new Error('All LLM providers failed'));

    await expect(learnFromConversation({ userId: USER, blueprintId: BP }))
      .resolves.toMatchObject({ learned: false, reason: 'error' });
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('reports a database failure the same way', async () => {
    mockThreads.mockResolvedValue([thread('cob', turns(5))]);
    mockUpdateOne.mockRejectedValue(new Error('connection lost'));
    await expect(learnFromConversation({ userId: USER, blueprintId: BP }))
      .resolves.toMatchObject({ learned: false, reason: 'error' });
  });
});
