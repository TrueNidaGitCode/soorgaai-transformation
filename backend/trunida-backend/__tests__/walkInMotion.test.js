/**
 * A list of places to walk into, before anybody there is a contact.
 *
 * Every other motion begins with a person. This one begins with a building:
 * you know the institutes in your area, you intend to visit them, and you will
 * not have a name until you have stood at the desk and asked for one.
 *
 * It could not be recorded at all before this. "broadcast" is a LANE, not a
 * motion, so nothing could be filed under it; all three motions in that lane
 * required a name and an email; and a backstop in addLead required a contact
 * whatever the motion said.
 *
 * ── The bug this uncovered ────────────────────────────────────────────────
 *
 * Relaxing the backstop made a dormant fault reachable. addLead upserts on
 * `{ email }` or, failing that, `{ phone }` — and with neither, that is
 * `{ phone: '' }`, which matches the first lead that happens to have no number
 * stored. Adding one contactless walk-in overwrote a real cold-email lead and
 * returned it as though it were the same person.
 *
 * It destroyed a real record before it was caught. These tests exist so the
 * collision cannot come back.
 */

import { describe, it, expect } from 'vitest';
import { isMotion, motionOf, fieldsFor, MOTIONS } from '../services/gtmMotions.js';
import { awaitingContact, leadSignals } from '../services/leadQualitySignals.js';
import { readFileSync } from 'fs';

describe('the motion exists and asks only for the institute', () => {
  it('is a real motion, not a lane', () => {
    // "broadcast" is a lane. Filing under it was never possible.
    expect(isMotion('walk-in')).toBe(true);
    expect(isMotion('broadcast')).toBe(false);
    // Its own lane now: walking into a building is not the same work as
    // sending mail, and sharing a tab with cold email made a visit list read
    // as a batch of unsent emails.
    expect(motionOf('walk-in').lane).toBe('visit');
  });

  it('requires the organisation and nothing else', () => {
    const fields = fieldsFor('walk-in');
    expect(fields.filter(f => f.required).map(f => f.key)).toEqual(['company']);
  });

  it('carries the contact fields, empty, to be filled after the visit', () => {
    // On the same row. Retyping the institute as a second lead is how a
    // pipeline becomes two pipelines.
    const keys = fieldsFor('walk-in').map(f => f.key);
    for (const k of ['name', 'role', 'phone', 'email']) expect(keys, k).toContain(k);
  });

  it('declares that it legitimately starts without a contact', () => {
    // A property of the motion, so the backstop does not special-case a string.
    expect(motionOf('walk-in').startsWithoutContact).toBe(true);
    for (const m of MOTIONS.filter(x => x.key !== 'walk-in')) {
      expect(!!m.startsWithoutContact, m.key).toBe(false);
    }
  });

  it('does not send anything by itself', () => {
    expect(motionOf('walk-in').emails).toBe(false);
  });
});

describe('a contactless lead cannot collide with a real one', () => {
  const src = readFileSync(new URL('../services/salesSignalsService.js', import.meta.url), 'utf8');

  it('never matches on an empty phone number', () => {
    /*
     * The exact fault: `{ phone: tel }` with tel === '' matched an unrelated
     * lead and overwrote it.
     */
    expect(src).not.toContain('const filter = clean ? { email: clean } : { phone: tel };');
    expect(src).toContain("    : tel ? { phone: tel }");
  });

  it('matches a contactless lead on its organisation instead', () => {
    expect(src).toContain('    : org ? { company: org, motion: key }');
  });

  it('puts no empty strings in the filter', () => {
    /*
     * findOneAndUpdate copies its equality conditions into the document it
     * inserts, and an email of '' is a value as far as the partial unique
     * index is concerned — so the second contactless lead collided with the
     * first.
     */
    expect(src).not.toMatch(/\{ company: org, motion: key, email: ''/);
  });

  it('refuses a lead with no contact and no organisation either', () => {
    expect(src).toContain('A lead needs an email address, a mobile number, or an organisation.');
  });

  it('still demands a contact for every other motion', () => {
    expect(src).toContain("if (!clean && !tel && !motionOf(key)?.startsWithoutContact) {");
  });
});

describe('a row with nobody to contact says so', () => {
  it('flags the institute that has not been visited yet', () => {
    expect(awaitingContact({ company: 'Rohan Bopanna Tennis Academy' })).toBe(true);
    expect(leadSignals({ company: 'Rohan Bopanna Tennis Academy' }).map(s => s.key))
      .toEqual(['awaiting-contact']);
  });

  it('stops flagging once the visit has happened', () => {
    expect(awaitingContact({ company: 'RBTA', name: 'Bala', phone: '9876543210' })).toBe(false);
    expect(leadSignals({ company: 'RBTA', name: 'Bala', phone: '9876543210' })).toEqual([]);
  });

  it('says nothing about a row that has no organisation either', () => {
    // Not a walk-in; some other kind of incomplete row, and not this label's
    // business to explain.
    expect(awaitingContact({ name: 'Somebody' })).toBe(false);
  });
});

describe('a walk-in is a real row, and carries no link', () => {
  it('is not a test row for having no contact', async () => {
    /*
     * The board filters to kind "real" by default, and a lead with no email
     * and no phone classified as "test" — a rule written when the contact
     * backstop made that state impossible. Both institutes on the visit list
     * were hidden behind it and the tab read 0.
     */
    const { classify } = await import('../services/accountKindService.js');
    expect(classify('', { phone: '', startsWithoutContact: true }).kind).toBe('real');
  });

  it('still calls a genuinely empty form a test row', async () => {
    const { classify } = await import('../services/accountKindService.js');
    expect(classify('', { phone: '' }).kind).toBe('test');
  });

  it('carries the flag all the way to the classifier', async () => {
    // classify() dropped it on the floor the first time, so the fix changed
    // nothing until the parameter was threaded through inferKind as well.
    const src = readFileSync(new URL('../services/accountKindService.js', import.meta.url), 'utf8');
    expect(src).toMatch(/inferKind\(email, \{ role = '', phone = '', startsWithoutContact = false \} = \{\}\)/);
    expect(src).toContain('startsWithoutContact: !!account.startsWithoutContact');
  });

  it('mints no tracked link, because nothing is sent', async () => {
    const { motionSharesLink } = await import('../services/gtmMotions.js');
    expect(motionSharesLink('walk-in')).toBe(false);
    // And the rule is the motion's own, not "does it email" — a warm
    // introduction does not email either, and its link is the deliverable.
    expect(motionSharesLink('warm-intro')).toBe(true);
  });

  it('does not mint a refCode for a motion that shares nothing', () => {
    const src = readFileSync(new URL('../services/salesSignalsService.js', import.meta.url), 'utf8');
    expect(src).toContain('...(motionSharesLink(key) || motionEmails(key)');
  });
});
