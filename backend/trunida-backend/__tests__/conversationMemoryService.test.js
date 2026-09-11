/**
 * Unit tests — services/conversationMemoryService.js
 *
 * Strategy:
 *  - The Conversation model is mocked (same hoisting pattern as
 *    conversationService.test.js).
 *
 * What matters here is the two promises this service makes to its caller:
 * an exchange is written as ONE update, and a write that blows up never
 * reaches the caller — screenChat does not await it and must not be able to
 * fail because of it.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockUpdateOne, mockFindOne, mockFind } = vi.hoisted(() => ({
  mockUpdateOne: vi.fn(),
  mockFindOne:   vi.fn(),
  mockFind:      vi.fn(),
}));

vi.mock('../models/Conversation.js', () => ({
  default: { updateOne: mockUpdateOne, findOne: mockFindOne, find: mockFind },
}));

const {
  screenThreadId, recordExchange, recentTurns, threadsForBlueprint,
} = await import('../services/conversationMemoryService.js');

const USER = 'user-1';
const BP   = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateOne.mockResolvedValue({ acknowledged: true });
});

describe('screenThreadId', () => {
  it('namespaces by blueprint and screen so stages stay separate threads', () => {
    expect(screenThreadId(BP, 'cob')).toBe(`screen:${BP}:cob`);
    expect(screenThreadId(BP, 'cob')).not.toBe(screenThreadId(BP, 'arth'));
  });

  it('cannot collide with the plain domain slugs already in this collection', () => {
    // Domain conversations use bare slugs; every screen thread carries colons.
    expect(screenThreadId(BP, 'cob')).toContain(':');
  });
});

describe('recordExchange', () => {
  it('writes both halves of the exchange in a single update', async () => {
    await recordExchange({ userId: USER, blueprintId: BP, screen: 'cob', message: 'hi', reply: 'hello' });

    expect(mockUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = mockUpdateOne.mock.calls[0];
    expect(filter).toEqual({ userId: USER, domainId: `screen:${BP}:cob` });
    expect(opts).toEqual({ upsert: true });

    const pushed = update.$push.turns.$each;
    expect(pushed.map(t => t.role)).toEqual(['user', 'assistant']);
    expect(pushed.map(t => t.content)).toEqual(['hi', 'hello']);
  });

  it('caps the thread so one document cannot grow without limit', async () => {
    await recordExchange({ userId: USER, blueprintId: BP, screen: 'cob', message: 'hi', reply: 'hello' });
    expect(mockUpdateOne.mock.calls[0][1].$push.turns.$slice).toBe(-400);
  });

  it('clips a very long reply rather than storing it whole', async () => {
    await recordExchange({ userId: USER, blueprintId: BP, screen: 'cob', message: 'hi', reply: 'x'.repeat(20000) });
    const pushed = mockUpdateOne.mock.calls[0][1].$push.turns.$each;
    expect(pushed[1].content).toHaveLength(8000);
  });

  it('records a user message even when the reply never came', async () => {
    await recordExchange({ userId: USER, blueprintId: BP, screen: 'cob', message: 'hi', reply: '' });
    const pushed = mockUpdateOne.mock.calls[0][1].$push.turns.$each;
    expect(pushed.map(t => t.role)).toEqual(['user']);
  });

  it('writes nothing at all when there is nothing to write', async () => {
    const out = await recordExchange({ userId: USER, blueprintId: BP, screen: 'cob', message: '', reply: '' });
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(out).toBeNull();
  });

  it('returns null instead of throwing when required ids are missing', async () => {
    expect(await recordExchange({ blueprintId: BP, screen: 'cob', message: 'hi' })).toBeNull();
    expect(await recordExchange({ userId: USER, screen: 'cob', message: 'hi' })).toBeNull();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  // The reason this service exists in the shape it does: screenChat fires it
  // without awaiting, so a rejection here would surface as an unhandled
  // rejection rather than anywhere a caller could catch it.
  it('swallows a database failure so a delivered reply is never undone by it', async () => {
    mockUpdateOne.mockRejectedValue(new Error('connection lost'));
    await expect(
      recordExchange({ userId: USER, blueprintId: BP, screen: 'cob', message: 'hi', reply: 'hello' })
    ).resolves.toBeNull();
  });
});

describe('recentTurns', () => {
  it('returns the tail of the thread, oldest first', async () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    mockFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ turns }) }) });

    const out = await recentTurns({ userId: USER, blueprintId: BP, screen: 'cob', limit: 3 });
    expect(out.map(t => t.content)).toEqual(['m7', 'm8', 'm9']);
  });

  it('returns an empty list for a thread that does not exist yet', async () => {
    mockFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(null) }) });
    expect(await recentTurns({ userId: USER, blueprintId: BP, screen: 'cob' })).toEqual([]);
  });
});

describe('threadsForBlueprint', () => {
  const chain = () => {
    const c = { select: () => c, sort: () => c, lean: () => Promise.resolve([]) };
    return c;
  };

  it('matches every screen thread for the blueprint, anchored at the prefix', async () => {
    mockFind.mockImplementation(chain);
    await threadsForBlueprint({ userId: USER, blueprintId: BP });

    const { domainId } = mockFind.mock.calls[0][0];
    expect(domainId.source.startsWith('^screen:')).toBe(true);
    expect(domainId.test(`screen:${BP}:cob`)).toBe(true);
    expect(domainId.test(`screen:${BP}:arth`)).toBe(true);
    expect(domainId.test('screen:other-blueprint:cob')).toBe(false);
  });

  // blueprintId arrives from a route parameter and is only an ObjectId by
  // convention, so it is escaped rather than interpolated raw.
  it('escapes regex metacharacters in the blueprint id', async () => {
    mockFind.mockImplementation(chain);
    await threadsForBlueprint({ userId: USER, blueprintId: 'a.*b' });

    const { domainId } = mockFind.mock.calls[0][0];
    expect(domainId.test('screen:a.*b:cob')).toBe(true);
    expect(domainId.test('screen:aXXXb:cob')).toBe(false);
  });
});
