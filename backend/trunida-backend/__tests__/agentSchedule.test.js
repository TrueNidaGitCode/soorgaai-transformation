/**
 * An agent is the application noticing something without being asked.
 *
 * Everything the delivered application does today happens because somebody
 * opened it and typed. The person it is built for — whoever runs operations
 * and admin at a small business — does not want to go and ask. They want to be
 * told when a student stopped turning up, when an invoice went past forty days,
 * when a supplier never confirmed.
 *
 * Every decision an agent makes is taken in code, so all of it is testable
 * without a clock, a model, or a database. That is the point of the design as
 * much as it is the point of this file.
 */

import { describe, it, expect } from 'vitest';
import {
  dueAgents, localParts, evaluateCondition, countRows, findingKey, diffFindings,
  SCHEDULES, MAX_FAILURES,
} from '../eame-template/services/agentService.js';

const IST = 'Asia/Kolkata';
/** 01:45 UTC is 07:15 in Bengaluru. Fri 18 Sep 2026, and Sat 19 Sep. */
const FRI_0715_IST = Date.parse('2026-09-18T01:45:00Z');
const SAT_0715_IST = Date.parse('2026-09-19T01:45:00Z');

const agent = (over = {}) => ({
  _id: 'a1', name: 'Dropout Watch', question: 'students with no attendance in 14 days',
  schedule: 'weekdays', atHour: 7, tz: IST, enabled: true, status: 'active',
  lastRunAt: null, failures: 0, condition: { over: 'rows', op: 'gt', value: 0 },
  ...over,
});

describe('the timezone is not a detail', () => {
  it('reads the wall clock where the person is, not where the container is', () => {
    /*
     * The application runs in UTC and the office does not. "Every weekday at
     * 7am" firing at 07:00 UTC reaches Bengaluru at half past twelve — not a
     * morning briefing, an interruption in the middle of the day.
     */
    const utc = localParts(FRI_0715_IST, 'UTC');
    const ist = localParts(FRI_0715_IST, IST);
    expect(utc.hour).toBe(1);
    expect(ist.hour).toBe(7);
    expect(ist.weekday).toBe('Fri');
  });

  it('knows a weekend where the person is', () => {
    expect(localParts(SAT_0715_IST, IST).isWeekend).toBe(true);
    expect(localParts(FRI_0715_IST, IST).isWeekend).toBe(false);
  });

  it('falls back rather than stopping every agent on a bad timezone', () => {
    const p = localParts(FRI_0715_IST, 'Not/AZone');
    expect(p.hour).toBe(1);
    expect(p.day).toBe('2026-09-18');
  });
});

describe('when an agent is due', () => {
  it('runs at its hour, in its own timezone', () => {
    expect(dueAgents([agent()], FRI_0715_IST)).toHaveLength(1);
  });

  it('stays quiet before its hour', () => {
    // 04:15 IST on Fri 18th — the agent wants 07:00.
    const early = Date.parse('2026-09-17T22:45:00Z');
    expect(dueAgents([agent()], early)).toHaveLength(0);
  });

  it('does not run twice on the same local day', () => {
    const ranAt0705 = agent({ lastRunAt: new Date(Date.parse('2026-09-18T01:35:00Z')) }); // 07:05 IST, same day
    expect(dueAgents([ranAt0705], FRI_0715_IST)).toHaveLength(0);
  });

  it('runs again the next local day', () => {
    const yesterday = agent({ lastRunAt: new Date(Date.parse('2026-09-17T01:35:00Z')) }); // Thu 07:05 IST
    expect(dueAgents([yesterday], FRI_0715_IST)).toHaveLength(1);
  });

  it('does not drift, because a daily agent is due on the calendar not the clock', () => {
    /*
     * Elapsed time alone would make a 07:04 run schedule the next for 07:04
     * tomorrow, then 07:09, and a week later the morning briefing arrives at
     * lunch. So "daily" means the local date changed, not "24 hours passed".
     */
    const ranLate = agent({ lastRunAt: new Date(Date.parse('2026-09-17T18:00:00Z')) }); // Thu 23:30 IST
    expect(dueAgents([ranLate], FRI_0715_IST)).toHaveLength(1);
  });

  it('skips the weekend when it was asked for weekdays', () => {
    expect(dueAgents([agent()], SAT_0715_IST)).toHaveLength(0);
    expect(dueAgents([agent({ schedule: 'daily' })], SAT_0715_IST)).toHaveLength(1);
  });

  it('measures an hourly agent on elapsed time, where the hour of day is irrelevant', () => {
    const h = { ...agent({ schedule: 'hourly' }) };
    expect(dueAgents([{ ...h, lastRunAt: new Date(FRI_0715_IST - 61 * 60 * 1000) }], FRI_0715_IST)).toHaveLength(1);
    expect(dueAgents([{ ...h, lastRunAt: new Date(FRI_0715_IST - 10 * 60 * 1000) }], FRI_0715_IST)).toHaveLength(0);
  });
});

