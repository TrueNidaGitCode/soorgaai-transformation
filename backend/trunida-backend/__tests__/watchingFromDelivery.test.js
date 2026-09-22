/**
 * An application that arrives already watching.
 *
 * ── What it used to do ─────────────────────────────────────────────────────
 *
 * A delivered application started with zero watchers. Nothing looked at
 * anything until somebody found the third item in the sidebar and pressed
 * start — so a product whose whole promise is "we will tell you before you
 * have to look" opened on an empty board, which from the customer's side is
 * indistinguishable from a product that does nothing at all.
 *
 * ── The two gates, and why both are needed ─────────────────────────────────
 *
 * `startHere` is Cob's reading of the customer's own objective: of the
 * catalogue, these are the ones this business described.
 *
 * `ready` is the matcher's answer: the columns this watcher needs exist in a
 * dataset that is really here.
 *
 * Only the intersection starts. Cob wanting something the data cannot support
 * would produce a watcher that fails three times and stops itself, and the
 * customer's first experience of the product would be it telling them it is
 * broken. Wanting is not enough; possible is not enough either.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { watcherPlan, scoreWatchers, blueprintText, MAX_START, watcherPlanFile } from '../services/watcherPlanService.js';
import { catalogueFor } from '../eame-template/services/agentCatalogue.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('reading which watchers a business asked for', () => {
  it('finds the problem the customer actually described', () => {
    const bp = {
      businessObjective:
        'We run a cricket academy. Attendance comes in over WhatsApp and we copy it '
        + 'into a spreadsheet, so nobody notices when a student stops turning up.',
    };
    expect(watcherPlan(bp).startHere).toContain('stopped-coming');
  });

  it('finds a different one for a different business, from the same catalogue', () => {
    const bp = {
      businessObjective:
        'We are an electronic component distributor. Enquiries arrive by email and '
        + 'WhatsApp, a quotation goes out from the ERP, and follow-up is manual — '
        + 'quotes go cold and nobody sees it.',
    };
    const plan = watcherPlan(bp);
    expect(plan.startHere).toContain('unanswered-enquiry');
    // And it does not reach for the academy's problem just because it is first
    // in the catalogue.
    expect(plan.startHere).not.toContain('missing-attendance');
  });

  it('reads the opportunities Cob wrote, not only the sentence they typed', () => {
    const text = blueprintText({
      businessObjective: 'We are a physiotherapy clinic.',
      opportunities: [{ title: 'Overdue invoices are chased late', description: '' }],
    });
    expect(scoreWatchers(text).has('overdue-invoice')).toBe(true);
  });

  it('matches the plural a business actually writes', () => {
    /*
     * Caught on a real objective. It said 'we do not track which enquiries we
     * answered' and the enquiry watcher did not start, because terms are
     * matched as substrings and 'enquiries' does not contain 'enquiry'. Most
     * plurals are free -- 'appointments' contains 'appointment' -- but the
     * ones that change the stem are exactly the words a clinic uses.
     *
     * A silent miss is the worst failure this matcher has: the board comes up
     * emptier than it should and nothing anywhere says why.
     */
    const plural = scoreWatchers('we do not track which enquiries we answered');
    const singular = scoreWatchers('we do not track which enquiry we answered');
    expect(plural.has('unanswered-enquiry')).toBe(true);
    expect(singular.has('unanswered-enquiry')).toBe(true);
  });

  it('counts a term and its plural once, not twice', () => {
    // 'enquiry' and 'enquiries' are one idea. Scoring both would quietly
    // promote a watcher above one the customer cared about more.
    expect(scoreWatchers('enquiry enquiries').get('unanswered-enquiry')).toBe(1);
  });

  it('says nothing when the objective matches nothing', () => {
    /*
     * The important refusal. An empty plan is a valid answer and the
     * application already handles it — default order, nothing auto-started,
     * the owner chooses. Guessing here would start watchers nobody asked for,
     * which is the one thing that makes somebody switch all of it off at once.
     */
    const plan = watcherPlan({ businessObjective: 'We would like to explore artificial intelligence.' });
    expect(plan.startHere).toEqual([]);
    expect(plan.order).toEqual([]);
  });

  it('survives a blueprint with nothing in it', () => {
    expect(watcherPlan({}).startHere).toEqual([]);
    expect(watcherPlan(null).startHere).toEqual([]);
  });

  it('caps how many start themselves', () => {
    /*
     * Watchers that start on their own also send mail. Five findings on the
     * first morning is a product; twenty is an inbox problem, and the customer
     * turns the whole thing off rather than tuning it.
     */
    const everything = Object.values({
      a: 'stopped coming attendance timesheet leave onboarding overdue unpaid uninvoiced',
      b: 'part payment expense renewal enquiry gone quiet complaint promise unconfirmed',
      c: 'late delivery price empty overbooked no show unstaffed missing duplicate stale',
    }).join(' ');
    const plan = watcherPlan({ businessObjective: everything });
    expect(plan.order.length).toBeGreaterThan(MAX_START);
    expect(plan.startHere).toHaveLength(MAX_START);
  });

  it('is deterministic — the same objective gives the same plan', () => {
    // Choosing watchers is a decision, and decisions here are code. A model
    // asked this would answer confidently every time, including when wrong.
    const bp = { businessObjective: 'Students stop coming and invoices go unpaid.' };
    expect(watcherPlan(bp)).toEqual(watcherPlan(bp));
  });

  it('produces the file the application already knows how to read', () => {
    const f = watcherPlanFile({ businessObjective: 'Students stop turning up.' });
    expect(f.path).toBe('data/agents.json');
    const parsed = JSON.parse(f.content);
    expect(Array.isArray(parsed.order)).toBe(true);
    expect(Array.isArray(parsed.startHere)).toBe(true);
  });
});

