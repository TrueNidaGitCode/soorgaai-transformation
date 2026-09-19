/**
 * What an application could watch, whether or not it is watching it yet.
 *
 * The agents screen used to open on an empty form — "call it ___, tell me when
 * ___" — which asks the owner to invent. Inventing is the one thing the person
 * this is built for cannot do; it is why they cannot use a coding assistant
 * either. They can recognise their own Tuesday in a list.
 *
 * The rule the whole file exists to hold:
 *
 *   The data decides what is POSSIBLE.
 *   Cob decides what is FIRST.
 *   Nothing decides what is INVISIBLE.
 */

import { describe, it, expect } from 'vitest';
import {
  CATALOGUE, AREAS, catalogueFor, matchDataset, assignRoles, columnsFor,
  fillQuestion, entryFor,
} from '../eame-template/services/agentCatalogue.js';

/** What a cricket academy's application actually holds. */
const ACADEMY = [
  { name: 'Session attendance', columns: ['Student Name', 'Session Date', 'Status', 'Coach'] },
  { name: 'Fee payments', columns: ['Student Name', 'Invoice No', 'Amount', 'Due Date', 'Paid'] },
];

describe('the catalogue itself', () => {
  it('covers the seven areas of a small team’s administration', () => {
    expect(AREAS).toHaveLength(7);
    for (const e of CATALOGUE) expect(AREAS, e.id).toContain(e.area);
  });

  it('is written in the words somebody would use at their own desk', () => {
    for (const e of CATALOGUE) {
      // A name a person would recognise, not a category label.
      expect(e.name.length, e.id).toBeLessThan(28);
      expect(e.says.length, e.id).toBeGreaterThan(15);
      // No jargon that would send them looking for a manual.
      expect(`${e.name} ${e.says}`.toLowerCase(), e.id).not.toMatch(/threshold|trigger|query|predicate|entity/);
    }
  });

  it('has a unique id for every entry, because one tap creates by id', () => {
    const ids = CATALOGUE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never leaves a placeholder in a question a model would read', () => {
    // A role named in the question but absent from needs would reach the
    // model as literal braces.
    for (const e of CATALOGUE) {
      for (const m of e.question.matchAll(/\{([a-z]+)\}/g)) {
        if (m[1] === 'dataset') continue;
        expect(e.needs, `${e.id} asks for {${m[1]}} but does not need it`).toContain(m[1]);
      }
    }
  });
});

describe('one column may not play two parts', () => {
  it('assigns a distinct column to each role', () => {
    /*
     * The bug this was written for. "Session Date" satisfies both the slot
     * role and the when role, and letting it do both produced Missing
     * Attendance as "Session Date with no Session Date recorded" — a question
     * about nothing, offered as ready. It also made eighteen of twenty-eight
     * watchers look possible on a single attendance sheet.
     */
    const columns = ['Student Name', 'Session Date', 'Status'];
    const got = assignRoles(['who', 'when'], columns);
    expect(got.who).not.toBe(got.when);
  });

  it('refuses when there are not enough distinct columns', () => {
    // slot and when both want "Session Date", and there is only one of it.
    expect(assignRoles(['slot', 'when'], ['Session Date', 'Student Name'])).toBeNull();
  });

  it('solves it exactly rather than greedily', () => {
    /*
     * "Vendor Name" plays both who and supplier; "Contact" plays only who.
     * A greedy pass gives who the vendor column, finds nothing left for
     * supplier, and gives up — even though the assignment was there.
     */
    const got = assignRoles(['who', 'supplier'], ['Vendor Name', 'Contact']);
    expect(got).not.toBeNull();
    expect(got.supplier).toBe('Vendor Name');
    expect(got.who).toBe('Contact');
  });

  it('needs every role inside one dataset', () => {
    // A date in the invoices and a name in the attendance do not make an
    // overdue invoice.
    const split = [
      { name: 'Names', columns: ['Student Name'] },
      { name: 'Dates', columns: ['Session Date'] },
    ];
    expect(matchDataset(entryFor('stopped-coming'), split[0])).toBeNull();
    expect(matchDataset(entryFor('stopped-coming'), split[1])).toBeNull();
  });
});

describe('the question uses this application’s own column names', () => {
  it('fills in the real dataset and columns', () => {
    const entry = entryFor('stopped-coming');
    const q = fillQuestion(entry, matchDataset(entry, ACADEMY[0]));
    expect(q).toBe('Student Name in Session attendance with no Session Date in the last 14 days');
    expect(q).not.toMatch(/[{}]/);
  });

  it('leaves no braces behind whatever the entry', () => {
    for (const e of CATALOGUE) {
      for (const d of ACADEMY) {
        const m = matchDataset(e, d);
        if (m) expect(fillQuestion(e, m), e.id).not.toMatch(/[{}]/);
      }
    }
  });
});

