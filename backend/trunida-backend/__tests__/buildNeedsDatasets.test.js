/**
 * An application with no datasets is not a weaker application.
 *
 * It is one that cannot answer a single question about the business it was
 * built for. That was a warning on the spec — "Arth identified no datasets, so
 * the generated model has no shape to follow" — recorded and nothing more.
 *
 * What it cost: a customer entered an objective as a guest, was shown the AI
 * Opportunities, signed in, approved one, and walked through to a delivered
 * application on one domain of six. Data Readiness never ran, so there were no
 * datasets, so the application went live able to answer nothing. It reported
 * itself healthy for a day and was never opened. Nobody was told, because
 * nothing was watching the warning — and the customer cannot reasonably be
 * asked to sit through the whole flow again.
 *
 * Claiming a preview finishes the blueprint now. This is the second lock: even
 * if generation fails or is still running, nothing ships that cannot answer.
 */

import { describe, it, expect, vi } from 'vitest';
import { whyNoDatasets } from '../services/eameBuildService.js';
import { readFileSync } from 'fs';

/** A blueprint whose data-readiness domain is in the given state. */
const bp = (status, datasets = []) => ({
  domains: [
    { domainId: 'ai-use-cases', status: 'completed', capabilities: [] },
    ...(status ? [{
      domainId: 'data-readiness',
      status,
      capabilities: [{ sections: [{ brief: { datasets } }] }],
    }] : []),
  ],
});

describe('when a build must not go ahead', () => {
  it('refuses while Data Readiness has not run', () => {
    // Gowtham's blueprint, exactly: everything else generated, this pending.
    const why = whyNoDatasets(bp('pending'));
    expect(why).toMatch(/no datasets yet/);
    expect(why).toMatch(/Data Readiness is still pending/);
    // And says what to do about it, rather than only that it is wrong.
    expect(why).toMatch(/generate it from the blueprint, then build/);
  });

  it('refuses while it is mid-generation', () => {
    expect(whyNoDatasets(bp('generating'))).toMatch(/still generating/);
  });

  it('refuses when the domain is not on the blueprint at all', () => {
    expect(whyNoDatasets(bp(null))).toMatch(/is not on this blueprint/);
    expect(whyNoDatasets({})).toMatch(/is not on this blueprint/);
  });

  it('says something different when the domain ran and found nothing', () => {
    // A different fault with a different fix: the generation was poor, not
    // absent, and re-running the same domain is the remedy.
    const why = whyNoDatasets(bp('completed', []));
    expect(why).toMatch(/completed without naming a single dataset/);
    expect(why).toMatch(/Regenerate that domain/);
  });
});

describe('when it may go ahead', () => {
  it('allows a build once there are datasets', () => {
    expect(whyNoDatasets(bp('completed', [{ name: 'Roll Call', purpose: 'who came' }]))).toBe('');
  });

  it('does not care what else on the blueprint is unfinished', () => {
    // Datasets are the thing an application cannot do without. The rest of the
    // blueprint being thin makes a weaker application, not an empty one, and
    // the spec already warns about each.
    const b = bp('completed', [{ name: 'Roll Call' }]);
    b.domains.push({ domainId: 'ai-strategy', status: 'pending', capabilities: [] });
    expect(whyNoDatasets(b)).toBe('');
  });
});

describe('how the refusal reaches the screen', () => {
  const src = readFileSync(new URL('../services/eameBuildService.js', import.meta.url), 'utf8');

  it('is the first thing the build asks, before anything is spent', () => {
    // Generation is the expensive part; refusing after paying for it would be
    // the same mistake in a more costly form.
    const fn = src.slice(src.indexOf('export async function buildApplication'));
    expect(fn.indexOf('whyNoDatasets(bp)')).toBeLessThan(fn.indexOf('LinkedProjectDocument'));
  });

  it('comes back as a failed build with a reason, not as an exception', () => {
    // The controller records `reason` and the screen renders it. A throw would
    // land as "The build crashed", which says nothing anybody can act on.
    expect(src).toContain("return { ok: false, spec: null, files: [], history: [], reason: refusal, noDatasets: true };");
  });

  it('keeps the warning for everything else that only weakens a build', () => {
    const spec = readFileSync(new URL('../services/eameSpec.js', import.meta.url), 'utf8');
    for (const w of ['No use case has been approved', 'No repository was read']) {
      expect(spec).toContain(w);
    }
  });
});

describe('the repair path for an application already delivered empty', () => {
  const src = readFileSync(new URL('../scripts/repair_blueprint.mjs', import.meta.url), 'utf8');

  it('does nothing until it is told to spend money', () => {
    expect(src).toContain("const doGenerate = args.includes('--generate');");
    expect(src).toContain('Add --generate to spend real model calls on this');
  });

  it('asks the provider one cheap question before committing to a long run', () => {
    // A spend cap that is already exhausted should not be discovered six
    // domains in, with half a blueprint written.
    expect(src).toContain("label: 'repair:preflight'");
    expect(src).toContain('so nothing was started');
  });

  it('generates in registry order, so each domain is grounded on the ones before', () => {
    expect(src).toContain('enabledDomains()');
    expect(src).toContain('generateSpecificDomainsAsync');
  });

  it('will not rebuild onto a blueprint that still has no datasets', () => {
    expect(src).toContain('const why = whyNoDatasets(bp);');
    expect(src).toContain('Not rebuilding');
  });
});
