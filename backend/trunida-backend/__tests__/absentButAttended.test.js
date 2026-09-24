/**
 * The demonstration: a session delivered, and recorded as though it was not.
 *
 * ── Why this watcher exists ────────────────────────────────────────────────
 *
 * The first customer interviewed named it as his biggest problem. About twenty
 * bookings a month are left marked no-show when the patient arrived and was
 * treated — the front desk never marked them in. At ₹1,000 a booking that is
 * up to ₹20,000 a month, and nobody notices consistently: the HOD spots some
 * of them, whenever somebody happens to look.
 *
 * The catalogue already had No Show, which finds the opposite thing. A real
 * no-show is a fact of the week and costs nothing to know about. This is the
 * one that costs money, and it is not a scheduling detail — a session given
 * away is revenue, which is why it is filed under Money.
 *
 * ── Why it is expressible in code, which is the part that matters ─────────
 *
 * The answer pipeline decides in code and narrates with a model. A watcher
 * whose condition the model has to judge comes back checked:false and gets
 * discarded. This one is two clauses over one dataset — status matches
 * no-show, and a check-in time is not empty — both inside OPS, so a finding
 * from it is a finding the code stands behind.
 */
import fs from 'fs';
import { describe, it, expect } from 'vitest';
import { CATALOGUE, ROLES, entryFor } from '../eame-template/services/agentCatalogue.js';
import { OPS, matchesAll } from '../eame-template/services/reasoning.js';
import { attentionAreas, categoryOf, categoriesFor } from '../services/attentionAreasService.js';
import { watcherPlan } from '../services/watcherPlanService.js';
import { activeCategories, coversWatcher } from '../eame-template/services/coverage.js';

const WATCHER = 'absent-but-attended';

describe('the watcher itself', () => {
  const entry = entryFor(WATCHER);

  it('is in the catalogue, under Money', () => {
    expect(entry, 'the watcher').toBeTruthy();
    // A session delivered and never counted is revenue, not a rota problem.
    expect(entry.area).toBe('Money');
    expect(entry.says).toMatch(/no-show/i);
  });

  it('is not the No Show watcher wearing a different name', () => {
    /*
     * They are opposites and the catalogue needs both. No Show finds people
     * who did not come; this finds people who did and were recorded as not
     * having. Collapsing them would lose the only one worth money.
     */
    const noShow = entryFor('no-show');
    expect(noShow).toBeTruthy();
    expect(noShow.question).not.toEqual(entry.question);
    expect(entry.question).toMatch(/but which has a \{when\} recorded/);
  });

  it('asks for the three roles a mismarked record needs', () => {
    // The booking, the status that is wrong, and the trace that proves it.
    expect(entry.needs).toEqual(['slot', 'status', 'when']);
    for (const role of entry.needs) expect(ROLES[role], role).toBeTruthy();
  });

  it('matches the columns a real attendance log has', () => {
    /*
     * Taken from the customer's own export: appointment_id, attendance_status
     * and check_in_timestamp. A watcher whose roles do not match the real
     * column names is offered to nobody.
     */
    const columns = ['log_id', 'appointment_id', 'client_id', 'cabin_or_bay_id',
      'scheduled_start_time', 'check_in_timestamp', 'session_start_timestamp',
      'check_in_method', 'attendance_status', 'actual_duration_mins', 'therapist_badge_id'];
    for (const role of entry.needs) {
      expect(columns.some((c) => ROLES[role].test(c)), `${role} matches no column`).toBe(true);
    }
  });
});

describe('the condition is one the code can decide', () => {
  /*
   * Run against rows shaped like the customer's export. The point is not that
   * these two clauses are what a planner will choose — it is that the question
   * CAN be answered without the model judging anything, which is what keeps a
   * finding from being thrown away as unchecked.
   */
  const columns = ['appointment_id', 'attendance_status', 'check_in_timestamp', 'actual_duration_mins'];
  const where = [['attendance_status', 'matches', 'no-show|no show|absent'],
    ['check_in_timestamp', 'not empty']];

  const row = (id, status, checkIn, mins) => [id, status, checkIn, mins];

  it('uses only operators the pipeline has', () => {
    for (const [, op] of where) expect(OPS.has(op), op).toBe(true);
  });

  it('finds the session that was delivered and recorded as missed', () => {
    const found = row('APT-9006', 'No-Show', '2026-09-22 11:00', 45);
    expect(matchesAll(found, columns, where)).toBe(true);
  });

  it('leaves a real no-show alone', () => {
    // No check-in, no duration: nobody came, and nothing is owed.
    expect(matchesAll(row('APT-9007', 'No-Show', '', 0), columns, where)).toBe(false);
  });

  it('leaves an ordinary completed session alone', () => {
    expect(matchesAll(row('APT-9001', 'Completed', '2026-09-20 09:00', 45), columns, where)).toBe(false);
  });

  it('catches the spellings a front desk actually types', () => {
    for (const status of ['No-Show', 'no show', 'NO SHOW', 'Absent', 'marked absent']) {
      expect(matchesAll(row('APT-1', status, '2026-09-22 11:00', 40), columns, where), status).toBe(true);
    }
  });
});

