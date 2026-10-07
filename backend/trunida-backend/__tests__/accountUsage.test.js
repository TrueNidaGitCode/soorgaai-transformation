/**
 * The Account page shows each application's allowance as a percentage.
 * These pin the three ways that figure can be wrong: leaking the model cost
 * it is built from, reporting a stale window as current, and calling an
 * application fine when the gateway has already stopped it.
 */

import { describe, it, expect } from 'vitest';
import { allowanceView } from '../services/accountUsageService.js';
import { PERIOD_MS } from '../services/gatewayService.js';

const now = new Date('2026-10-07T12:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const dep = (usage, limits = { maxCostUsd: 5, maxRequests: 20000 }) => ({
  _id: 'd1', status: 'live', railway: { url: 'https://app.example' }, usage, limits,
});

describe('allowanceView', () => {
  it('never carries the cost, tokens or dollar ceiling', () => {
    const v = allowanceView(dep({ requests: 10, costUsd: 3.1, inputTokens: 9, outputTokens: 9, periodStart: daysAgo(3) }), { now });
    const json = JSON.stringify(v);
    for (const leak of ['cost', 'Cost', 'token', 'Token', 'maxCost', '3.1', '"5"']) expect(json).not.toContain(leak);
  });

  it('reports the limit that runs out first', () => {
    // 62% of spend, 1% of requests → 62%.
    expect(allowanceView(dep({ requests: 200, costUsd: 3.1, periodStart: daysAgo(3) }), { now }).usedPct).toBe(62);
    // 10% of spend, 75% of requests → 75%.
    expect(allowanceView(dep({ requests: 15000, costUsd: 0.5, periodStart: daysAgo(3) }), { now }).usedPct).toBe(75);
  });

  it('says paused when the gateway would refuse', () => {
    const v = allowanceView(dep({ requests: 50, costUsd: 5.2, periodStart: daysAgo(3) }), { now });
    expect(v.usedPct).toBe(100);
    expect(v.paused).toBe(true);
  });

  it('treats a window that has run out as empty, as the gateway will', () => {
    const v = allowanceView(dep({ requests: 900, costUsd: 4.9, periodStart: daysAgo(31) }), { now });
    expect(v.usedPct).toBe(0);
    expect(v.requests).toBe(0);
    expect(v.paused).toBe(false);
    expect(v.resetsAt).toBeNull();
  });

  it('resets 30 days after the window started', () => {
    const start = daysAgo(10);
    const v = allowanceView(dep({ requests: 1, costUsd: 0.01, periodStart: start }), { now });
    expect(new Date(v.resetsAt).getTime()).toBe(start.getTime() + PERIOD_MS);
  });

  it('falls back to a generic name rather than an empty one', () => {
    expect(allowanceView(dep({ periodStart: daysAgo(1) }), { now }).name).toBe('Your application');
    expect(allowanceView(dep({ periodStart: daysAgo(1) }), { now, name: 'Attendance Watch' }).name).toBe('Attendance Watch');
  });
});
