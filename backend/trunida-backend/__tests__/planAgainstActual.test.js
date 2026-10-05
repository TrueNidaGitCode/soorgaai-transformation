/**
 * Plan against actual: the gap the engineering pitch rests on.
 *
 * "71% done against 86% planned" and "hours over the estimate" were the two
 * lines the Project Orion demo could not show, because every operator a plan
 * had compared a cell with a written value and neither of these is one: each
 * is one column against another on the same row. These pin the operators
 * that close it and the three watchers built on them.
 */
import { describe, it, expect } from 'vitest';
import { matchesAll, numberOf, OPS } from '../eame-template/services/reasoning.js';
import { entryFor, matchDataset, fillQuestion, catalogueFor, severityFor } from '../eame-template/services/agentCatalogue.js';

const COLS = ['task_name', 'owner', 'status', 'due_date', 'percent_complete', 'planned_percent',
  'estimated_hours', 'actual_hours'];
const NOW = new Date('2026-10-05T09:00:00');
const keep = (rows, where) => rows.filter((r) => matchesAll(r, COLS, where, NOW)).map((r) => r[0]);

// Project Orion, as rows a plan would hold.
const ORION = [
  ['Firmware integration', 'Asha', 'In progress', '2026-10-15', '71%', '86%', '120', '164'],
  ['Validation suite', 'Ravi', 'In progress', '2026-10-28', '40', '45', '200', '150'],
  ['HIL bench bring-up', 'Kiran', 'Blocked', '2026-12-01', '30', '55', '80', '82'],
  ['Customer FAT', 'Meera', 'Not started', '2026-10-09', '', '20', '40', ''],
];

describe('the operators', () => {
  it('are on the list a plan may use', () => {
    for (const op of ['below column', 'above column', 'within next days']) expect(OPS.has(op), op).toBe(true);
  });

  it('read a figure however a plan or a timesheet writes it', () => {
    expect(numberOf('71%')).toBe(71);
    expect(numberOf(' 1,240 ')).toBe(1240);
    expect(numberOf('12h')).toBe(12);
    expect(numberOf('12.5 hours')).toBe(12.5);
    expect(numberOf('about ten')).toBeNull();
    expect(numberOf('')).toBeNull();
  });

  it('finds work at least ten points behind its plan, and no further than the margin says', () => {
    expect(keep(ORION, [['percent_complete', 'below column', 'planned_percent by 10']]))
      .toEqual(['Firmware integration', 'HIL bench bring-up']);
    // Five behind is on plan.
    expect(keep(ORION, [['percent_complete', 'below column', 'planned_percent by 10']])).not.toContain('Validation suite');
  });

  it('never makes a finding out of a blank cell', () => {
    // Customer FAT has no progress recorded: unknown, not zero.
    expect(keep(ORION, [['percent_complete', 'below column', 'planned_percent']])).not.toContain('Customer FAT');
    expect(keep(ORION, [['actual_hours', 'above column', 'estimated_hours']])).not.toContain('Customer FAT');
  });

  it('finds hours over the estimate', () => {
    expect(keep(ORION, [['actual_hours', 'above column', 'estimated_hours']]))
      .toEqual(['Firmware integration', 'HIL bench bring-up']);
  });

  it('keeps a due date from today to N days ahead, and nothing past or later', () => {
    expect(keep(ORION, [['due_date', 'within next days', '14']])).toEqual(['Firmware integration', 'Customer FAT']);
    expect(keep([['Past', '', '', '2026-10-01', '', '', '', '']], [['due_date', 'within next days', '14']])).toEqual([]);
  });

  it('answers false rather than guessing when the other column is not there', () => {
    expect(keep(ORION, [['percent_complete', 'below column', 'no_such_column by 10']])).toEqual([]);
  });

  it('puts behind plan and due soon together as Milestone At Risk asks', () => {
    expect(keep(ORION, [
      ['percent_complete', 'below column', 'planned_percent by 10'],
      ['due_date', 'within next days', '14'],
    ])).toEqual(['Firmware integration']);
  });
});

describe('where the three watchers bind', () => {
  const PLAN = { name: 'Project Plan', columns: ['task_id', ...COLS] };
  const JIRA = { name: 'Issues (Jira)', columns: ['key', 'summary', 'type', 'status', 'assignee', 'created',
    'updated', 'due_date', 'original_estimate_hours', 'time_spent_hours'] };
  const DIARY = { name: 'Appointment Booking Diary', columns: ['appointment_id', 'client_name', 'practitioner_name',
    'appointment_date', 'start_time', 'booking_status', 'session_sequence_num'] };

  it('reads a plan by the name of the work, the actual against the planned', () => {
    const q = (id) => fillQuestion(entryFor(id), matchDataset(entryFor(id), PLAN));
    expect(q('behind-plan')).toBe('task_name in Project Plan whose percent_complete is below the planned_percent column by 10 or more');
    expect(q('milestone-at-risk')).toMatch(/and whose due_date is within the next 14 days$/);
    expect(q('over-estimate')).toBe('task_name in Project Plan whose actual_hours is above the estimated_hours column');
  });

  it('names the owner as the person on a plan, never the task', () => {
    const m = matchDataset(entryFor('unassigned-work'), PLAN);
    expect(m.using.who).toBe('owner');
    expect(m.using.slot).toBe('task_name');
  });

  it('reads Jira issues by their summary, so the Schedule watchers reach a tracker', () => {
    const ready = catalogueFor([JIRA]).filter((r) => r.ready).map((r) => r.id);
    for (const id of ['over-estimate', 'blocked-work', 'unassigned-work', 'deadline-approaching']) {
      expect(ready, id).toContain(id);
    }
    expect(matchDataset(entryFor('over-estimate'), JIRA).using).toMatchObject({
      hours: 'time_spent_hours', estimate: 'original_estimate_hours',
    });
  });

  it('stays off a clinic diary, which has no plan in it', () => {
    for (const id of ['behind-plan', 'milestone-at-risk', 'over-estimate']) {
      expect(matchDataset(entryFor(id), DIARY), id).toBeNull();
    }
  });

  it('puts a missed delivery at the top of the board', () => {
    expect(severityFor('milestone-at-risk')).toBe('high');
  });
});
