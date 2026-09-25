/**
 * Does the product support the vertical the deck sells?
 *
 * ── What the audit found ───────────────────────────────────────────────────
 *
 * The deck's beachhead is engineering schedule risk. Measured against a real
 * project export — task_id, planned_finish, baseline_finish, actual_finish,
 * percent_complete, assigned_to, float_days — the catalogue offered TEN of
 * its watchers, and not one of them was about a schedule. They were people
 * and records watchers that happened to match a name column.
 *
 * The cause was not missing watchers. It was that no column on a plan matched
 * the roles: `due` matched nothing at all, so every deadline watcher in the
 * catalogue was invisible, and `slot` matched nothing, so every Schedule
 * watcher was too. A planner writes "planned_finish", not "due_date".
 *
 * ── What this file pins ────────────────────────────────────────────────────
 *
 * That the roles still match a plan, that the three new watchers are
 * expressible in code rather than judged by a model, and that an objective
 * written in a planner's words actually reaches them. Each was checked by
 * running it, not by reading it.
 */
import { describe, it, expect } from 'vitest';
import { CATALOGUE, ROLES, entryFor } from '../eame-template/services/agentCatalogue.js';
import { OPS, matchesAll } from '../eame-template/services/reasoning.js';
import { watcherPlan } from '../services/watcherPlanService.js';
import { attentionAreas, categoryOf, categoriesFor } from '../services/attentionAreasService.js';
import { activeCategories } from '../eame-template/services/coverage.js';

/** A real project schedule export, column for column. */
const PLAN_COLUMNS = ['task_id', 'task_name', 'wbs_code', 'planned_start', 'planned_finish',
  'baseline_finish', 'actual_finish', 'percent_complete', 'status', 'assigned_to', 'owner',
  'discipline', 'predecessor_id', 'milestone', 'last_updated', 'float_days', 'change_request_id',
  'resource_name'];

/** The roles those columns cover. */
function rolesCovered(columns) {
  return new Set(Object.entries(ROLES)
    .filter(([, re]) => columns.some((c) => re.test(c)))
    .map(([role]) => role));
}

describe('a project schedule is data this product can read', () => {
  const have = rolesCovered(PLAN_COLUMNS);

  it('recognises the date a plan is measured against', () => {
    /*
     * The single blocker. `due` matched none of these, so overdue,
     * approaching and late-delivery were offered to nobody on project data.
     */
    expect(have.has('due'), 'no column reads as a due date').toBe(true);
    for (const c of ['planned_finish', 'baseline_finish', 'milestone']) {
      expect(ROLES.due.test(c), c).toBe(true);
    }
  });

  it('recognises a task as a unit of scheduled work', () => {
    expect(have.has('slot')).toBe(true);
    for (const c of ['task_name', 'milestone', 'wbs_code']) expect(ROLES.slot.test(c), c).toBe(true);
  });

  it('recognises the person work is assigned to', () => {
    // A planner writes assigned_to or owner. Neither is a "customer" word.
    for (const c of ['assigned_to', 'owner']) expect(ROLES.who.test(c), c).toBe(true);
  });

  it('offers most of the catalogue, where it used to offer a third', () => {
    const offered = CATALOGUE.filter((e) => e.needs.every((n) => have.has(n)));
    expect(offered.length).toBeGreaterThanOrEqual(20);
    // And the ones that matter are among them.
    for (const id of ['no-progress', 'blocked-work', 'unassigned-work', 'promise-overdue',
      'deadline-approaching']) {
      expect(offered.map((e) => e.id), id).toContain(id);
    }
  });
});

