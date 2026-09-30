/**
 * Connecting a source has to do something.
 *
 * ── Measured on the live physiotherapy application ─────────────────────────
 *
 * A Zoho CRM was connected on day one. Fourteen watchers started and all five
 * business categories were recorded as worked through.
 *
 * Months later a phone system was connected. A patient's call was fetched,
 * transcribed, and the promise a member of staff made in it was read out
 * correctly — "I will just check with the team and get back to you" — with
 * the quote verified against the transcript. Every part of that chain worked.
 *
 * And nothing happened. Promise Not Kept is the watcher that joins a promise
 * on a call to the follow-up that never came, it binds to those two datasets
 * cleanly, and it was never offered: it belongs to Growth, and Growth had
 * been filled by the CRM before a phone system existed. The owner's words
 * were "there is no evidence of Exotel recording", and they were right —
 * connecting a whole new system had silently changed nothing.
 *
 * ── What changed ───────────────────────────────────────────────────────────
 *
 * What is remembered is no longer "this category has been done" but "this
 * watcher was possible, and offered". A category the owner worked through
 * stays worked through for the watchers that were in it at the time. One that
 * has never been possible has never been offered, so there is nothing for
 * them to have said no to.
 */
import { describe, it, expect } from 'vitest';
import { watchersToStart } from '../eame-template/services/agentService.js';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Two watchers in one category: one the CRM supports, one the phone does. */
const CATEGORIES = [
  { name: 'Growth', watchers: ['gone-quiet', 'promise-not-kept'] },
  { name: 'Retention', watchers: ['no-show'] },
];

const entry = (id, over = {}) => ({
  id, name: id, ready: true, question: `something in ${id}`, severity: 'medium',
  schedule: 'weekdays', atHour: 7, ...over,
});

/** The CRM alone. Promise Not Kept needs a call, so it cannot run. */
const CRM_ONLY = [entry('gone-quiet'), entry('no-show')];
/** And with a phone system connected. */
const WITH_PHONE = [...CRM_ONLY, entry('promise-not-kept')];

const seed = (kind, key) => ({ kind, key });

describe('the first run under the new rule', () => {
  const day1 = watchersToStart({ catalogue: CRM_ONLY, categories: CATEGORIES, live: [], seeds: [] });

  it('starts what the data supports, as it always did', () => {
    expect(day1.wanted.map((c) => c.id).sort()).toEqual(['gone-quiet', 'no-show']);
  });

  it('records the categories it filled, as it always did', () => {
    expect(day1.filled.sort()).toEqual(['Growth', 'Retention']);
  });

  it('also records everything the data could support', () => {
    // The new fact. Without it, "never offered" is an inference rather than
    // something written down.
    expect(day1.seen.sort()).toEqual(['gone-quiet', 'no-show']);
  });
});

describe('a watcher that becomes possible when a source is connected', () => {
  /** Day one: CRM only. Both categories filled, both watchers seen. */
  const after = [
    seed('watcher', 'gone-quiet'), seed('watcher', 'no-show'),
    seed('category', 'Growth'), seed('category', 'Retention'),
    seed('seen', 'gone-quiet'), seed('seen', 'no-show'),
  ];
  const live = [
    { watcherId: 'gone-quiet', name: 'gone-quiet' },
    { watcherId: 'no-show', name: 'no-show' },
  ];

  it('is offered, even though its category was filled long ago', () => {
    // The whole bug, in one assertion.
    const out = watchersToStart({ catalogue: WITH_PHONE, categories: CATEGORIES, live, seeds: after });
    expect(out.wanted.map((c) => c.id)).toEqual(['promise-not-kept']);
  });

  it('was not offered before the phone arrived, which is why it is now', () => {
    const out = watchersToStart({ catalogue: CRM_ONLY, categories: CATEGORIES, live, seeds: after });
    expect(out.wanted).toEqual([]);
  });

  it('is recorded as seen once it has been offered', () => {
    const out = watchersToStart({ catalogue: WITH_PHONE, categories: CATEGORIES, live, seeds: after });
    expect(out.seen).toContain('promise-not-kept');
  });

  it('is not offered twice', () => {
    const out = watchersToStart({
      catalogue: WITH_PHONE,
      categories: CATEGORIES,
      live: [...live, { watcherId: 'promise-not-kept', name: 'promise-not-kept' }],
      seeds: [...after, seed('watcher', 'promise-not-kept'), seed('seen', 'promise-not-kept')],
    });
    expect(out.wanted).toEqual([]);
  });
});

describe('what must keep staying off', () => {
  it('a watcher switched off stays off', () => {
    /*
     * The guarantee the category rule was protecting, and it never depended
     * on the category: starting one records it by id, and switching it off
     * does not remove that.
     */
    const out = watchersToStart({
      catalogue: WITH_PHONE,
      categories: CATEGORIES,
      live: [],
      seeds: [seed('watcher', 'promise-not-kept'), seed('seen', 'promise-not-kept')],
    });
    expect(out.wanted.map((c) => c.id)).not.toContain('promise-not-kept');
  });

  it('a watcher that was possible and passed over stays off', () => {
    // Seen but never started: the owner had the chance and did not take it.
    const out = watchersToStart({
      catalogue: WITH_PHONE,
      categories: CATEGORIES,
      live: [],
      seeds: [seed('category', 'Growth'), seed('seen', 'promise-not-kept'), seed('seen', 'gone-quiet')],
    });
    expect(out.wanted.map((c) => c.id)).not.toContain('promise-not-kept');
  });

  it('one the plan does not cover is still not offered', () => {
    const out = watchersToStart({
      catalogue: WITH_PHONE,
      categories: CATEGORIES,
      live: [],
      seeds: [],
      covered: ['Retention'],
    });
    expect(out.wanted.map((c) => c.id)).toEqual(['no-show']);
    // And it is not recorded as seen either, or buying the category later
    // would find it already passed over.
    expect(out.seen).not.toContain('promise-not-kept');
  });

  it('one the data cannot support is neither offered nor seen', () => {
    const out = watchersToStart({
      catalogue: [entry('gone-quiet'), entry('promise-not-kept', { ready: false, question: '' })],
      categories: CATEGORIES,
      live: [],
      seeds: [],
    });
    expect(out.wanted.map((c) => c.id)).toEqual(['gone-quiet']);
    expect(out.seen).not.toContain('promise-not-kept');
  });
});

