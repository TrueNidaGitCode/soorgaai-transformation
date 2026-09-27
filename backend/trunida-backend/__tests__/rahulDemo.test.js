/**
 * The demo, as a test: two systems that disagree, and the finding that follows.
 *
 * ── Why this exists beside the script ──────────────────────────────────────
 *
 * scripts/app-checks/rahul_demo.mjs walks the same chain and prints it, which
 * is what somebody runs before a meeting. This is the same chain with nothing
 * printed, so it runs in the suite and cannot rot quietly between demos.
 *
 * Every step is the real code: the catalogue matcher, the extraction with its
 * quote check, the sequence join. What is stubbed is the model, and it is
 * stubbed with a quote that IS in the transcript — so the check that follows
 * is doing work rather than being handed a pass.
 *
 * ── The control ────────────────────────────────────────────────────────────
 *
 * Priya is the point of this file. She rang, she was promised something, and
 * somebody DID book her in afterwards. A join that reported her as well would
 * look like it was working on a demo with one customer in it, and would put a
 * blameless receptionist on somebody's morning list at a real clinic.
 */
import { describe, it, expect } from 'vitest';
import { readSignals } from '../eame-template/services/callSignalService.js';
import { catalogueFor, entryFor, matchPair, fillQuestion }
  from '../eame-template/services/agentCatalogue.js';
import { joinOnEntity, matchesAll } from '../eame-template/services/reasoning.js';

const NOW = new Date('2026-09-20T09:00:00Z');

const DIARY = {
  name: 'Appointment Booking Diary',
  columns: ['Client Name', 'Appointment Date', 'Status', 'Practitioner'],
  rows: [
    ['Rahul Menon', '2026-09-12', 'No Show', 'Dr Rao'],
    ['Priya Nair', '2026-09-12', 'Attended', 'Dr Rao'],
    ['Priya Nair', '2026-09-16', 'Attended', 'Dr Rao'],
  ],
};

const RAHUL_CALL = [
  'Staff: Good morning, Vesoma physiotherapy.',
  'Caller: Hi, this is Rahul. I wanted to know about upgrading my package.',
  'Staff: Sure, I will check and get back to you.',
].join('\n');

const PRIYA_CALL = [
  'Staff: Vesoma physiotherapy, good afternoon.',
  'Caller: Hello, this is Priya. Can I book a session for next week?',
  'Staff: Yes, I will put you down for Wednesday.',
].join('\n');

const CANNED = {
  [RAHUL_CALL]: {
    intent: 'upgrade', request: 'Asked about upgrading his package',
    request_quote: 'I wanted to know about upgrading my package',
    promise: 'yes', promise_quote: 'I will check and get back to you',
  },
  [PRIYA_CALL]: {
    intent: 'booking', request: 'Wants a session next week',
    request_quote: 'Can I book a session for next week',
    promise: 'yes', promise_quote: 'I will put you down for Wednesday',
  },
};

const ask = async ({ userMessage }) =>
  JSON.stringify(CANNED[userMessage.replace(/^TRANSCRIPT\n/, '')] || { intent: 'other', promise: 'no' });

/** The call log, once the recordings have been read. */
async function callLog() {
  const rows = [];
  for (const [name, date, transcript] of [
    ['Rahul Menon', '2026-09-13', RAHUL_CALL],
    ['Priya Nair', '2026-09-15', PRIYA_CALL],
  ]) {
    const s = await readSignals(transcript, ask);
    rows.push([name, date, 'phone', s.intent, s.request, s.promise, s.promise_quote]);
  }
  return {
    name: 'Enquiries and Calls',
    columns: ['Client Name', 'Contact Date', 'Channel', 'Intent', 'Request', 'Promise', 'Promise Quote'],
    rows,
  };
}

const items = (d, nameCol, where = []) => {
  const idx = d.columns.indexOf(nameCol);
  const by = new Map();
  for (const cells of d.rows) {
    if (where.length && !matchesAll(cells, d.columns, where)) continue;
    if (!by.has(cells[idx])) by.set(cells[idx], { name: cells[idx], records: [] });
    by.get(cells[idx]).records.push({ cells });
  }
  return [...by.values()];
};

describe('the recording becomes columns', () => {
  it('reads what Rahul asked for and what he was promised', async () => {
    const log = await callLog();
    const rahul = log.rows[0];
    expect(rahul[3]).toBe('upgrade');
    expect(rahul[5]).toBe('yes');
    expect(rahul[6]).toBe('I will check and get back to you');
  });
});

