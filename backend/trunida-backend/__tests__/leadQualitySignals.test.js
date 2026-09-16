/**
 * Two accounts got read as prospects twice, and were never anybody.
 *
 *   gewesa3986@duidir.com   "hi",          ₹0.90,  one visit, never back
 *   tomiw84957@wmbee.com    "surprise me", ₹26.80, one visit, never back
 *
 * The funnel said "approved an opportunity" and "application built, never
 * launched" — both true statements about the records, and both misleading,
 * because nothing on the row said the address was a throwaway and the person
 * had not come back.
 *
 * These are signals, never filters. Refusing a person is a much more expensive
 * mistake than showing a pill beside their name, and the guard at the door
 * already handles the nonsense objectives.
 */

import { describe, it, expect } from 'vitest';
import { isDisposableEmail, neverReturned, qualitySignals } from '../services/leadQualitySignals.js';

const at = (iso) => new Date(iso);

describe('the addresses that started this', () => {
  it('recognises both, by name', () => {
    expect(isDisposableEmail('gewesa3986@duidir.com')).toBe(true);
    expect(isDisposableEmail('tomiw84957@wmbee.com')).toBe(true);
  });

  it('recognises the common services too', () => {
    for (const e of [
      'x@mailinator.com', 'x@guerrillamail.com', 'x@10minutemail.com',
      'x@yopmail.com', 'x@temp-mail.org', 'x@trashmail.de',
    ]) expect(isDisposableEmail(e), e).toBe(true);
  });

  it('catches the shape when the exact domain is not on the list', () => {
    // These services rotate domains constantly; the list will always be behind.
    for (const e of ['x@tempmail-99.net', 'x@burnermail.xyz', 'x@throwawaymail.co']) {
      expect(isDisposableEmail(e), e).toBe(true);
    }
  });

  it('leaves real addresses alone', () => {
    for (const e of [
      'gowtham@sixcricket.in', 'arthmano@gmail.com', 'rahul.c@botsync.co',
      'someone@outlook.com', 'a.b@kpit.com', 'founder@vesoma.co.in',
    ]) expect(isDisposableEmail(e), e).toBe(false);
  });

  it('is not confused by an empty or malformed address', () => {
    for (const e of ['', null, undefined, 'notanemail', '@nothing']) {
      expect(isDisposableEmail(e)).toBe(false);
    }
  });
});

describe('did they ever come back', () => {
  const NOW = at('2026-09-16T12:00:00Z').getTime();

  it('flags the account last seen in the minute it was created', () => {
    expect(neverReturned({
      createdAt: at('2026-09-15T19:31:00Z'),
      lastSeenAt: at('2026-09-15T19:31:00Z'),
    }, NOW)).toBe(true);
  });

  it('does not flag somebody who came back', () => {
    expect(neverReturned({
      createdAt: at('2026-09-15T19:31:00Z'),
      lastSeenAt: at('2026-09-16T09:02:00Z'),
    }, NOW)).toBe(false);
  });

  it('allows the moment between signing up and being redirected', () => {
    // lastSeenAt lands a few seconds after createdAt on a perfectly real
    // account, and calling that "never came back" would be wrong about all of
    // them.
    expect(neverReturned({
      createdAt: at('2026-09-15T19:31:00Z'),
      lastSeenAt: at('2026-09-15T19:31:40Z'),
    }, NOW)).toBe(true);
    expect(neverReturned({
      createdAt: at('2026-09-15T19:31:00Z'),
      lastSeenAt: at('2026-09-15T19:35:00Z'),
    }, NOW)).toBe(false);
  });

  it('says nothing about an account minutes old', () => {
    // Somebody who signed up just now has not had the chance. Marking every
    // new account cold on arrival is the one way this signal could do harm.
    const justNow = new Date(NOW - 2 * 60 * 1000);
    expect(neverReturned({ createdAt: justNow, lastSeenAt: justNow }, NOW)).toBe(false);
  });

  it('says nothing when there is no lastSeenAt to read', () => {
    /*
     * The first version treated absence as createdAt, which made the
     * comparison trivially true. Against the real accounts it flagged 33 out
     * of 33 — the team's own included, and a customer whose application was
     * running at that moment. A badge on every row trains you to ignore it.
     *
     * Absence cannot be told apart from a brand-new account or one that
     * predates the field, so it earns no badge either way.
     */
    expect(neverReturned({ createdAt: at('2026-09-15T19:31:00Z') }, NOW)).toBe(false);
  });
});

describe('what the row is told', () => {
  const NOW = at('2026-09-16T12:00:00Z').getTime();

  it('carries both signals for the accounts that prompted this', () => {
    const sig = qualitySignals({
      email: 'tomiw84957@wmbee.com',
      createdAt: at('2026-09-15T09:01:00Z'),
      lastSeenAt: at('2026-09-15T09:01:00Z'),
    }, NOW);
    expect(sig.map(s => s.key).sort()).toEqual(['never-returned', 'throwaway']);
  });

  it('says nothing at all about an ordinary account', () => {
    // Most rows. A board covered in badges is a board nobody reads.
    expect(qualitySignals({
      email: 'gowtham@sixcricket.in',
      createdAt: at('2026-09-16T07:51:00Z'),
      lastSeenAt: at('2026-09-16T11:30:00Z'),
    }, NOW)).toEqual([]);
  });

  it('can flag a real address that never came back', () => {
    const sig = qualitySignals({
      email: 'someone@realcompany.com',
      createdAt: at('2026-09-14T10:00:00Z'),
      lastSeenAt: at('2026-09-14T10:00:00Z'),
    }, NOW);
    expect(sig.map(s => s.key)).toEqual(['never-returned']);
  });
});

describe('it is a signal, not a filter', () => {
  it('the board attaches signals without removing the row', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync(new URL('../services/salesSignalsService.js', import.meta.url), 'utf8'));
    expect(src).toContain('signals: qualitySignals(u)');
    // Nothing anywhere drops a row for having one.
    expect(src).not.toMatch(/filter\([^)]*isDisposableEmail/);
    expect(src).not.toMatch(/filter\([^)]*neverReturned/);
  });
});