describe('the plan reaches a delivered application', () => {
  it('is written on the path the agents screen reads', () => {
    // The file has had a reader since the agents screen was built and never
    // had a writer — which is the whole reason nothing was ever watching.
    expect(read('../eame-template/controllers/agentsController.js'))
      .toContain("path.join(ROOT, 'data', 'agents.json')");
  });

  it('is composed on the delivery path, not only the build path', () => {
    /*
     * Both, deliberately. The build path verifies a project; the delivery path
     * is what actually ships AND what the live-update sweep recomposes. A file
     * added only to the build would never reach an existing customer.
     */
    expect(read('../controllers/eameBuildController.js')).toContain('watcherPlanFile(bp)');
    expect(read('../services/eameBuildService.js')).toContain('watcherPlanFile(bp)');
  });
});

describe('only what the data can support actually starts', () => {
  /** A dataset shaped like the cricket academy's roll call. */
  const rollCall = {
    name: 'Daily Session Roll Call Logs',
    columns: ['Student Name', 'Session Date', 'Status'],
  };

  it('marks a watcher ready only when a dataset covers what it needs', () => {
    const rows = catalogueFor([rollCall], {});
    const stopped = rows.find(r => r.id === 'stopped-coming');
    expect(stopped.ready).toBe(true);
    // Nothing here holds a supplier or an amount.
    expect(rows.find(r => r.id === 'late-delivery').ready).toBe(false);
  });

  it('carries startHere through from the plan', () => {
    const rows = catalogueFor([rollCall], { startHere: ['stopped-coming'] });
    expect(rows.find(r => r.id === 'stopped-coming').startHere).toBe(true);
    expect(rows.find(r => r.id === 'no-show').startHere).toBe(false);
  });

  it('gives every catalogue row a severity, so a board can be ordered', () => {
    for (const r of catalogueFor([rollCall], {})) {
      expect(['high', 'medium', 'low'], `${r.id} → ${r.severity}`).toContain(r.severity);
    }
  });

  it('auto-start requires BOTH wanted and possible', () => {
    /*
     * The gate, asserted against the real matcher rather than a mock: a
     * watcher Cob asked for whose data is absent must not start. The
     * application would otherwise greet its owner with something broken.
     */
    const rows = catalogueFor([rollCall], { startHere: ['stopped-coming', 'late-delivery'] });
    const wouldStart = rows.filter(r => r.startHere && r.ready).map(r => r.id);
    expect(wouldStart).toContain('stopped-coming');
    expect(wouldStart).not.toContain('late-delivery');
  });

  it('writes down what it offered, not what it managed to start', () => {
    /*
     * The safety mechanism is that nothing is offered twice; which watchers
     * that leaves is asserted by running the decision, further down. What
     * cannot be run without a database is the writing, so it is read here.
     *
     * Seeding what was OFFERED rather than what STARTED is the subtle half.
     * A watcher that failed to create is not one to retry on every restart
     * for the rest of the application's life — and an owner who has already
     * seen it appear and go away must not meet it again on the next deploy.
     */
    const svc = read('../eame-template/services/agentService.js');
    const fn = svc.slice(svc.indexOf('export async function autoStartWatchers'));
    expect(fn).toContain('await rememberSeeds([');
    expect(fn).toContain("...wanted.map((c) => ({ kind: 'watcher', key: c.id })),");
    expect(fn).toContain("...filled.map((name) => ({ kind: 'category', key: name })),");
    expect(fn).not.toMatch(/rememberSeeds\(\[\s*\.\.\.started/);
    // Upserted, so a restart mid-write cannot lose or duplicate a seed.
    expect(svc).toContain('upsert: true,');
    // And it is its own collection, not a flag smuggled onto an agent that
    // the owner can delete.
    expect(svc).toContain("mongoose.connection.collection('svarg_agent_seeds')");
  });

  it('is given the categories the knowledge base wrote', () => {
    // Not a second list kept here: the same plan the agents screen reads.
    expect(read('../eame-template/server.js')).toContain('categories: agentPlan().categories || [],');
  });

  it('never fails the boot', () => {
    // An application that cannot start its watchers must still serve, so the
    // owner can go and start them by hand.
    expect(read('../eame-template/server.js')).toMatch(/autoStartWatchers\([\s\S]*?\.catch\(/);
  });
});

describe('the owner\'s clock, not the container\'s', () => {
  it('only moves watchers that have never run and are still on the default', () => {
    /*
     * A watcher created by hand takes the browser's timezone. One that starts
     * itself at delivery has no browser and falls back to UTC — so a 7am
     * briefing fires at half past twelve in India, which for a morning
     * briefing is the feature not working.
     *
     * The filter is the whole safety of it. A watcher that has already
     * reported is one the owner has seen arrive, and moving when it fires
     * would be changing something behind their back; a timezone they set
     * themselves is theirs.
     */
    const svc = read('../eame-template/services/agentService.js');
    expect(svc).toContain("{ tz: 'UTC', lastRunAt: null },");
  });

  it('refuses to move anything to UTC or to nothing', () => {
    const svc = read('../eame-template/services/agentService.js');
    expect(svc).toContain("if (!clean || clean === 'UTC') return { moved: 0 };");
  });

  it('is owner-only, because it changes when a briefing arrives', () => {
    // A colleague opening the application from another country must not move
    // the owner's morning.
    const routes = read('../eame-template/routes/agentsRoutes.js');
    const line = routes.split('\n').find(l => l.includes("'/timezone'"));
    expect(line).toBeTruthy();
    expect(line).toContain('ownerOnly');
  });

  it('is sent once, and a failure is silent', () => {
    // Everyone who is not the owner gets a refusal here. It must not surface
    // as an error on the first screen they ever see.
    const js = read('../eame-template/frontend/findings.js');
    expect(js).toContain("sessionStorage.getItem('ch-tz-sent')");
    expect(js).toMatch(/\.catch\(function \(\) \{ \/\* a colleague, not the owner/);
  });
});

describe('a term has to be a word, not letters inside one', () => {
  /*
   * ── The bug ────────────────────────────────────────────────────────────
   *
   * Rehearsing a real objective for a physiotherapy centre, the staff-leave
   * watcher started. The text said "a cancelled session leaves a cabin
   * unused", and "sessi-ON LEAVE-s" contains "on leave".
   *
   * A false start is worse than a miss. A watcher that fails to start leaves
   * the board emptier than it should be, and somebody eventually notices. One
   * that starts wrongly sends a person mail about a problem they do not have,
   * and that is how somebody concludes the whole product is noise.
   */
  it('does not find "on leave" inside "session leaves"', () => {
    expect(scoreWatchers('a cancelled session leaves a cabin unused').has('leave-clash')).toBe(false);
  });

  it('still finds it when somebody means it', () => {
    expect(scoreWatchers('two staff on leave on the same day').has('leave-clash')).toBe(true);
  });

  it('still lets a word run on at the end, which is the flexibility wanted', () => {
    // "stop" must find "stops" and "stopped". Beginnings are where the
    // accidents are; endings are where the inflections are.
    for (const s of ['a student stops coming', 'a student stopped coming', 'students stop coming']) {
      expect(scoreWatchers(s).has('stopped-coming'), s).toBe(true);
    }
  });

  it('does not start a timesheet watcher for opening hours', () => {
    // "hours" was a term. Every business mentions hours.
    expect(scoreWatchers('we are open twelve hours a day, seven days a week').size).toBe(0);
  });

  it('starts exactly three watchers for the rehearsed clinic objective', () => {
    /*
     * The whole matcher, on the real text it was tested with. Pinned because
     * this is the objective a live demonstration was run from, and a change
     * that silently alters it should have to be argued for.
     */
    const text = 'We believe a sports medicine and physiotherapy centre like Vesoma has important '
      + 'operational signals spread across appointments, treatment sessions, package balances, '
      + 'enquiries and cancellations. Today, some of these problems may only become visible after '
      + 'they have already happened — for example, a client stops attending midway through '
      + 'treatment, an enquiry is missed, or a cancelled session leaves a cabin unused.';
    expect(watcherPlan({ businessObjective: text }).startHere.sort())
      .toEqual(['empty-slot', 'stopped-coming', 'unanswered-enquiry']);
  });
});

/*
 * Who starts, decided rather than described.
 *
 * The assertions above read the source; these run the decision. It is pure
 * on purpose — everything interesting about auto-start is this choice, and
 * the database part is just writing it down.
 */
describe('choosing what starts, on an application that already has some', () => {
  const CATS = [
    { name: 'Retention', watchers: ['stopped-coming', 'drop-off'] },
    { name: 'Utilisation', watchers: ['empty-slot', 'equipment'] },
    { name: 'Growth', watchers: ['enquiry', 'referral'] },
    { name: 'Cash', watchers: ['unpaid', 'package-done'] },
    { name: 'Compliance', watchers: ['doc-expiry'] },
  ];
  const C = (id, severity, extra = {}) => ({
    id, name: id, severity, ready: true, question: 'rows in X', startHere: false,
    schedule: 'daily', atHour: 7, ...extra,
  });
  const CATALOGUE = [
    C('stopped-coming', 'high', { startHere: true }),
    C('drop-off', 'low'),
    C('empty-slot', 'medium', { startHere: true }),
    C('equipment', 'low'),
    C('enquiry', 'high'),
    C('referral', 'medium'),
    C('unpaid', 'medium'),
    C('package-done', 'high'),
    C('doc-expiry', 'low'),
    // Its data is not here, so it is never a candidate for anything.
    { ...C('late-delivery', 'high'), ready: false },
    // Ready, but the matcher found no dataset to phrase a question against.
    { ...C('no-question', 'high'), question: '' },
  ];
  const ids = (list) => list.map((c) => c.id);

  it('starts everything the data supports, and nothing it does not', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    const { wanted } = watchersToStart({ catalogue: CATALOGUE, categories: CATS, live: [], seeds: [] });

    // All nine ready entries, and neither of the two that cannot run.
    expect(wanted).toHaveLength(9);
    expect(ids(wanted)).not.toContain('late-delivery');
    expect(ids(wanted)).not.toContain('no-question');

    // Cob's picks lead, because they are what the customer described.
    expect(ids(wanted).slice(0, 2)).toEqual(['stopped-coming', 'empty-slot']);
    // Then worst first, so the first morning reads in the order that matters.
    expect(ids(wanted).slice(2, 5)).toEqual(['enquiry', 'package-done', 'referral']);
  });

  it('adds only what is missing, on an application already watching some', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    // Vesoma's shape: two started from the objective, everything else idle.
    const live = [{ watcherId: 'stopped-coming', name: 'stopped-coming' },
      { watcherId: 'empty-slot', name: 'empty-slot' }];
    const { wanted, filled } = watchersToStart({ catalogue: CATALOGUE, categories: CATS, live, seeds: [] });

    expect(ids(wanted)).not.toContain('stopped-coming');
    expect(ids(wanted)).not.toContain('empty-slot');
    expect(wanted).toHaveLength(7);
    // Every category ends up represented, which is the point of the change.
    expect(filled.sort()).toEqual(['Cash', 'Compliance', 'Growth', 'Retention', 'Utilisation']);
  });

  it('never offers the same watcher twice, so removing one keeps it removed', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    /*
     * The safety property, run rather than read. The owner was offered
     * doc-expiry and removed it; a restart must not bring it back.
     */
    const seeds = [{ kind: 'watcher', key: 'doc-expiry' }];
    const { wanted } = watchersToStart({ catalogue: CATALOGUE, categories: CATS, live: [], seeds });
    expect(ids(wanted)).not.toContain('doc-expiry');
    // Everything else it has not seen still starts.
    expect(wanted).toHaveLength(8);
  });

  it('leaves a category the owner emptied empty', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    /*
     * Stronger than the per-watcher rule, and the reason categories are
     * seeded at all. Once somebody has seen what a category offers and
     * cleared it out, filling it with the next watcher along would be the
     * same resurrection wearing another name.
     */
    const seeds = [{ kind: 'category', key: 'Growth' }];
    const { wanted, filled } = watchersToStart({ catalogue: CATALOGUE, categories: CATS, live: [], seeds });
    expect(ids(wanted)).not.toContain('enquiry');
    expect(ids(wanted)).not.toContain('referral');
    expect(filled).not.toContain('Growth');
    // And only that category: the rest are untouched.
    expect(wanted).toHaveLength(7);
  });

  it('switches nothing back on for an owner who switched it all off', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    const seeds = [
      ...CATALOGUE.map((c) => ({ kind: 'watcher', key: c.id })),
      ...CATS.map((c) => ({ kind: 'category', key: c.name })),
    ];
    const { wanted, filled } = watchersToStart({ catalogue: CATALOGUE, categories: CATS, live: [], seeds });
    expect(wanted).toEqual([]);
    expect(filled).toEqual([]);
  });

  it('still starts everything for an industry that named no categories', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    /*
     * No knowledge-base table is not a reason to watch less. There is simply
     * nothing to record as filled, and nothing a category seed can hold back.
     */
    const { wanted, filled } = watchersToStart({ catalogue: CATALOGUE, categories: [], live: [], seeds: [] });
    expect(wanted).toHaveLength(9);
    expect(filled).toEqual([]);
  });

  it('never offers a watcher whose name is already taken', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    /*
     * An application delivered before watchers carried ids has agents with
     * names and no watcherId. Matching on name as well is what stops it
     * being given a second copy of everything it already runs.
     */
    const live = [{ watcherId: '', name: 'enquiry' }];
    const { wanted } = watchersToStart({ catalogue: CATALOGUE, categories: CATS, live, seeds: [] });
    expect(ids(wanted)).not.toContain('enquiry');
    expect(wanted).toHaveLength(8);
  });
});