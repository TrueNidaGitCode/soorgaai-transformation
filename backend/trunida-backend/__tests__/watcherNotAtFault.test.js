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
import { notTheWatchersFault } from '../eame-template/services/agentService.js';

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

  it('still marks the run as done, rather than retrying every five minutes', () => {
    // Twelve watchers retrying a depleted provider on every tick helps nobody
    // and costs somebody.
    expect(fail).toContain('lastRunAt: new Date()');
  });
});
