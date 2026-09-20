/**
 * A customer does not stop being live because Svarg is pushing them an update.
 *
 * Onboarding on the funnel flickered between 1 and 0. The cause is a status
 * that lasts a few minutes and happens to every application whenever Svarg
 * restarts: the live-update sweep redeploys, the deployment goes to
 * 'attaching', and the old container carries on answering the whole time.
 *
 * Reading the status alone, the board concluded nobody had launched anything.
 * Caught with all four live applications sitting in 'attaching' and every one
 * of them returning HTTP 200.
 *
 * ── The rule already existed, in one place ─────────────────────────────────
 *
 * blueprintOverviewService had worked this out and written it inline:
 *
 *   isRunning(dep?.status) || (dep?.status === 'attaching' && dep?.liveAt)
 *
 * Six other call sites had the narrow version. That is the whole argument for
 * a named predicate: reasoning written out by hand in one file is reasoning
 * the next six readers do not have.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { isRunning, isServing, RUNNING } from '../models/HostedDeployment.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const dep = (status, liveAt = null) => ({ status, liveAt });

describe('serving, as the customer experiences it', () => {
  it('counts a redeploy of an application that has been live', () => {
    // The bug, stated. Four applications sat here for minutes at a time,
    // answering every request, while the funnel reported zero.
    expect(isServing(dep('attaching', new Date()))).toBe(true);
  });

  it('does not count a first launch, where nothing is serving yet', () => {
    /*
     * The same status means two different things. Attaching with no liveAt is
     * an application coming up for the first time — there is no old container
     * behind it, and nobody has ever used it.
     */
    expect(isServing(dep('attaching', null))).toBe(false);
  });

  it('still counts live and degraded', () => {
    for (const s of RUNNING) expect(isServing(dep(s)), s).toBe(true);
  });

  it('counts nothing else, whatever it has been before', () => {
    for (const s of ['queued', 'preparing', 'prepared', 'failed', 'suspended', 'destroyed']) {
      expect(isServing(dep(s, new Date())), s).toBe(false);
    }
  });

  it('survives a deployment that is not there', () => {
    expect(isServing(null)).toBe(false);
    expect(isServing(undefined)).toBe(false);
    expect(isServing({})).toBe(false);
  });

  it('leaves isRunning alone, because the other question still needs asking', () => {
    expect(isRunning('attaching')).toBe(false);
    expect(isRunning('live')).toBe(true);
  });
});

describe('which question each caller is asking', () => {
  it('the funnel asks whether the customer is live', () => {
    const svc = read('../services/salesSignalsService.js');
    expect(svc).toContain('if (!isServing(d)) continue;');
    expect(svc).toContain('!isServing(depByBp.get(String(b._id)))');
  });

  it('so does the screen chat, which says it out loud', () => {
    /*
     * Its own comment: "Yusu must not tell somebody their application is not
     * running while they are looking at it." Which is exactly what the status
     * alone does during a redeploy.
     */
    const ctrl = read('../controllers/screenChatController.js');
    expect(ctrl).toContain('context.live     = isServing(dep);');
  });

  it('and the operations dataset, which reports it to an agent', () => {
    expect(read('../services/opsDatasetService.js')).toContain("running: isServing(d) ? 'yes' : 'no'");
  });

  it('the rule is no longer written out by hand anywhere', () => {
    // It lived inline in blueprintOverviewService and nowhere else, which is
    // how six other readers ended up with the narrow version.
    const overview = read('../services/blueprintOverviewService.js');
    expect(overview).toContain('app: isServing(dep)');
    expect(overview).not.toContain("dep?.status === 'attaching' && dep?.liveAt");
  });

  it('but "is it safe to act on this" stays strict', () => {
    /*
     * Mid-deploy is precisely when a conformance run must not start and an
     * attach must not be skipped: the request could reach either container.
     * These are not the same question and must not share an answer.
     */
    expect(read('../services/conformanceService.js')).toContain('if (!isRunning(dep.status))');
    const deploy = read('../controllers/deploymentController.js');
    expect(deploy).toContain('if (isRunning(dep.status) && !dep.conformance)');
    expect(deploy).toContain('if (isRunning(dep.status)) {');
  });
});

describe('liveAt is the right thing to lean on', () => {
  it('is set once and never cleared, so it means "has served at least once"', () => {
    // A flag that got reset on each deploy would make this predicate useless
    // exactly when it is needed.
    for (const p of ['../services/liveUpdateService.js', '../controllers/deploymentController.js']) {
      const text = read(p);
      if (!text.includes('liveAt')) continue;
      // Guarded by !dep.liveAt in both, so the first live wins and later
      // ones leave it alone.
      expect(text, p).toContain('!dep.liveAt) dep.liveAt = new Date()');
      expect(text, p).not.toContain('dep.liveAt = null');
    }
  });
});
