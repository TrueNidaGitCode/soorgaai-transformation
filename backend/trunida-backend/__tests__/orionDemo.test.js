/**
 * The Project Orion demo, run on the product rather than described.
 *
 * The Pitches tab shows a delivery head what Orion's records would reveal.
 * These run the real catalogue and the real plan operators on the files the
 * demo uploads, on whichever day it is, so a line moves from "not built" to
 * "can show" only when this says it can.
 */
import { describe, it, expect } from 'vitest';
import { orionFiles } from '../scripts/make_orion_demo.mjs';
import { catalogueFor, matchDataset, entryFor } from '../eame-template/services/agentCatalogue.js';
import { matchesAll } from '../eame-template/services/reasoning.js';

const NOW = new Date();
const files = orionFiles(NOW);

function sheet(name) {
  const [head, ...rows] = files[name].trim().split('\n').map((l) => l.split(','));
  return { columns: head, rows };
}

const plan = sheet('Orion project plan.csv');
const PLAN = { name: 'Project plan', columns: plan.columns };
const keep = (where) => plan.rows.filter((r) => matchesAll(r, plan.columns, where, NOW)).map((r) => r[1]);

describe('the plan offers the watchers the demo talks about', () => {
  it('binds Behind Plan, Milestone At Risk, Over Estimate, Blocked Work and Unassigned Work', () => {
    const ready = catalogueFor([PLAN]).filter((r) => r.ready).map((r) => r.id);
    for (const id of ['behind-plan', 'milestone-at-risk', 'over-estimate', 'blocked-work', 'unassigned-work']) {
      expect(ready, id).toContain(id);
    }
  });
});

describe('what the demo shows, computed', () => {
  it('Milestone At Risk: firmware integration, 71% against 86% with the due date ten days out', () => {
    const m = matchDataset(entryFor('milestone-at-risk'), PLAN).using;
    expect(keep([
      [m.progress, 'below column', `${m.planned} by 10`],
      [m.due, 'within next days', '14'],
    ])).toEqual(['Firmware integration']);
  });

  it('Behind Plan also catches the blocked bench, whose milestone is further out', () => {
    const m = matchDataset(entryFor('behind-plan'), PLAN).using;
    expect(keep([[m.progress, 'below column', `${m.planned} by 10`]])).toEqual(['Firmware integration', 'HIL bench bring-up']);
  });

  it('Over Estimate: 164 hours against 120 on firmware, and the bench a little over', () => {
    const m = matchDataset(entryFor('over-estimate'), PLAN).using;
    expect(keep([[m.hours, 'above column', m.estimate]])).toEqual(
      ['Hardware schematic release', 'Firmware integration', 'HIL bench bring-up'],
    );
  });

  it('counts the validation items still open against firmware integration', () => {
    const v = sheet('Orion validation log.csv');
    const open = v.rows.filter((r) => matchesAll(r, v.columns, [['status', 'is any of', 'open|blocked'], ['linked_task', 'is', 'Firmware integration']]));
    expect(open).toHaveLength(2);
  });
});
