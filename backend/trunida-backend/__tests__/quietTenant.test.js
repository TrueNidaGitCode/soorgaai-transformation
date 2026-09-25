/**
 * An application stops watching a room nobody is in.
 *
 * ── The account this came from ─────────────────────────────────────────────
 *
 * A Hobby customer's application was measured nine days after delivery: one
 * question asked on the first morning, nobody signed in since, no data
 * connected, nine watchers running, fifteen findings open and not one of them
 * ever opened. Every run costs a model call whether or not anybody reads what
 * it found, and this one was talking to itself.
 *
 * ── Why this is allowed to pause at all ────────────────────────────────────
 *
 * The product's promise is that it watches while nobody is looking, so
 * "nobody is looking" cannot on its own be a reason to stop — that would sell
 * one thing and ship another. The rule is narrower: nobody has looked for a
 * FORTNIGHT. Two weeks of a daily digest nobody opened is not a signal that
 * needs a third week to confirm.
 *
 * And it is a pause, not a cancellation. Nothing is disabled, nothing is
 * deleted, no finding is lost, and the next sign-in brings it all back within
 * one sweep. That is the line between saving money and taking away what
 * somebody paid for.
 */
import { describe, it, expect } from 'vitest';
import {
  dueAgents, wentQuiet, IDLE_DAYS, SCHEDULES,
} from '../eame-template/services/agentService.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 25, 9, 0);

/** A watcher that is unambiguously due: hourly, never run. */
const ready = (over = {}) => ({
  name: 'Never Invoiced', enabled: true, schedule: 'hourly', lastRunAt: null, tz: 'UTC', ...over,
});

describe('when everybody has stopped looking', () => {
  it('waits a fortnight before going quiet', () => {
    expect(IDLE_DAYS).toBe(14);
    expect(wentQuiet(NOW - 13 * DAY, NOW)).toBe(false);
    expect(wentQuiet(NOW - 15 * DAY, NOW)).toBe(true);
  });

  it('keeps watching for somebody who was here this morning', () => {
    expect(dueAgents([ready()], NOW, { lookedAt: NOW - 3 * DAY })).toHaveLength(1);
  });

  it('stops for somebody who has not been back in a fortnight', () => {
    expect(dueAgents([ready()], NOW, { lookedAt: NOW - 20 * DAY })).toHaveLength(0);
  });

  it('starts again the moment they sign in, with nothing lost', () => {
    /*
     * The watcher record is untouched while quiet — not disabled, not paused,
     * not degraded — so returning needs no repair. It is due again on the
     * first sweep after somebody arrives.
     */
    const watcher = ready();
    expect(dueAgents([watcher], NOW, { lookedAt: NOW - 20 * DAY })).toHaveLength(0);
    expect(watcher.enabled).toBe(true);
    expect(watcher.status).toBeUndefined();
    expect(dueAgents([watcher], NOW, { lookedAt: NOW })).toHaveLength(1);
  });

  it('watches normally when nobody has told it anything', () => {
    // An unknown last-seen is not evidence of absence. A delivered
    // application that cannot read its own users must keep working.
    expect(wentQuiet(null, NOW)).toBe(false);
    expect(wentQuiet(undefined, NOW)).toBe(false);
    expect(wentQuiet('not a date', NOW)).toBe(false);
    expect(dueAgents([ready()], NOW)).toHaveLength(1);
  });
});

describe('what going quiet does not do', () => {
  it('does not change what is due once somebody is back', () => {
    /*
     * The idle rule is a gate in front of the schedule, never a replacement
     * for it: a watcher that already ran this hour is still not due.
     */
    const justRan = ready({ lastRunAt: new Date(NOW - 60 * 1000) });
    expect(dueAgents([justRan], NOW, { lookedAt: NOW })).toHaveLength(0);
    expect(SCHEDULES.hourly.every).toBe(60 * 60 * 1000);
  });

  it('still refuses a watcher that switched itself off', () => {
    for (const over of [{ enabled: false }, { status: 'degraded' }, { status: 'paused' }]) {
      expect(dueAgents([ready(over)], NOW, { lookedAt: NOW }), JSON.stringify(over)).toHaveLength(0);
    }
  });
});

describe('what counts as somebody looking', () => {
  const src = (p) => require('fs').readFileSync(new URL(p, import.meta.url), 'utf8');

  it('is the board being opened, not a token being valid', () => {
    /*
     * A session lasts thirty days, so "signed in recently" would keep an
     * abandoned application watching for a month. Loading the findings is
     * somebody actually reading something.
     */
    expect(src('../eame-template/controllers/agentsController.js')).toContain('noteLooked(');
  });

  it('is not written from the auth middleware, which owns no database write', () => {
    /*
     * That file exists because a lastSeenAt write was shipped in it once,
     * against a model the delivered application does not have — three builds
     * failed on the dangling import. It stays clean.
     */
    const auth = src('../eame-template/middleware/authMiddleware.js');
    expect(auth).not.toMatch(/lastSeenAt\s*:/);
    expect(auth).not.toMatch(/mongoose/);
  });

  it('takes the most recent of everybody with access, not the owner alone', () => {
    // A practice manager reading it every morning is somebody looking, even
    // where the owner never signs in.
    const svc = src('../eame-template/services/agentService.js');
    expect(svc).toMatch(/sort\(\{ lastSeenAt: -1 \}\)/);
  });

  it('falls back to the day the application was prepared', () => {
    // Otherwise an application nobody has signed into yet would be quiet
    // before anybody had the chance to arrive.
    expect(src('../eame-template/services/agentService.js')).toMatch(/meta\?\.preparedAt \|\| meta\?\.createdAt/);
  });

  it('writes at most once an hour, and never fails a request', () => {
    const svc = src('../eame-template/services/agentService.js');
    expect(svc).toMatch(/60 \* 60 \* 1000/);
    expect(svc).toContain('.catch(() => null)');
  });
});