describe('the call log unlocks watchers the diary alone cannot support', () => {
  it('turns on the ones that read two systems, and names both', async () => {
    const log = await callLog();
    const alone = catalogueFor([DIARY], {}).filter((c) => c.ready).map((c) => c.id);
    const both = catalogueFor([DIARY, log], {}).filter((c) => c.ready).map((c) => c.id);

    // None of these can exist against one dataset, by construction.
    for (const id of ['promise-not-kept', 'no-show-then-contact', 'contact-no-record', 'cancelled-not-updated']) {
      expect(alone, `${id} with the diary alone`).not.toContain(id);
      expect(both, `${id} with both`).toContain(id);
    }
  });

  it('writes a question naming both datasets and the order it reads them in', async () => {
    const log = await callLog();
    const entry = entryFor('promise-not-kept');
    const match = matchPair(entry, [DIARY, log]);
    expect(match.left.dataset).toBe('Enquiries and Calls');
    expect(match.right.dataset).toBe('Appointment Booking Diary');
    const q = fillQuestion(entry, match);
    expect(q).toContain('Enquiries and Calls');
    expect(q).toContain('Appointment Booking Diary');
    expect(q).toContain('AFTER');
    expect(q).not.toMatch(/[{}]/);
  });
});

describe('the finding', () => {
  it('is Rahul, and only Rahul', async () => {
    const log = await callLog();
    const found = joinOnEntity(
      items(log, 'Client Name', [['Promise', 'is', 'yes']]),
      items(DIARY, 'Client Name'),
      'leftOnly',
      {
        direction: 'after',
        leftIdx: log.columns.indexOf('Contact Date'),
        rightIdx: DIARY.columns.indexOf('Appointment Date'),
      },
      NOW,
    );
    expect(found.map((f) => f.name)).toEqual(['Rahul Menon']);
  });

  it('leaves out the customer somebody did follow up', async () => {
    /*
     * The whole reason the join is time-ordered. Priya was promised a booking
     * on the 15th and booked on the 16th; presence alone would report her,
     * because she appears in both datasets exactly as Rahul does.
     */
    const log = await callLog();
    const promised = items(log, 'Client Name', [['Promise', 'is', 'yes']]);
    const booked = items(DIARY, 'Client Name');
    const order = {
      direction: 'after',
      leftIdx: log.columns.indexOf('Contact Date'),
      rightIdx: DIARY.columns.indexOf('Appointment Date'),
    };
    expect(joinOnEntity(promised, booked, 'leftOnly', order, NOW).map((f) => f.name))
      .not.toContain('Priya Nair');
    // And without the ordering, both are reported — which is the bug this
    // guards against, stated rather than assumed.
    expect(joinOnEntity(promised, booked, 'leftOnly', null, NOW).map((f) => f.name))
      .toEqual([]);
  });

  it('carries the words somebody actually said as its evidence', async () => {
    const log = await callLog();
    const found = joinOnEntity(
      items(log, 'Client Name', [['Promise', 'is', 'yes']]),
      items(DIARY, 'Client Name'),
      'leftOnly',
      { direction: 'after', leftIdx: 1, rightIdx: 1 },
      NOW,
    );
    const cells = found[0].records[0].cells;
    expect(cells[6]).toBe('I will check and get back to you');
    // Which is in the transcript it came from — the property that makes this
    // finding safe to put a person's name on.
    expect(RAHUL_CALL).toContain(cells[6]);
  });

  it('does not fire when the promise could not be quoted', async () => {
    /*
     * End to end, the guard that matters most: a model that invents the
     * commitment produces no finding at all, rather than a quieter one.
     */
    const inventing = async () => JSON.stringify({
      intent: 'upgrade', promise: 'yes',
      promise_quote: 'I will call you back tomorrow without fail',
    });
    const s = await readSignals(RAHUL_CALL, inventing);
    expect(s.promise).toBe('no');

    const log = {
      name: 'Enquiries and Calls',
      columns: ['Client Name', 'Contact Date', 'Channel', 'Intent', 'Request', 'Promise', 'Promise Quote'],
      rows: [['Rahul Menon', '2026-09-13', 'phone', s.intent, s.request, s.promise, s.promise_quote]],
    };
    expect(items(log, 'Client Name', [['Promise', 'is', 'yes']])).toEqual([]);
  });
});
