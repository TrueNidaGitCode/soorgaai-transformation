/**
 * Looking now, when a source connects -- not at the next restart.
 *
 * Watchers that became possible with a new source used to start only when the
 * application booted, so an owner who connected their clinic system saw
 * nothing for hours. A connection now asks for a look: the boot path's own
 * auto-start runs, then the scheduler ticks. Debounced, because one connect is
 * several parts landing seconds apart and one look should follow the last.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';

vi.mock('mongoose', () => ({ default: { connection: { readyState: 0, collection: () => ({}) }, Types: {} } }));
vi.mock('../eame-template/services/tenantSignals.js', () => ({ sendSignal: () => {} }));
vi.mock('../eame-template/services/notifyService.js', () => ({ sendDigest: async () => ({}) }));

const A = await import('../eame-template/services/agentService.js');

describe('a connection asks for a look', () => {
  it('runs the registered start once, after the last of several requests', async () => {
    vi.useFakeTimers();
    const start = vi.fn(async () => {});
    A.onLookNow(start);
    A.requestLookNow({ delayMs: 1000 });
    A.requestLookNow({ delayMs: 1000 });
    A.requestLookNow({ delayMs: 1000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(start).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5);
    expect(start).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('is wired: the app registers its auto-start, and every connect path asks', () => {
    const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
    expect(read('../eame-template/server.js')).toContain('onLookNow(startNewlyPossibleWatchers);');
    for (const c of ['zohoConnectController', 'leadsquaredConnectController', 'jiraConnectController', 'cliniceaConnectController', 'connectorController']) {
      expect(read(`../eame-template/controllers/${c}.js`), c).toMatch(/requestLookNow\(/);
    }
  });
});
