/**
 * Detect → Explain → Recommend → Act → Measure → Learn, per customer.
 *
 * The ICP page says one of the six is built. This is the delivered app
 * building the other five, in code: the explanation and the recommendation
 * are written per watcher, Act is the team saying what they did, Measure is
 * the watcher later not finding it, and Learn is a count of that.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  ACTIONS, DO, PLAYBOOK, GIVE_UP_DAYS, LEARN_AFTER,
  playbookFor, kindOf, learnFrom, recommendFor, spineFor, customersIn, guidanceFor,
} from '../eame-template/services/customerSpine.js';
import { FIXED_PATHS } from '../services/eameSpec.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 6, 9);

describe('the playbook', () => {
  it('covers every retention and growth watcher the clinic deck names', () => {
    for (const id of ['stopped-coming', 'gone-quiet', 'no-show', 'repeat-complaint',
      'asked-to-upgrade', 'renewal-due', 'absent-but-attended', 'package-overused']) {
      expect(PLAYBOOK[id], id).toBeTruthy();
      expect(['retention', 'growth']).toContain(PLAYBOOK[id].kind);
    }
  });

  it('counts unbilled delivered work as growth, by decision', () => {
    expect(kindOf('absent-but-attended')).toBe('growth');
    expect(kindOf('package-overused')).toBe('growth');
    expect(kindOf('never-invoiced')).toBe('growth');
    expect(kindOf('stopped-coming')).toBe('retention');
  });

  it('only recommends steps from one shared vocabulary, so outcomes can be counted', () => {
    for (const [id, pb] of Object.entries(PLAYBOOK)) {
      expect(pb.why.length, id).toBeGreaterThan(30);
      expect(pb.won, id).toBeTruthy();
      for (const a of pb.steps) expect(ACTIONS[a], `${id}: ${a}`).toBeTruthy();
    }
  });

  it('has a plain fallback for a watcher it does not know', () => {
    expect(playbookFor('nothing-like-this').kind).toBe('other');
    expect(playbookFor('nothing-like-this').steps.length).toBeGreaterThan(0);
  });

  it('is written in code, never by a model', () => {
    const src = read('../eame-template/services/customerSpine.js');
    expect(src).not.toMatch(/import .*llm|generate\(/);
  });
});

describe('Learn', () => {
  const resolvedAfter = (watcherId, action) => ({ watcherId, state: 'resolved', outcomes: [{ action }] });
  const stuck = (watcherId, action, daysAgo) => ({
    watcherId, state: 'open', acted: { action, at: new Date(NOW - daysAgo * DAY) },
  });

  it('counts a step as worked when the watcher stopped finding it', () => {
    const s = learnFrom([resolvedAfter('stopped-coming', 'call')], NOW);
    expect(s['stopped-coming'].call).toEqual({ tried: 1, worked: 1 });
  });

  it('counts a step as not worked only after it has had time to', () => {
    const fresh = learnFrom([stuck('stopped-coming', 'call', 3)], NOW);
    expect(fresh['stopped-coming']).toBeUndefined();
    const old = learnFrom([stuck('stopped-coming', 'call', GIVE_UP_DAYS + 1)], NOW);
    expect(old['stopped-coming'].call).toEqual({ tried: 1, worked: 0 });
  });

  it('keeps the playbook default until there is enough to go on', () => {
    const r = recommendFor('stopped-coming', {});
    expect(r.action).toBe('call');
    expect(r.learnt).toBe(false);
  });

  it('switches to what has worked here once both have been tried enough', () => {
    const f = [];
    for (let i = 0; i < LEARN_AFTER; i++) f.push(stuck('stopped-coming', 'call', 30));
    for (let i = 0; i < LEARN_AFTER; i++) f.push(resolvedAfter('stopped-coming', 'rebook'));
    const r = recommendFor('stopped-coming', learnFrom(f, NOW));
    expect(r.action).toBe('rebook');
    expect(r.learnt).toBe(true);
    expect(r.evidence).toEqual({ tried: LEARN_AFTER, worked: LEARN_AFTER });
  });

  it('does not let a lucky new step beat a default nobody has tried', () => {
    const f = [];
    for (let i = 0; i < LEARN_AFTER; i++) f.push(resolvedAfter('stopped-coming', 'rebook'));
    expect(recommendFor('stopped-coming', learnFrom(f, NOW)).action).toBe('call');
  });
});

describe('one customer, tagged with all six stages', () => {
  const f = (over) => ({
    id: 'f1', person: 'Asha Rao', watcherId: 'stopped-coming', watcher: 'Stopped Coming',
    severity: 'medium', since: new Date(NOW - 5 * DAY), ...over,
  });

  it('starts as detected, explained and recommended, waiting on the team', () => {
    const c = spineFor('Asha Rao', [f()], [], {}, NOW);
    expect(c.kinds).toEqual(['retention']);
    expect(c.stages.detect.state).toBe('done');
    expect(c.stages.explain.line).toBe(PLAYBOOK['stopped-coming'].why);
    expect(c.stages.recommend.line).toBe(DO.call);
    expect(c.stages.act.state).toBe('waiting');
    expect(c.stages.measure.state).toBe('none');
    expect(c.stages.learn.state).toBe('waiting');
  });

  it('moves to acted, then measured, as the team and the watcher report', () => {
    const acted = spineFor('Asha Rao', [f({ acted: { action: 'call', at: new Date(NOW - DAY) } })], [], {}, NOW);
    expect(acted.stages.act.state).toBe('done');
    expect(acted.stages.act.line).toBe('Called them yesterday');
    expect(acted.stages.measure.state).toBe('waiting');
    expect(acted.stages.measure.line).toMatch(/they come in again/);

    const won = spineFor('Asha Rao', [f()], [f({ id: 'f0', state: 'resolved', outcomes: [{ action: 'call' }] })], {}, NOW);
    expect(won.stages.measure.state).toBe('done');
  });

  it('says partly when only some findings were acted on, and measures the acted one', () => {
    const c = spineFor('Asha Rao', [
      f({ acted: { action: 'call', at: new Date(NOW) } }),
      f({ id: 'f2', watcherId: 'package-overused', watcher: 'Package Over-used', severity: 'high' }),
    ], [], {}, NOW);
    expect(c.stages.act.state).toBe('part');
    expect(c.stages.act.line).toMatch(/1 of 2 findings acted on/);
    expect(c.stages.measure.line).toMatch(/they come in again/);
  });

  it('tags a customer with both kinds when both are open', () => {
    const c = spineFor('Asha Rao', [f(), f({ id: 'f2', watcherId: 'package-overused', watcher: 'Package Over-used', severity: 'high' })], [], {}, NOW);
    expect(c.kinds.sort()).toEqual(['growth', 'retention']);
    expect(c.top).toBe('f2');   // the high-priority finding leads
    expect(c.severity).toBe('high');
  });

  it('lists every customer found, worst first, and nobody with nothing open', () => {
    const list = customersIn([
      f({ id: 'a', person: 'Ravi', severity: 'medium' }),
      f({ id: 'b', person: 'Meena', severity: 'high' }),
      f({ id: 'c', person: '' }),
    ], [f({ id: 'd', person: 'Old', state: 'resolved', outcomes: [{ action: 'call' }] })], {}, NOW);
    expect(list.map(c => c.person)).toEqual(['Meena', 'Ravi']);
  });

  it('gives one finding its why, its next step and the steps to mark', () => {
    const g = guidanceFor({ watcherId: 'package-overused' }, {});
    expect(g.kind).toBe('growth');
    expect(g.recommend.action).toBe('offer');
    expect(g.steps.map(s => s.action)).toEqual(['offer', 'bill', 'call']);
  });
});

describe('wired into the delivered app', () => {
  const svc = read('../eame-template/services/agentService.js');
  const ctl = read('../eame-template/controllers/agentsController.js');
  const routes = read('../eame-template/routes/agentsRoutes.js');
  const ui = read('../eame-template/frontend/findings.js');
  const html = read('../eame-template/frontend/index.html');

  it('ships the playbook to every application', () => {
    expect(FIXED_PATHS).toContain('services/customerSpine.js');
    expect(read('../services/eameProjectBuilder.js')).toContain("'services/customerSpine.js':");
  });

  it('records an outcome when an acted-on finding resolves, and clears acted when it returns', () => {
    expect(svc).toMatch(/\$push: \{ outcomes: \{ action: acted\.action/);
    expect(svc).toMatch(/\$setOnInsert: \{ firstSeenAt: at \}, \$unset: \{ acted: '' \}/);
  });

  it('serves the customers, the guidance and a step that sends nothing', () => {
    expect(ctl).toMatch(/customers: customersIn\(rows, won\.map\(withPerson\), stats\)/);
    expect(ctl).toMatch(/guidance: guidanceFor\(f, stats\)/);
    expect(routes).toMatch(/'\/findings\/:id\/acted'/);
    // Learning from the demonstration would teach the business wrong.
    expect(ctl).toMatch(/outcomeStats\(onlyKind\)/);
  });

  it('draws a card per customer with six stages, and the steps on a finding', () => {
    expect(html).toContain('id="fn-cust"');
    expect(html).toContain('id="fd-steps"');
    for (const s of ['Detect', 'Explain', 'Recommend', 'Act', 'Measure', 'Learn']) {
      expect(ui).toContain(`'${s}']`);
    }
    expect(ui).toContain('drawCustomers(body.customers || [])');
  });
});
