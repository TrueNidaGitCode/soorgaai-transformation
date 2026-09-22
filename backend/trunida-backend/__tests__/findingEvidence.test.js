/**
 * A finding has to be believable, which means it has to carry its evidence.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 *
 * A finding was stored as one string. The answer pipeline computed the dataset
 * it came from, the columns it read, the window it covered, the rule that
 * fired and up to six real rows — on every single run — and runAgent kept the
 * key and dropped all of it, because the only question being asked of the
 * result was "how many".
 *
 * So the screen could say "12 students" and could not say why. The product's
 * whole claim is that it does not guess; a finding with nothing behind it is
 * indistinguishable from one that did.
 *
 * ── The rule these tests hold ──────────────────────────────────────────────
 *
 * Evidence is COPIED from the validated envelope. Never recomputed here, never
 * summarised by a model, never rounded. If a number reaches a customer it was
 * counted in code before this file's functions ever saw it.
 */

import { describe, it, expect } from 'vitest';
import {
  evidenceFor, findingKey, diffFindings, nextDueAt, SCHEDULES,
} from '../eame-template/services/agentService.js';
import { severityFor, SEVERITY_RANK, catalogueFor } from '../eame-template/services/agentCatalogue.js';

/** A group and item shaped exactly as answerService's envelope emits them. */
const group = (over = {}) => ({
  label: 'Not seen in 14 days',
  category: 'attention',
  dataset: 'Daily Session Roll Call Logs',
  columns: ['Student Name', 'Session Date'],
  window: '14 days to 22 Sep 2026',
  rule: 'no session date in the last 14 days',
  records: 31,
  entities: 12,
  ...over,
});

const item = (over = {}) => ({
  name: 'Aarav Sharma',
  id: 'STU-0182',
  lines: [['Aarav Sharma', '05 Sep 2026'], ['Aarav Sharma', '02 Sep 2026']],
  records: 2,
  source: 'Daily Session Roll Call Logs',
  ...over,
});

describe('the evidence a finding carries', () => {
  it('keeps everything a person needs in order to believe it', () => {
    const e = evidenceFor(item(), group(), { checked: true });
    // Section 16's list, one assertion each.
    expect(e.dataset).toBe('Daily Session Roll Call Logs');   // source
    expect(e.columns).toEqual(['Student Name', 'Session Date']); // relevant fields
    expect(e.window).toBe('14 days to 22 Sep 2026');          // comparison period
    expect(e.rule).toBe('no session date in the last 14 days'); // the rule that fired
    expect(e.records).toBe(31);                                // calculation
    expect(e.entities).toBe(12);
    expect(e.lines).toHaveLength(2);                           // the actual records
  });

  it('copies numbers rather than computing them', () => {
    /*
     * The one rule that matters. If this function ever counted anything, the
     * count on the screen would be a second opinion about the data instead of
     * the pipeline's validated one — and the two would eventually disagree.
     */
    const e = evidenceFor(item({ lines: [['a'], ['b'], ['c']], records: 2 }), group({ records: 31 }), {});
    expect(e.records).toBe(31);  // the group's, not lines.length
    expect(e.rows).toBe(2);      // the item's own, not lines.length
  });

  it('carries whether the pipeline stood behind the answer', () => {
    expect(evidenceFor(item(), group(), { checked: true }).checked).toBe(true);
    expect(evidenceFor(item(), group(), { checked: false }).checked).toBe(false);
    // Absent means it was not disputed — only an explicit false is a refusal.
    expect(evidenceFor(item(), group(), {}).checked).toBe(true);
  });

  it('carries whether the rows were real or the shipped sample', () => {
    // A demonstration must never be mistaken for the customer's own business.
    expect(evidenceFor(item(), group(), { simulated: true }).simulated).toBe(true);
    expect(evidenceFor(item(), group(), {}).simulated).toBe(false);
  });

  it('survives a group or item that is missing pieces', () => {
    // A watcher on a thin dataset must produce a poor finding, never a crash.
    const e = evidenceFor({}, {}, {});
    expect(e.dataset).toBe('');
    expect(e.columns).toEqual([]);
    expect(e.lines).toEqual([]);
    expect(e.records).toBe(0);
  });

  it('caps the columns it keeps, because a finding is not a copy of the table', () => {
    const many = Array.from({ length: 40 }, (_, i) => `col${i}`);
    expect(evidenceFor(item(), group({ columns: many }), {}).columns).toHaveLength(12);
  });
});