describe('what the application offers', () => {
  const rows = catalogueFor(ACADEMY, {});

  it('offers every entry, always', () => {
    /*
     * The rule. An omitted watcher is undiscoverable — there is no "why is
     * this not here?" anywhere on a screen — and the judgement would have been
     * made before a row of real data arrived. A watcher shown and greyed costs
     * one line of text; one withheld costs the customer the feature.
     */
    expect(rows).toHaveLength(CATALOGUE.length);
  });

  it('marks what the data can support, and it is not everything', () => {
    const ready = rows.filter((r) => r.ready);
    expect(ready.length).toBeGreaterThan(3);
    expect(ready.length).toBeLessThan(CATALOGUE.length);
  });

  it('says what is missing in the owner’s terms, not the code’s', () => {
    /*
     * This line is what makes somebody connect a source, so it names the
     * records a person would recognise rather than the role keys the
     * matching uses.
     */
    const cold = rows.find((r) => r.id === 'expiring-soon');
    expect(cold.ready).toBe(false);
    expect(cold.missing).toBe('Needs records with a document and a due date');

    const noDoc = rows.find((r) => r.id === 'missing-document');
    expect(noDoc.missing).toBe('Needs records with a name and a document');
    // None of the role keys leak through as words.
    for (const key of ['who', 'doc', 'ref', 'slot', 'reply']) {
      expect(noDoc.missing, key).not.toMatch(new RegExp('\\b' + key + '\\b'));
    }
  });

  it('gives a ready entry everything needed to create it in one tap', () => {
    const r = rows.find((x) => x.id === 'overdue-invoice');
    expect(r.ready).toBe(true);
    expect(r.using).toBe('Fee payments');
    expect(r.question).toContain('Due Date');
    expect(r.schedule).toBeTruthy();
    expect(r.condition).toMatchObject({ over: 'rows' });
  });

  it('holds an application with no data at all', () => {
    const empty = catalogueFor([], {});
    expect(empty).toHaveLength(CATALOGUE.length);
    expect(empty.every((r) => !r.ready)).toBe(true);
    expect(empty.every((r) => r.missing)).toBe(true);
  });
});

describe('Cob orders it and cannot remove from it', () => {
  it('puts what it named first', () => {
    const rows = catalogueFor(ACADEMY, { order: ['overdue-invoice', 'stopped-coming'] });
    expect(rows[0].id).toBe('overdue-invoice');
    expect(rows[1].id).toBe('stopped-coming');
  });

  it('puts start-here above everything, including its own order', () => {
    const rows = catalogueFor(ACADEMY, { order: ['overdue-invoice'], startHere: ['stopped-coming'] });
    expect(rows[0].id).toBe('stopped-coming');
    expect(rows[0].startHere).toBe(true);
  });

  it('still shows an entry it never mentioned', () => {
    // The whole point. Promotion, never removal.
    const rows = catalogueFor(ACADEMY, { order: ['overdue-invoice'] });
    expect(rows.some((r) => r.id === 'repeat-complaint')).toBe(true);
  });

  it('works with no plan at all, because the plan is an improvement not a dependency', () => {
    // data/agents.json missing is the ordinary case for an older application.
    expect(catalogueFor(ACADEMY)).toHaveLength(CATALOGUE.length);
    expect(catalogueFor(ACADEMY, { order: 'nonsense', startHere: 7 })).toHaveLength(CATALOGUE.length);
  });

  it('sorts ready above greyed when nobody said otherwise', () => {
    const rows = catalogueFor(ACADEMY, {});
    const firstGreyed = rows.findIndex((r) => !r.ready);
    const lastReady = rows.map((r) => r.ready).lastIndexOf(true);
    expect(firstGreyed).toBeGreaterThan(lastReady - 1);
  });
});

describe('it costs nothing until somebody taps', () => {
  it('has no schedule of its own', () => {
    // A catalogue entry is a row of JSON. Only a created agent has a
    // schedule, and only a schedule spends money.
    const src = readCatalogue();
    expect(src).not.toContain('setInterval');
    expect(src).not.toContain('generate(');
    expect(src).not.toMatch(/await /);
  });
});

function readCatalogue() {
  // eslint-disable-next-line
  return require('fs').readFileSync(new URL('../eame-template/services/agentCatalogue.js', import.meta.url), 'utf8');
}
