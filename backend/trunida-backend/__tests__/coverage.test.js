/**
 * What a plan buys, and the one thing it must never buy.
 *
 * ── The promise under test ─────────────────────────────────────────────────
 *
 * A customer pays for how much of their business is watched, never for how
 * many watchers do the watching. Two clinics on the same plan get different
 * numbers of them, because watchers are generated from each business's own
 * knowledge and data — and charging for that difference would hand every
 * customer a reason to switch watchers off, in a product whose entire promise
 * is that nothing gets missed.
 *
 * So the first test here is a negative one: nothing anywhere counts watchers.
 * If that ever stops being true, the pricing model has quietly inverted and
 * the Agent Map has become a picture of what somebody could afford.
 */

import fs from 'fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

/** A clinic's table, and an objective that was about money. */
const PLAN = {
  order: ['overdue-invoice', 'doc-expiry', 'stopped-coming'],
  categories: [
    { name: 'Retention', watchers: ['stopped-coming', 'drop-off'] },
    { name: 'Utilisation', watchers: ['empty-slot'] },
    { name: 'Growth', watchers: ['unanswered-enquiry'] },
    { name: 'Cash', watchers: ['overdue-invoice'] },
    { name: 'Compliance', watchers: ['doc-expiry'] },
  ],
};

const ENV = ['APP_CATEGORY_LIMIT', 'APP_MAX_CONNECTIONS', 'APP_MONITORING', 'APP_PLAN_LABEL'];
let saved = {};
beforeEach(() => { saved = {}; for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const load = () => import('../eame-template/services/coverage.js?' + Math.random());

describe('a plan sells coverage, never watchers', () => {
  it('counts no watchers, anywhere', () => {
    /*
     * Asserted against the source because it is a promise about what the code
     * does NOT do, and no input can demonstrate the absence of a limit.
     */
    const cov = read('../eame-template/services/coverage.js');
    const ctl = read('../eame-template/controllers/agentsController.js');

    // Nothing compares a number of watchers to a plan limit.
    expect(cov).not.toMatch(/watcherLimit|maxWatchers|agentLimit|maxAgents/i);
    expect(ctl).not.toMatch(/watcherLimit|maxWatchers|agentLimit|maxAgents/i);

    // And the gate on starting one asks about its business area, not a count.
    expect(ctl).toContain('if (!coversWatcher(plan(), entry.id))');

    // Nor does the plan itself have anywhere to put such a limit.
    const plans = read('../services/entitlements.js');
    expect(plans).not.toMatch(/watchers:\s*\d/);
    expect(plans).toContain('businessCategories:');
  });

  it('gives an unlimited plan everything, which is how old applications keep working', async () => {
    /*
     * The grandfathering, and it needs no code of its own: Svarg does not
     * send the variable, so nothing here limits anything. An application
     * delivered before coverage existed keeps watching all of it.
     */
    const c = await load();
    expect(c.categoryLimit()).toBeNull();
    expect(c.activeCategories(PLAN)).toHaveLength(5);
    expect(c.coversCategory(PLAN, 'Compliance')).toBe(true);
    expect(c.coversWatcher(PLAN, 'overdue-invoice')).toBe(true);
    expect(c.allowedSchedule('hourly')).toBe('hourly');
  });

  it('covers the areas the customer’s own objective was about', async () => {
    /*
     * Two of five, and nobody picks them by hand. The watchers Cob ranked
     * from the objective are already in plan.order, so a category is ranked
     * by the best-ranked watcher it holds: a clinic that wrote about money
     * gets Cash covered before Retention.
     */
    process.env.APP_CATEGORY_LIMIT = '2';
    const c = await load();
    expect(c.activeCategories(PLAN)).toEqual(['Cash', 'Compliance']);
    expect(c.coversCategory(PLAN, 'Cash')).toBe(true);
    expect(c.coversCategory(PLAN, 'Retention')).toBe(false);
  });

  it('returns covered areas in the table’s order, not in rank order', async () => {
    // So the map draws its columns the same way round every morning.
    process.env.APP_CATEGORY_LIMIT = '3';
    const c = await load();
    const names = PLAN.categories.map((x) => x.name);
    const active = c.activeCategories(PLAN);
    expect(active).toEqual(names.filter((n) => active.includes(n)));
  });

  it('covers a watcher no table names', async () => {
    /*
     * The knowledge base can lag the catalogue. Refusing to watch something
     * because a markdown file has not caught up would be the product failing
     * for a reason the customer can neither see nor fix.
     */
    process.env.APP_CATEGORY_LIMIT = '1';
    const c = await load();
    expect(c.coversWatcher(PLAN, 'a-watcher-added-after-this-table')).toBe(true);
  });

  it('covers everything for an industry with no table at all', async () => {
    process.env.APP_CATEGORY_LIMIT = '1';
    const c = await load();
    expect(c.coversWatcher({ categories: [] }, 'stopped-coming')).toBe(true);
    expect(c.activeCategories({ categories: [] })).toEqual([]);
  });
});

describe('monitoring frequency narrows, and never widens', () => {
  it('holds a daily plan to daily', async () => {
    process.env.APP_MONITORING = 'daily';
    const c = await load();
    expect(c.allowedSchedule('hourly')).toBe('daily');
    expect(c.allowedSchedule('daily')).toBe('daily');
    // Weekdays is less often than daily, and asking for less is always allowed.
    expect(c.allowedSchedule('weekdays')).toBe('weekdays');
  });

  it('does not force hourly on somebody who wanted daily', async () => {
    process.env.APP_MONITORING = 'hourly';
    const c = await load();
    expect(c.allowedSchedule('daily')).toBe('daily');
    expect(c.allowedSchedule('hourly')).toBe('hourly');
  });

  it('leaves an Enterprise contract alone', async () => {
    process.env.APP_MONITORING = 'custom';
    const c = await load();
    expect(c.allowedSchedule('hourly')).toBe('hourly');
  });

  it('is applied when a watcher runs, not only when it is created', () => {
    /*
     * The half that is easy to miss. A watcher created while the account was
     * on hourly monitoring keeps schedule:'hourly' on its record after the
     * account moves to a daily plan — so clamping only on write would let it
     * outrun the downgrade for the rest of its life.
     */
    const svc = read('../eame-template/services/agentService.js');
    expect(svc).toContain('const spec = SCHEDULES[allowedSchedule(a.schedule)];');
    expect(svc).toContain('const spec = SCHEDULES[allowedSchedule(a?.schedule)];');
  });
});

describe('auto-start stays inside coverage, without counting', () => {
  it('starts every ready watcher in a covered area, and none outside it', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    const C = (id, category) => ({ id, name: id, category, severity: 'medium', ready: true, question: 'q', startHere: false, schedule: 'daily', atHour: 7 });
    const catalogue = [
      C('stopped-coming'), C('drop-off'), C('empty-slot'),
      C('unanswered-enquiry'), C('overdue-invoice'), C('doc-expiry'),
    ];
    const { wanted } = watchersToStart({
      catalogue, categories: PLAN.categories, live: [], seeds: [],
      covered: ['Retention', 'Utilisation'],
    });
    const ids = wanted.map((w) => w.id);
    // Both Retention watchers, not one: coverage is the gate, not a quota.
    expect(ids).toContain('stopped-coming');
    expect(ids).toContain('drop-off');
    expect(ids).toContain('empty-slot');
    expect(ids).not.toContain('overdue-invoice');
    expect(ids).not.toContain('doc-expiry');
  });

  it('starts everything when nothing limits coverage', async () => {
    const { watchersToStart } = await import('../eame-template/services/agentService.js');
    const C = (id) => ({ id, name: id, severity: 'medium', ready: true, question: 'q', startHere: false, schedule: 'daily', atHour: 7 });
    const catalogue = [C('stopped-coming'), C('overdue-invoice'), C('doc-expiry')];
    const { wanted } = watchersToStart({ catalogue, categories: PLAN.categories, live: [], seeds: [], covered: null });
    expect(wanted).toHaveLength(3);
  });
});

describe('the plan reaches the application the way seats already do', () => {
  it('travels as environment, because only the application knows its own areas', () => {
    const deploy = read('../services/deployTargetService.js');
    expect(deploy).toContain('APP_CATEGORY_LIMIT: String(coverage.categories)');
    expect(deploy).toContain('APP_MAX_CONNECTIONS: String(coverage.connections)');
    expect(deploy).toContain('APP_MONITORING: String(coverage.frequency)');
  });

  it('is written again on every sweep, so an upgrade actually arrives', () => {
    /*
     * Seats and coverage used to be written only at Go Live, so an account
     * that upgraded afterwards kept the entitlements it launched with for
     * ever. The sweep is the only thing that regularly touches a running
     * application, so it is where a plan change becomes real.
     */
    const live = read('../services/liveUpdateService.js');
    expect(live).toContain('...planEnv(plan?.limits, dep),');
    expect(live).toContain('APP_SEATS: String(limits.seats)');
  });

  it('sends coverage only to an application launched under it', () => {
    // Grandfathering, stated as a flag rather than inferred from a date.
    const live = read('../services/liveUpdateService.js');
    expect(live).toContain('if (!dep?.coverageEnforced) return base;');
    const dep = read('../models/HostedDeployment.js');
    expect(dep).toContain('coverageEnforced: { type: Boolean, default: false }');
  });
});

describe('every place a coverage limit is actually applied', () => {
  /*
   * The pure decisions are run above. These are the places that reach a
   * database or a browser, where the only thing a test can hold is that the
   * call is there and shaped right — which is still worth holding, because
   * every one of them was absent before and nothing noticed.
   */

  it('records coverage on a deployment the moment it is attached', () => {
    const ctl = read('../controllers/deploymentController.js');
    // The allowance goes into the container...
    expect(ctl).toContain('coverage: coverageFrom(plan?.limits),');
    // ...and the deployment is marked as launched under it, so the sweep may
    // keep writing it. Anything attached before this stays grandfathered.
    expect(ctl).toContain('dep.coverageEnforced = true;');
    const i = ctl.indexOf('dep.coverageEnforced = true;');
    const j = ctl.indexOf('const attached = await target.attach(');
    expect(i, 'the flag must be set after the attach succeeds').toBeGreaterThan(j);
  });

  it('marks a category the plan does not cover, rather than dropping it', () => {
    const ctl = read('../eame-template/controllers/agentsController.js');
    expect(ctl).toContain('locked: categoryLimit() ? !activeCategories(plan()).includes(c.name) : false,');
    // And ships the summary the screen leads with.
    expect(ctl).toContain('coverage: coverageSummary(plan()),');
  });

  it('draws a locked area greyed, with its watchers still in it', () => {
    const ui = read('../eame-template/frontend/agents.js');
    const css = read('../eame-template/frontend/app.css');
    // The column is drawn and marked, never filtered out.
    expect(ui).toContain("'<section class=\"ag-col' + (g.locked ? ' is-locked' : '')");
    expect(ui).toContain("(g.locked ? 'Not in your plan'");
    expect(css).toContain('.ag-col.is-locked');
    // Its watchers are still listed — the greyed column is how somebody
    // finds out what is not being watched.
    expect(ui).not.toMatch(/filter\([^)]*!c\.locked/);
    // And no button is offered that the API would refuse.
    expect(ui).toContain('var acts = locked(c)');
  });

  it('caps connections where the connections are, and says both numbers', () => {
    const ctl = read('../eame-template/controllers/connectorController.js');
    expect(ctl).toContain('const limit = connectionLimit();');
    expect(ctl).toContain('const used = (await listConnectors()).length;');
    expect(ctl).toContain('if (used >= limit) {');
    // A refusal, not a crash, and it names the limit and what is used.
    expect(ctl).toMatch(/fail\(res, new Error\([\s\S]*?\), 403\)/);
    expect(ctl).toContain("'Your plan connects ' + limit");
    expect(ctl).toContain("+ used + ' '");
    // The page is told before somebody picks a card.
    expect(ctl).toContain('connectionLimit: connectionLimit(),');
    expect(ctl).toContain('connectionsUsed: connectors.length,');
  });

  it('says how many connections are used, and only when the plan limits them', () => {
    const ui = read('../eame-template/frontend/data.js');
    expect(ui).toContain('function drawUsed()');
    // No limit, no line: an application with unlimited connections should
    // not be told it has unlimited connections.
    expect(ui).toContain('if (!connectionLimit) { el.hidden = true; return; }');
    expect(ui).toContain("' of ' + connectionLimit + ' data source'");
    // Drawn on every refresh, including the one where the request failed.
    expect(ui).toMatch(/catch \(err\) \{ kinds = \[\]; connectors = \[\]; connectionLimit = null; \}\s*\n\s*drawUsed\(\);/);
  });

  it('clamps a hand-started watcher to the plan’s frequency', () => {
    const ctl = read('../eame-template/controllers/agentsController.js');
    expect(ctl).toContain("schedule: allowedSchedule(req.body?.schedule || 'weekdays'),");
  });

  it('tells the account screen what its plan covers', () => {
    const api = read('../controllers/billingController.js');
    expect(api).toContain('businessCategories: s.limits?.businessCategories ?? null,');
    expect(api).toContain('dataConnections: s.limits?.dataConnections ?? null,');
    const ui = read('../../../frontend/blueprints/blueprints.js');
    expect(ui).toContain("const cover = el('bp-plan-coverage');");
    // Unlimited reads as a sentence, not as "null business areas".
    expect(ui).toContain("'Every business area watched'");
    const html = read('../../../frontend/blueprints/blueprints.html');
    expect(html).toContain('id="bp-plan-coverage"');
  });

  it('ships the coverage module to every delivered application', () => {
    /*
     * A new template file has to be in BOTH the fixed-path list and the
     * builder's source map. One without the other ships it to nobody, which
     * has happened twice.
     */
    expect(read('../services/eameSpec.js')).toContain("'services/coverage.js',");
    expect(read('../services/eameProjectBuilder.js')).toContain("'services/coverage.js':");
  });
});
