/**
 * A degraded application is still an application.
 *
 * 'degraded' was added the morning the health check learned to say no, and it
 * means SERVING BUT UNWELL: the address answers, the customer can open it, and
 * its own /api reports something missing — an unreachable database, an
 * unreadable dataset, no model configured.
 *
 * Six readers already existed, and every one of them asked `status === 'live'`.
 * So the day the new status could first be written, a running application
 * disappeared from all of them at once:
 *
 *   - the sales board showed Onboarding 0, with a customer actively using an
 *     application, which is how this was found;
 *   - the customer's own Blueprints page would have fallen through to "Built"
 *     and stopped offering the link to the thing they were using;
 *   - deploy would have offered to attach a second application over the top of
 *     the one already running;
 *   - Yusu would have told them their application was not live.
 *
 * That is a different lie from the one degraded was introduced to stop, and in
 * front of the customer it is the worse one. The fix is one predicate every
 * reader imports, so the seventh reader gets it right by asking the same
 * question — the part that kept going wrong.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { isRunning, RUNNING } from '../models/HostedDeployment.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('the predicate itself', () => {
  it('counts serving and serving-but-unwell, and nothing else', () => {
    expect(RUNNING).toEqual(['live', 'degraded']);
    expect(isRunning('live')).toBe(true);
    expect(isRunning('degraded')).toBe(true);
  });

  it('does not count anything that is not answering', () => {
    for (const s of ['queued', 'preparing', 'prepared', 'attaching', 'failed', 'suspended', 'destroyed']) {
      expect(isRunning(s), s).toBe(false);
    }
    expect(isRunning(undefined)).toBe(false);
    expect(isRunning(null)).toBe(false);
  });

  it('is a status the model actually allows, or the write is silently invalid', () => {
    // updateOne skips validators: an out-of-enum status writes cleanly and
    // then throws on the next save() of the document. This has bitten twice.
    const model = read('models/HostedDeployment.js');
    for (const s of RUNNING) expect(model).toMatch(new RegExp(`'${s}'`));
    expect(model).toContain("'live', 'degraded', 'failed'");
  });
});

describe('the sales board — the reader that reported this', () => {
  const src = read('services/salesSignalsService.js');

  it('counts a degraded deployment towards Onboarding', () => {
    // Onboarding read 0 while a customer was using their application.
    expect(src).toContain('if (!isServing(d)) continue;');
    expect(src).not.toContain("if (d.status !== 'live') continue;");
  });

  it('says on the row that it is unwell, above every other note', () => {
    // A customer on an application that cannot reach its database is the call
    // to make today — it outranks "going quiet" and the query count.
    expect(src).toContain("const unwell = live.find(d => d.status === 'degraded')");
    expect(src).toMatch(/note: unwell\s*\n\s*\? `running but unwell/);
  });

  it('does not call a running application "built and never launched"', () => {
    expect(src).toContain("!isServing(depByBp.get(String(b._id)))");
  });
});

describe('the customer\'s own screen', () => {
  const src = read('services/blueprintOverviewService.js');

  it('still says Live, with the fact that it is unwell attached', () => {
    expect(src).toMatch(/dep\?\.status === 'degraded'\)\s+return \{ key: 'live',\s+label: 'Live', unwell: true \}/);
  });

  it('still hands them the link', () => {
    expect(src).toContain('app: isServing(dep)');
    expect(src).toContain("unwell: dep.status === 'degraded'");
  });
});

describe('the guards that stop a second application being launched', () => {
  const src = read('controllers/deploymentController.js');

  it('treats a degraded application as already running', () => {
    // Attaching a second one over the top is not the answer to a missing
    // dataset, and it would leave two applications on one blueprint.
    expect(src).toContain('if (isRunning(dep.status)) {');
    expect(src).toContain('alreadyLive: true');
  });

  it('re-probes a degraded deployment, the state most likely to have changed', () => {
    expect(src).toContain("['attaching', 'live', 'degraded'].includes(dep.status)");
  });

  it('counts its environment as prepared', () => {
    expect(src).toContain("['prepared', 'attaching', 'live', 'degraded', 'suspended'].includes(existing.status)");
  });

  it('explains the refusal rather than sending them to the wrong screen', () => {
    expect(src).toMatch(/dep\.status === 'degraded'\s+\? 'This application is already running, though it reports a problem/);
  });
});

describe('what Yusu is told', () => {
  const src = read('controllers/screenChatController.js');

  it('does not tell somebody their application is not running while they look at it', () => {
    expect(src).toContain('context.live     = isServing(dep);');
    expect(src).toContain("context.unwell   = dep?.status === 'degraded';");
  });

  it('counts the environment as ready', () => {
    expect(src).toContain("['prepared', 'live', 'degraded'].includes(dep?.status)");
  });
});

describe('every reader asks the same question', () => {
  it('nobody compares against the live string by hand any more', () => {
    /*
     * The check that matters most here. Scattering `|| 'degraded'` through six
     * files is exactly how the seventh reader gets missed, which is the shape
     * of this bug and of the two before it ('partial' and 'degraded' missing
     * from enums). Any remaining hand-written comparison is a reader that will
     * be wrong the next time a status is added.
     */
    const files = [
      'services/salesSignalsService.js',
      'services/blueprintOverviewService.js',
      'controllers/screenChatController.js',
    ];
    for (const f of files) {
      const body = read(f)
        .split('\n')
        .filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
        .join('\n');
      expect(body, f).not.toMatch(/status !== 'live'/);
      expect(body, f).not.toMatch(/status === 'live'(?!\s*\)?\s*return \{ key: 'live')/);
    }
  });

  it('keeps the predicate in the model, where the status is defined', () => {
    // Not in a helper beside one caller: it belongs with the enum it reads.
    expect(read('models/HostedDeployment.js')).toContain('export const isRunning');
    // And the one beside it, for the question the funnel actually asks.
    expect(read('models/HostedDeployment.js')).toContain('export const isServing');
  });
});