describe('severity is written down, never inferred', () => {
  it('grades money and people leaving as high', () => {
    for (const id of ['overdue-invoice', 'stopped-coming', 'gone-quiet', 'unanswered-enquiry']) {
      expect(severityFor(id), id).toBe('high');
    }
  });

  it('grades tidiness as low', () => {
    for (const id of ['missing-detail', 'duplicate', 'stale-source']) {
      expect(severityFor(id), id).toBe('low');
    }
  });

  it('defaults to medium for anything ungraded, including a hand-written watcher', () => {
    expect(severityFor('over-capacity')).toBe('medium');
    expect(severityFor('something-nobody-has-graded')).toBe('medium');
    expect(severityFor('')).toBe('medium');
  });

  it('grades every catalogue entry to one of three values', () => {
    for (const row of catalogueFor([], {})) {
      expect(SEVERITY_RANK[row.severity], `${row.id} → ${row.severity}`).toBeTypeOf('number');
    }
  });

  it('puts high above medium above low', () => {
    expect(SEVERITY_RANK.high).toBeLessThan(SEVERITY_RANK.medium);
    expect(SEVERITY_RANK.medium).toBeLessThan(SEVERITY_RANK.low);
  });
});

describe('when the next check is due', () => {
  const HOUR = 60 * 60 * 1000;

  it('is a time, so silence on the board is legible', () => {
    /*
     * A sleeping container produces no digest, and "no digest" looks exactly
     * like "nothing was wrong". A next-check time is what separates them.
     */
    const due = nextDueAt({ schedule: 'hourly', lastRunAt: new Date(Date.now() - 10 * 60 * 1000) });
    expect(due).toBeInstanceOf(Date);
  });

  it('for an hourly watcher, is an hour after it last ran', () => {
    const last = new Date('2026-09-22T09:00:00Z');
    const due = nextDueAt({ schedule: 'hourly', lastRunAt: last }, Date.parse('2026-09-22T09:10:00Z'));
    expect(due.getTime()).toBe(last.getTime() + SCHEDULES.hourly.every);
  });

  it('for a daily watcher that already ran today, is not today', () => {
    const now = Date.parse('2026-09-22T10:00:00Z'); // a Tuesday
    const due = nextDueAt(
      { schedule: 'daily', atHour: 7, tz: 'UTC', lastRunAt: new Date('2026-09-22T07:02:00Z') }, now);
    expect(due.getTime()).toBeGreaterThan(now);
  });

  it('for a daily watcher past its hour that has never run, is now', () => {
    const now = Date.parse('2026-09-22T10:00:00Z');
    expect(nextDueAt({ schedule: 'daily', atHour: 7, tz: 'UTC', lastRunAt: null }, now).getTime()).toBe(now);
  });

  it('skips the weekend for a weekdays watcher', () => {
    // 19 Sep 2026 is a Saturday; 20 Sep is a Sunday.
    const sat = Date.parse('2026-09-19T10:00:00Z');
    const due = nextDueAt({ schedule: 'weekdays', atHour: 7, tz: 'UTC', lastRunAt: null }, sat);
    expect(due.getUTCDay(), 'must not land on a weekend').toBeGreaterThan(0);
    expect(due.getUTCDay()).toBeLessThan(6);
  });

  it('says nothing for a watcher that is not going to run', () => {
    // Paused, switched off, or stopped after three failures — no next check,
    // and the screen says why rather than printing a time that will not happen.
    expect(nextDueAt({ schedule: 'daily', enabled: false })).toBeNull();
    expect(nextDueAt({ schedule: 'daily', status: 'degraded' })).toBeNull();
    expect(nextDueAt({ schedule: 'daily', status: 'paused' })).toBeNull();
    expect(nextDueAt({ schedule: 'nonsense' })).toBeNull();
  });

  it('honours the owner\'s clock, not the container\'s', () => {
    // 05:00 UTC is 10:30 in Kolkata — past a 07:00 local briefing, so it is
    // due now there and still hours away in London.
    const at = Date.parse('2026-09-22T05:00:00Z');
    const india = nextDueAt({ schedule: 'daily', atHour: 7, tz: 'Asia/Kolkata', lastRunAt: null }, at);
    const london = nextDueAt({ schedule: 'daily', atHour: 7, tz: 'Europe/London', lastRunAt: null }, at);
    expect(india.getTime()).toBe(at);
    expect(london.getTime()).toBeGreaterThan(at);
  });
});

describe('the finding lifecycle is unchanged', () => {
  it('still reports new, still true and resolved', () => {
    // The diff is the part that already worked. Evidence rides along with it;
    // it must not have altered what the three states mean.
    const previous = [{ key: 'a', state: 'open' }, { key: 'b', state: 'open' }];
    expect(diffFindings(previous, ['a', 'c'])).toEqual({
      new: ['c'], stillTrue: ['a'], resolved: ['b'],
    });
  });

  it('keys on identity, so a corrected name is the same finding', () => {
    expect(findingKey({ id: 'STU-0182', name: 'Aarav Sharma' })).toBe('STU-0182');
    expect(findingKey({ id: 'STU-0182', name: 'Aarav Sharmaa' })).toBe('STU-0182');
  });
});
