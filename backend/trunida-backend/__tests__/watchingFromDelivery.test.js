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

  it('only runs on an application that has never had a watcher', () => {
    /*
     * The whole safety mechanism. Without this check, an owner who switched
     * everything off would find it all switched back on after the next
     * update — and updates happen without them asking.
     */
    const svc = read('../eame-template/services/agentService.js');
    expect(svc).toContain('const existing = await agentsCollection().countDocuments({});');
    expect(svc).toContain("if (existing > 0) return { started: [], skipped: 'already set up' };");
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
