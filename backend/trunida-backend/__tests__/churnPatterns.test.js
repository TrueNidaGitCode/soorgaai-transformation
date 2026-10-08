/**
 * Learning the patterns that precede churn (eame-template/services/churnPatterns.js).
 *
 * The test that matters is the pair: a planted pattern must be found, with
 * its numbers, and pure noise must produce nothing. A learner that finds
 * patterns in noise is worse than none — it sends the front desk after
 * customers for a reason that is not there.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEvents, byPerson, churnOutcome, learnPatterns, matchPattern, signalsIn, statusRarity,
  normalizeDefinition, definitionSentence, rolesOf, MIN_CHURNED, MIN_SUPPORT, MIN_STRENGTH,
} from '../eame-template/services/churnPatterns.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 1);
const iso = (t) => new Date(t).toISOString().slice(0, 10);

/** A small deterministic random, so the histories are the same every run. */
function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

/**
 * A clinic's year: weekly appointments and monthly payments.
 * `churners` leave; with `planted`, the 30 days before they leave carry two
 * No Shows and a failed payment. Stayers miss the odd appointment at random.
 */
function clinic({ churners = 35, stayers = 85, planted = true, noShowRate = 0.03, seed = 7 } = {}) {
  const rand = rng(seed);
  const appts = [];
  const pays = [];
  const start = NOW - 360 * DAY;
  const person = (i, leaves) => {
    const name = `${leaves ? 'Left' : 'Stays'} Person ${i}`;
    const end = leaves ? NOW - (100 + Math.floor(rand() * 120)) * DAY : NOW - 2 * DAY;
    let n = 0;
    for (let t = start + Math.floor(rand() * 7) * DAY; t <= end; t += 7 * DAY) {
      const lastMonth = leaves && end - t < 30 * DAY;
      let status = rand() < noShowRate ? 'No Show' : 'Attended';
      if (planted && lastMonth && n < 2) { status = 'No Show'; n++; }
      appts.push([name, iso(t), status]);
    }
    for (let t = start; t <= end; t += 30 * DAY) {
      const lastMonth = leaves && end - t < 30 * DAY;
      pays.push([name, iso(t), planted && lastMonth ? 'Failed' : 'Paid']);
    }
    // The last record is always an appointment on their final day.
    appts.push([name, iso(end), 'Attended']);
  };
  for (let i = 0; i < churners; i++) person(i, true);
  for (let i = 0; i < stayers; i++) person(i, false);
  return [
    { name: 'Appointments', columns: ['Patient Name', 'Appointment Date', 'Status'], rows: appts },
    { name: 'Payments', columns: ['Customer', 'Payment Date', 'Status'], rows: pays },
  ];
}

const DEF = normalizeDefinition({ inactiveDays: null, gapMultiple: 3, minDays: 30, statusWords: ['cancelled'] });

describe('reading the records', () => {
  it('finds the person, the date and the status in each dataset', () => {
    expect(rolesOf(['Patient Name', 'Appointment Date', 'Status'])).toEqual({ person: 'Patient Name', date: 'Appointment Date', status: 'Status' });
    expect(rolesOf(['Customer', 'Payment Date', 'Status']).person).toBe('Customer');
  });

  it('joins one person across datasets by name', () => {
    const people = byPerson(buildEvents(clinic({ churners: 1, stayers: 0 })));
    const p = [...people.values()][0];
    expect(new Set(p.events.map((e) => e.dataset))).toEqual(new Set(['Appointments', 'Payments']));
  });
});

describe('who left', () => {
  const person = (events) => ({ key: 'a', name: 'A', events: events.map(([days, status]) => ({ at: NOW - days * DAY, status, dataset: 'Appointments' })) });

  it('counts a long silence as leaving, at their last record', () => {
    const out = churnOutcome(person([[200, 'Attended'], [193, 'Attended'], [186, 'Attended'], [179, 'Attended']]), DEF, NOW);
    expect(out.churned).toBe(true);
    expect(out.at).toBe(NOW - 179 * DAY);
  });

  it('does not count a cancelled appointment they came back after', () => {
    const out = churnOutcome(person([[30, 'Cancelled'], [20, 'Attended'], [10, 'Attended'], [3, 'Attended']]), DEF, NOW);
    expect(out.churned).toBe(false);
  });

  it('counts a cancellation that is their last record', () => {
    const out = churnOutcome(person([[30, 'Attended'], [20, 'Attended'], [10, 'Cancelled']]), DEF, NOW);
    expect(out).toMatchObject({ churned: true, how: 'status' });
  });
});