describe('an agent that is not running', () => {
  it('is skipped when switched off', () => {
    expect(dueAgents([agent({ enabled: false })], FRI_0715_IST)).toHaveLength(0);
    expect(dueAgents([agent({ status: 'paused' })], FRI_0715_IST)).toHaveLength(0);
  });

  it('is skipped once it has stopped itself', () => {
    // An agent that silently errors for ever is worse than one plainly broken.
    expect(dueAgents([agent({ status: 'degraded' })], FRI_0715_IST)).toHaveLength(0);
    expect(MAX_FAILURES).toBe(3);
  });

  it('is skipped on a schedule nobody defined', () => {
    expect(dueAgents([agent({ schedule: 'fortnightly' })], FRI_0715_IST)).toHaveLength(0);
    expect(Object.keys(SCHEDULES).sort()).toEqual(['daily', 'hourly', 'weekdays']);
  });

  it('survives a list with rubbish in it', () => {
    expect(dueAgents([null, undefined, {}, agent()], FRI_0715_IST)).toHaveLength(1);
    expect(dueAgents(null)).toEqual([]);
  });
});

describe('deciding whether to speak, in code', () => {
  const found = (n) => ({ groups: [{ items: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}` })) }], checked: true, state: 'ok' });

  it('counts what was actually found', () => {
    expect(countRows(found(3))).toBe(3);
    expect(countRows({ groups: [] })).toBe(0);
    expect(countRows(null)).toBe(0);
  });

  it('fires when there is something and stays quiet when there is not', () => {
    const c = { over: 'rows', op: 'gt', value: 0 };
    expect(evaluateCondition(c, found(2))).toBe(true);
    expect(evaluateCondition(c, found(0))).toBe(false);
  });

  it('never speaks from an answer the pipeline would not stand behind', () => {
    /*
     * `checked: false` means validation did not run. A finding built on it is
     * an assertion the application itself declined to make — and this agent
     * would be messaging somebody's customer with it.
     */
    expect(evaluateCondition({ over: 'rows', op: 'gt', value: 0 }, { ...found(5), checked: false })).toBe(false);
  });

  it('is silent on a condition nobody can evaluate, rather than noisy', () => {
    // The dangerous default. An unknown rule must not mean "message them every
    // five minutes".
    expect(evaluateCondition(null, found(5))).toBe(false);
    expect(evaluateCondition({ over: 'rows', op: 'roughly', value: 0 }, found(5))).toBe(false);
    expect(evaluateCondition({ over: 'vibes', op: 'gt', value: 0 }, found(5))).toBe(false);
  });

  it('can watch the validation state as well as the count', () => {
    expect(evaluateCondition({ over: 'state', op: 'eq', value: 'unknown' }, { ...found(0), state: 'unknown' })).toBe(true);
  });
});

describe('remembering what it already said', () => {
  it('identifies a finding by the thing, not the run', () => {
    expect(findingKey({ id: 'stu-7', name: 'Ravi' })).toBe('stu-7');
    // Names repeat and get corrected, so the id wins where there is one.
    expect(findingKey({ name: '  Ravi Kumar ' })).toBe('ravi kumar');
    expect(findingKey({})).toBe('');
  });

  it('says a thing once, not every morning for a year', () => {
    /*
     * The rule the whole feature lives or dies by. An agent that reports the
     * same overdue invoice daily is one somebody learns to ignore, and then
     * the real one arrives into a habit of not reading.
     */
    const before = [{ key: 'inv-1', state: 'open' }];
    const d = diffFindings(before, ['inv-1', 'inv-2']);
    expect(d.new).toEqual(['inv-2']);
    expect(d.stillTrue).toEqual(['inv-1']);
    expect(d.resolved).toEqual([]);
  });

  it('says when something has resolved, which is the only proof it is working', () => {
    const before = [{ key: 'stu-7', state: 'open' }];
    expect(diffFindings(before, []).resolved).toEqual(['stu-7']);
  });

  it('reports something that comes back as new again', () => {
    const before = [{ key: 'stu-7', state: 'resolved' }];
    const d = diffFindings(before, ['stu-7']);
    expect(d.new).toEqual(['stu-7']);
    expect(d.stillTrue).toEqual([]);
  });

  it('treats the first run as all new, and no history as nothing resolved', () => {
    const d = diffFindings([], ['a', 'b']);
    expect(d.new).toEqual(['a', 'b']);
    expect(d.resolved).toEqual([]);
  });

  it('does not report the same key twice in one run', () => {
    expect(diffFindings([], ['a', 'a', 'b']).new).toEqual(['a', 'b']);
  });
});