describe('the three schedule watchers decide in code', () => {
  const columns = ['task_id', 'status', 'assigned_to', 'last_updated'];
  const row = (id, status, who, updated) => [id, status, who, updated];

  it('are in the catalogue, under Schedule', () => {
    for (const id of ['no-progress', 'blocked-work', 'unassigned-work']) {
      expect(entryFor(id), id).toBeTruthy();
      expect(entryFor(id).area, id).toBe('Schedule');
    }
  });

  it('finds work that has stopped moving', () => {
    const where = [['status', 'is not', 'done'], ['last_updated', 'before', '2026-09-11']];
    for (const [, op] of where) expect(OPS.has(op), op).toBe(true);
    expect(matchesAll(row('T-1', 'In progress', 'AB', '2026-08-30'), columns, where)).toBe(true);
    expect(matchesAll(row('T-2', 'In progress', 'AB', '2026-09-24'), columns, where)).toBe(false);
    expect(matchesAll(row('T-3', 'Done', 'AB', '2026-08-30'), columns, where)).toBe(false);
  });

  it('finds work that is waiting on somebody', () => {
    const where = [['status', 'matches', 'blocked|on hold|waiting']];
    expect(matchesAll(row('T-4', 'Blocked', 'AB', ''), columns, where)).toBe(true);
    expect(matchesAll(row('T-5', 'On Hold', 'AB', ''), columns, where)).toBe(true);
    expect(matchesAll(row('T-6', 'Waiting for approval', 'AB', ''), columns, where)).toBe(true);
    expect(matchesAll(row('T-7', 'In progress', 'AB', ''), columns, where)).toBe(false);
  });

  it('finds open work nobody owns', () => {
    const where = [['status', 'is not', 'done'], ['assigned_to', 'empty']];
    expect(matchesAll(row('T-8', 'Not started', '', ''), columns, where)).toBe(true);
    expect(matchesAll(row('T-9', 'Not started', 'AB', ''), columns, where)).toBe(false);
  });

  it('does not pretend to compare planned against actual', () => {
    /*
     * The honest gap. A where-clause compares a column to a VALUE, so
     * "actual_finish after planned_finish" cannot be expressed, and no
     * watcher claims to. It is named on the Capital page as roadmap instead.
     */
    const q = ['no-progress', 'blocked-work', 'unassigned-work'].map((id) => entryFor(id).question).join(' ');
    expect(q).not.toMatch(/actual/i);
    expect(q).not.toMatch(/depend/i);
  });
});

describe('a planner’s words reach them', () => {
  /** The deck's own initial problem, said the way a customer says it. */
  const SAID = 'We find out a project is going to slip only after the warning signals have already '
    + 'accumulated. Tasks sit blocked waiting on approvals, work goes unassigned, and nobody sees '
    + 'the milestone is at risk until the date passes.';

  it('ranks the schedule watchers first, and starts them', () => {
    const plan = watcherPlan({ businessObjective: SAID });
    expect(plan.order.slice(0, 4)).toEqual(
      expect.arrayContaining(['blocked-work', 'no-progress', 'unassigned-work']),
    );
    expect(plan.startHere).toContain('no-progress');
  });

  it('is not reached by a business talking about its diary', () => {
    // "Empty slots this week" is a booking problem, not a plan slipping.
    const plan = watcherPlan({ businessObjective: 'We have empty slots and no-shows every week.' });
    for (const id of ['no-progress', 'blocked-work', 'unassigned-work']) {
      expect(plan.order, id).not.toContain(id);
    }
  });

  it('opens the Schedule category on the smallest plan', () => {
    /*
     * Four links, each silent when it breaks: the words score the watcher,
     * the score reaches the plan, the plan ranks Schedule into the top two,
     * and the Automotive overlay files them there.
     */
    const plan = watcherPlan({ businessObjective: SAID });
    expect(categoryOf(attentionAreas('Automotive'), 'no-progress')).toBe('Schedule');
    const before = process.env.APP_CATEGORY_LIMIT;
    process.env.APP_CATEGORY_LIMIT = '2';
    try {
      const open = activeCategories({ categories: categoriesFor('Automotive'), order: plan.order });
      expect(open).toContain('Schedule');
    } finally {
      if (before === undefined) delete process.env.APP_CATEGORY_LIMIT;
      else process.env.APP_CATEGORY_LIMIT = before;
    }
  });
});