describe('where it lands on the customer’s screen', () => {
  it('is grouped under the money category for a clinic', () => {
    /*
     * The industry overlay decides which heading a finding appears under. On
     * Hobby only the first two categories are unlocked, so a watcher filed
     * under Compliance would be built, correct, and invisible.
     */
    const areas = attentionAreas('Clinics & Wellness');
    expect(categoryOf(areas, WATCHER)).toBe('Cash');
  });

  it('is grouped under the money category for an academy too', () => {
    // The same problem: a session delivered and marked absent. Vesoma's own
    // blueprint is still classified Sports Academies, which is the other
    // reason this one matters.
    expect(categoryOf(attentionAreas('Sports Academies'), WATCHER)).toBe('Fees');
  });

  it('is named first in its category, because it is the one with money on it', () => {
    const cash = attentionAreas('Clinics & Wellness').find((a) => a.name === 'Cash');
    expect(cash.watchers[0]).toBe(WATCHER);
  });
});

describe('the demonstration has something to find', () => {
  const src = fs.readFileSync(new URL('../services/syntheticDatasetService.js', import.meta.url), 'utf8');

  it('asks the sample for records that contradict themselves', () => {
    /*
     * Every watcher in the catalogue hunts an anomaly, and a sample of
     * well-behaved rows gives a customer an empty board — which demonstrates
     * nothing, and reads as a product that does not work rather than a
     * business with no problems.
     */
    expect(src).toMatch(/CONTRADICT THEMSELVES/);
    expect(src).toMatch(/marked absent with a check-in time/);
  });

  it('does not flag them, because a flagged anomaly is not a detection', () => {
    expect(src).toMatch(/Do not flag them/);
  });

  it('keeps its rules numbered, so none of them is silently dropped', () => {
    // A duplicated number is how an instruction gets read as a restatement of
    // the one above it.
    const numbers = [...src.matchAll(/^\s+[`']?(\d)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b));
  });
});

describe('the demonstration runs on the smallest plan', () => {
  /*
   * Hobby buys two business categories. That is the constraint the whole
   * demonstration has to survive: a watcher that is built, correct, and filed
   * under a locked category shows the customer a padlock.
   *
   * The chain has four links and every one of them can break silently —
   * the objective has to score the watcher, the score has to reach the plan,
   * the plan has to rank its category into the top two, and the category has
   * to be the one the overlay files it under. So it is run end to end here,
   * from a sentence somebody would actually say.
   */
  const SAID = 'About twenty bookings a month are marked absent even though the patient attended '
    + 'and was treated. The front desk misses marking attendance, so sessions are delivered and '
    + 'never counted. Revenue leakage is our biggest problem.';

  it('is the first watcher the objective reaches for', () => {
    const plan = watcherPlan({ businessObjective: SAID });
    expect(plan.order[0]).toBe(WATCHER);
    // And it starts on its own, so the first morning has the finding on it.
    expect(plan.startHere).toContain(WATCHER);
  });

  it('is not reached by a business that merely mentions no-shows', () => {
    /*
     * "We get a lot of no-shows" means people who did not turn up. Scoring
     * this watcher for that sentence would start a watcher that reports the
     * opposite of what they said, on their first morning.
     */
    const plan = watcherPlan({ businessObjective: 'We get a lot of no-shows and missed appointments.' });
    expect(plan.order).not.toContain(WATCHER);
    expect(plan.order).toContain('no-show');
  });

  it('unlocks the category it lives in, on a two-category plan', () => {
    const plan = watcherPlan({ businessObjective: SAID });
    const categories = categoriesFor('Clinics & Wellness');
    const before = process.env.APP_CATEGORY_LIMIT;
    process.env.APP_CATEGORY_LIMIT = '2';
    try {
      const open = activeCategories({ categories, order: plan.order });
      expect(open).toHaveLength(2);
      expect(open).toContain('Cash');
      expect(coversWatcher({ categories, order: plan.order }, WATCHER)).toBe(true);
    } finally {
      if (before === undefined) delete process.env.APP_CATEGORY_LIMIT;
      else process.env.APP_CATEGORY_LIMIT = before;
    }
  });
});

describe('every watcher the overlays name actually exists', () => {
  it('holds for both industries, so a category cannot point at nothing', () => {
    /*
     * The table is text and the catalogue is code; a typo in one is a
     * category that quietly loses a watcher. Cheap to check, and this is the
     * commit that adds a name to both.
     */
    const known = new Set(CATALOGUE.map((e) => e.id));
    for (const industry of ['Clinics & Wellness', 'Sports Academies']) {
      for (const area of attentionAreas(industry)) {
        for (const w of area.watchers) {
          expect(known.has(w), `${industry}/${area.name}: ${w}`).toBe(true);
        }
      }
    }
  });
});
