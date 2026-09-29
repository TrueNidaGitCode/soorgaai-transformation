/**
 * Svarg's outage is not the watcher's failure.
 *
 * ── Measured on a live application ─────────────────────────────────────────
 *
 * Svarg's model provider ran out of prepaid credit. Every watcher in the
 * application failed on the same tick with the gateway's own sentence:
 *
 *     502 The model provider rejected the request for lack of credit.
 *     This is on Svarg to resolve, not your application.
 *
 * Twelve watchers sat at two strikes of three. One more tick and all twelve
 * would have switched themselves off — so topping the account up would have
 * left the customer with a dead board and a repair job: re-enable each
 * watcher by hand, for an outage that was never theirs.
 *
 * MAX_FAILURES exists so a watcher that cannot work says so instead of
 * erroring quietly for ever. That is about the WATCHER — a question that
 * cannot be planned, a dataset that went away. It is recorded and shown
 * either way; it is only the count that now distinguishes them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { notTheWatchersFault, dueAgents, RETRY_AFTER_MS } from '../eame-template/services/agentService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('whose failure it was', () => {
  it('knows the gateway’s own verdict when it says so', () => {
    expect(notTheWatchersFault(
      '502 The model provider rejected the request for lack of credit. This is on Svarg to resolve, not your application.',
    )).toBe(true);
    expect(notTheWatchersFault(
      'The model provider has hit a spending cap on Svarg\'s account. This is on Svarg to resolve, not your application.',
    )).toBe(true);
    expect(notTheWatchersFault('The model provider is rate limiting requests. Retry shortly.')).toBe(true);
    expect(notTheWatchersFault('The upstream model provider could not be reached.')).toBe(true);
  });

  it('reads the status the client puts at the front of the message', () => {
    // The one part of the text that is not prose.
    expect(notTheWatchersFault('503 Service Unavailable')).toBe(true);
    expect(notTheWatchersFault('429 Too Many Requests')).toBe(true);
    expect(notTheWatchersFault('408 Request Timeout')).toBe(true);
  });

  it('holds the watcher responsible for its own problems', () => {
    expect(notTheWatchersFault('That dataset is no longer in this application.')).toBe(false);
    expect(notTheWatchersFault('The question could not be planned against any dataset.')).toBe(false);
    // A refusal is an answer, not an outage.
    expect(notTheWatchersFault('400 The request was malformed.')).toBe(false);
    expect(notTheWatchersFault('404 No such dataset')).toBe(false);
  });

  it('counts anything it does not recognise, rather than excusing it', () => {
    // A watcher that can never degrade is one that fails silently for ever,
    // which is what MAX_FAILURES is for.
    expect(notTheWatchersFault('')).toBe(false);
    expect(notTheWatchersFault('something went wrong')).toBe(false);
  });
});

describe('what a run does with that', () => {
  const svc = read('../eame-template/services/agentService.js');
  const fail = svc.slice(svc.indexOf('const ours = notTheWatchersFault(message);'), svc.indexOf('return { ran: false, error: message };'));

  it('does not add a strike for an outage above it', () => {
    expect(fail).toContain('const failures = ours ? (agent.failures || 0) : (agent.failures || 0) + 1;');
  });

  it('never switches itself off for one', () => {
    expect(fail).toContain('const degraded = !ours && failures >= MAX_FAILURES;');
    expect(fail).toContain('if (degraded) sendSignal');
  });

  it('still records what happened, so the board can say it', () => {
    expect(fail).toContain('lastError: message.slice(0, 500)');
  });

  it('records when it last tried, and brakes before trying again', () => {
    // dueAgents decides whether that counted as a look; retryAfter is what
    // stops twelve watchers retrying a depleted provider on every tick.
    expect(fail).toContain('lastRunAt: new Date()');
    expect(fail).toContain('retryAfter: new Date(Date.now() + RETRY_AFTER_MS)');
  });
});

/**
 * And a failed run does not use up the day.
 *
 * The provider ran out of credit at 05:46. Every watcher recorded a run and
 * none of them answered anything — but the record said they had run today, so
 * the next look was 07:00 the following morning. The account was topped up at
 * eleven and the product's answer to "is it working now" was still "wait until
 * tomorrow".
 */
describe('catching up after an outage', () => {
  const at = (iso) => new Date(iso).getTime();
  // A Tuesday, 11:00 in Calcutta.
  const NOW = at('2026-09-29T05:30:00Z');
  const base = {
    enabled: true, status: 'active', schedule: 'weekdays', atHour: 7, tz: 'Asia/Calcutta',
    lastRunAt: new Date('2026-09-29T00:16:00Z'), // 05:46 local, earlier today
  };
  const outage = '502 The model provider rejected the request for lack of credit. This is on Svarg to resolve, not your application.';

  it('looks again once the provider is back, rather than tomorrow', () => {
    const due = dueAgents([{ ...base, lastError: outage }], NOW, { lookedAt: NOW });
    expect(due.length).toBe(1);
  });

  it('waits out the brake rather than retrying on every tick', () => {
    const a = { ...base, lastError: outage, retryAfter: new Date(NOW + 60_000) };
    expect(dueAgents([a], NOW, { lookedAt: NOW }).length).toBe(0);
    expect(dueAgents([a], NOW + 120_000, { lookedAt: NOW + 120_000 }).length).toBe(1);
  });

  it('leaves a run that actually answered alone', () => {
    const a = { ...base, lastError: '' };
    expect(dueAgents([a], NOW, { lookedAt: NOW }).length).toBe(0);
  });

  it('still waits for the hour the owner chose', () => {
    // 05:00 local, before 07:00: catching up is not a licence to run at dawn.
    const early = at('2026-09-28T23:30:00Z');
    const due = dueAgents([{ ...base, lastError: outage }], early, { lookedAt: early });
    expect(due.length).toBe(0);
  });

  it('brakes for a quarter of an hour', () => {
    expect(RETRY_AFTER_MS).toBe(15 * 60 * 1000);
  });
});