describe('learning', () => {
  it('finds a planted pattern, with its numbers', () => {
    const events = buildEvents(clinic());
    const out = learnPatterns({ events, def: DEF, now: NOW });
    expect(out.enough).toBe(true);
    expect(out.churned).toBeGreaterThanOrEqual(MIN_CHURNED);
    expect(out.candidates.length).toBeGreaterThan(0);
    const ids = out.candidates.flatMap((c) => c.signals.map((s) => s.id));
    expect(ids.some((id) => id === 'status|Appointments|no show' || id === 'status|Payments|failed')).toBe(true);
    for (const c of out.candidates) {
      expect(c.withChurned).toBeGreaterThanOrEqual(MIN_SUPPORT);
      expect(c.strength).toBeGreaterThanOrEqual(MIN_STRENGTH);
      expect(c.label).toMatch(/No Show in Appointments|Failed in Payments|gap|Flagged|Fewer/);
    }
  });

  it('finds nothing in noise', () => {
    // Same clinic, nothing planted: no-shows fall on leavers and stayers alike.
    const events = buildEvents(clinic({ planted: false, noShowRate: 0.08, seed: 11 }));
    const out = learnPatterns({ events, def: DEF, now: NOW });
    const statusPatterns = out.candidates.filter((c) => c.signals.some((s) => s.id.startsWith('status|')));
    expect(statusPatterns).toEqual([]);
  });

  it('says it is still learning when too few have left', () => {
    const out = learnPatterns({ events: buildEvents(clinic({ churners: 5 })), def: DEF, now: NOW });
    expect(out.enough).toBe(false);
    expect(out.candidates).toEqual([]);
  });

  it('never uses the status that defines leaving as a signal', () => {
    const events = buildEvents(clinic({ churners: 1, stayers: 0 }));
    events.push(...[1, 2, 3, 4].map((k) => ({ person: 'left person 0', name: 'Left Person 0', at: NOW - (300 - k) * DAY, dataset: 'Appointments', status: 'Cancelled' })));
    const people = byPerson(events);
    const p = people.get('left person 0');
    const sig = signalsIn(p, NOW - 400 * DAY, NOW, { rare: statusRarity(events), def: DEF });
    expect([...sig.keys()].some((k) => /cancelled/.test(k))).toBe(false);
  });
});

describe('watching for a learned pattern', () => {
  it('names the customers showing it now, with the records that show it', () => {
    const data = clinic();
    const events = buildEvents(data);
    const learned = learnPatterns({ events, def: DEF, now: NOW });
    const pattern = learned.candidates.find((c) => c.signals.some((s) => s.id === 'status|Appointments|no show'));
    expect(pattern).toBeTruthy();

    // One current customer drifting the same way, one doing fine.
    const add = (name, statuses) => statuses.forEach((st, i) => events.push({
      person: name.toLowerCase(), name, at: NOW - (200 - i * 7) * DAY > NOW - 40 * DAY ? NOW - (200 - i * 7) * DAY : NOW - (200 - i * 7) * DAY,
      dataset: 'Appointments', status: st,
    }));
    const weeks = Array.from({ length: 28 }, () => 'Attended');
    add('Drifting Now', [...weeks.slice(0, 24), 'No Show', 'No Show', 'Attended', 'Attended']);
    add('Doing Fine', weeks);
    events.push({ person: 'drifting now', name: 'Drifting Now', at: NOW - 10 * DAY, dataset: 'Payments', status: 'Failed' });

    const items = matchPattern(pattern, { events, def: DEF, now: NOW });
    const names = items.map((i) => i.name);
    expect(names).toContain('Drifting Now');
    expect(names).not.toContain('Doing Fine');
    const mine = items.find((i) => i.name === 'Drifting Now');
    expect(mine.lines[0][0]).toMatch(/No Show|Failed/);
  });
});

describe('the definition, in words', () => {
  it('reads as one sentence an owner can argue with', () => {
    expect(definitionSentence({ inactiveDays: 60, statusWords: ['not renewed'] }))
      .toBe('A customer counts as lost when they have had no activity for 60 days, or their last record says “not renewed”.');
  });
});