/**
 * An application delivered before any of this has no record of what it could
 * already run, so every watcher it ever passed over would look newly
 * possible. A board that grew by nine watchers overnight because a supplier
 * shipped a change would alarm any customer, rightly.
 */
describe('an application that has never recorded what it could run', () => {
  const src = read('../eame-template/services/agentService.js');

  it('records what is possible and starts nothing on that run', () => {
    expect(src).toContain("const first = !seeds.some((s) => s.kind === 'seen');");
    expect(src).toContain("return { started: [], skipped: 'recorded what was already possible' };");
  });

  it('says why in one line, because it is the same data as yesterday', () => {
    expect(src).toContain('Everything it could run now is something it could');
  });

  it('records what is possible even on a run that starts nothing', () => {
    // Or a watcher that becomes possible and is then switched off comes back
    // on the run after.
    expect(src).toContain("skipped: 'nothing new to start'");
    const quiet = src.slice(src.indexOf('if (!wanted.length) {'), src.indexOf('const started = []'));
    expect(quiet).toContain("rememberSeeds(seen.map((id) => ({ kind: 'seen', key: id })))");
  });

  it('records it alongside the watchers and the categories on a normal run', () => {
    expect(src).toContain("...seen.map((id) => ({ kind: 'seen', key: id })),");
  });
});

/**
 * And the button has to be able to start what the board offered.
 *
 * ── Found the moment the first one was clicked ─────────────────────────────
 *
 * Promise Not Kept was listed with a Start watching button, on an application
 * holding a transcribed call and a CRM side by side, and refused it:
 * "Nothing here holds the records this needs yet."
 *
 * The handler walked the datasets calling matchDataset, which matches ONE.
 * Four watchers in the catalogue read two at once — a promise on a call
 * against the follow-up that never came, an order against the delivery — and
 * those are the findings worth the most, because they are the ones nobody can
 * see by looking in one system. Every one of them could be listed and none
 * could be started.
 *
 * The listing, auto-start at boot, and this button now all ask catalogueFor.
 * One binding, three callers, and a button that cannot offer what it refuses.
 */
describe('starting a watcher that reads two datasets', () => {
  const ctl = read('../eame-template/controllers/agentsController.js');
  const start = ctl.slice(ctl.indexOf('export async function startFromCatalogueHandler'));

  it('binds the way the board bound it when it drew the button', () => {
    expect(start).toContain('catalogueFor(readIndex(), plan())');
    expect(start).toContain("find((c) => c.id === entry.id && c.ready && c.question)");
  });

  it('no longer asks a single-dataset matcher a two-dataset question', () => {
    expect(start).not.toContain('matchDataset(entry, d)');
  });

  it('takes the question and the binding from that one answer', () => {
    expect(start).toContain('question: bound.question');
    expect(start).toContain('boundTo: bound.using');
  });

  it('still refuses when the records genuinely are not there', () => {
    expect(start).toContain('Nothing here holds the records this needs yet.');
  });
});

/**
 * A watcher reading two datasets is woken by either of them.
 *
 * matchPair records both as "Left + Right", so the exact comparison that
 * woke a single-dataset watcher never matched one of a pair. They would have
 * run on the schedule and no sooner, which is the slow version of not
 * working — and they are the watchers that matter most.
 */
describe('waking a watcher that reads two datasets', () => {
  it('matches either side', async () => {
    const { readsDataset } = await import('../eame-template/services/agentService.js');
    expect(readsDataset('Calls (Exotel) + Tasks (Zoho CRM)', 'Calls (Exotel)')).toBe(true);
    expect(readsDataset('Calls (Exotel) + Tasks (Zoho CRM)', 'Tasks (Zoho CRM)')).toBe(true);
  });

  it('still matches a watcher that reads one', async () => {
    const { readsDataset } = await import('../eame-template/services/agentService.js');
    expect(readsDataset('Meetings (Zoho CRM)', 'Meetings (Zoho CRM)')).toBe(true);
  });

  it('matches nothing else', async () => {
    const { readsDataset } = await import('../eame-template/services/agentService.js');
    expect(readsDataset('Calls (Exotel) + Tasks (Zoho CRM)', 'Meetings (Zoho CRM)')).toBe(false);
    expect(readsDataset('', 'Calls (Exotel)')).toBe(false);
    expect(readsDataset('Calls (Exotel)', '')).toBe(false);
  });

  it('is what the wake actually uses', () => {
    const src = read('../eame-template/services/agentService.js');
    expect(src).toContain('if (!readsDataset(a.boundTo, name)) return false;');
    // And the query can no longer ask for an exact boundTo, or a pair would
    // never be read back to be filtered.
    expect(src).toContain("find({ boundTo: { $nin: ['', null] } })");
  });
});
