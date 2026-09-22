/**
 * The three checks on the Yusu screen, and what they are allowed to say.
 *
 * Two of them used to read the blueprint's Governance & Ethics sections and
 * confirm the right headings existed. That measured whether a document had
 * been written, not whether the application behaves — and the day the domain
 * was switched off for owner-operators, both went permanently red on every new
 * blueprint. A screen that is always partly red teaches people that red is
 * normal, which costs more than the checks were worth.
 *
 * They read the running application's own conformance report now. That brings
 * a third state with it: a check on a running application cannot report until
 * the application is running, and "not yet" is not a failure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// jsdom gives import.meta.url an http scheme, so a file URL cannot be built
// from it here. The suite runs with the frontend directory as its root.
const read = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');

const src = read('domain/yusuScreen.js');

describe('where the checks get their answer', () => {
  it('reads the deployed application\'s report, not the blueprint\'s sections', () => {
    expect(src).toContain('const report = dep?.conformance || null;');
  });

  it('no longer inspects the governance domain for section headings', () => {
    // The whole reason two checks went red on every new blueprint.
    expect(src).not.toContain('governanceAreas');
    expect(src).not.toContain('hasArea');
  });

  it('keeps the security check, which reads the files actually delivered', () => {
    // A fact about the delivery rather than about behaviour, and still worth
    // asserting: a committed .env is the one thing it exists to catch.
    expect(src).toContain('const hasFile =');
    expect(src).toMatch(/secrets must not be committed/);
  });

  it('groups the report by what each check claims', () => {
    // Line-ending agnostic: this file is CRLF on disk.
    expect(src).toMatch(/fromReport\(\s+\['Answer validity', 'Traceability'\]/);
    expect(src).toMatch(/fromReport\(\s+\['Data privacy & security', 'Trust'\]/);
  });
});

describe('the three states', () => {
  it('treats a report that has not run as waiting, not as failing', () => {
    expect(src).toContain("return { pass: null, why: report?.reason || 'Runs once the application is live.' };");
  });

  it('treats a group where everything was skipped as waiting', () => {
    // Skipped is not passed and it is not failed: the application could not
    // demonstrate the thing either way.
    expect(src).toContain('if (skipped.length === mine.length) return { pass: null, why: skipped[0].detail };');
  });

  it('fails only on an actual failure, and shows that failure\'s own words', () => {
    expect(src).toContain("const failed = mine.filter(c => c.outcome === 'failed');");
    expect(src).toContain('return { pass: false, why: failed[0].detail || failed[0].name };');
  });

  it('says how many could not be checked rather than implying they passed', () => {
    expect(src).toContain('could not be checked');
  });
});

describe('what the screen draws', () => {
  it('separates failing from waiting when deciding the verdict', () => {
    expect(src).toContain('const failed  = results.filter(r => r.pass === false);');
    expect(src).toContain('const waiting = results.filter(r => r.pass !== true && r.pass !== false);');
    expect(src).toContain('const allPass = !failed.length && !waiting.length;');
  });

  it('draws a waiting check in its own state, not in the failure state', () => {
    expect(src).toContain("if (r.pass === false) return '&#9888; Needs attention';");
    expect(src).toContain("return '&#8943; Waiting';");
    expect(src).toContain('tr-card--waiting');
  });

  it('does not put a cross on the shield while it is only waiting', () => {
    expect(src).toContain("verdict.className = 'tr-verdict yu-gov__verdict' + (failed.length ? ' tr-verdict--fail' : '');");
    expect(src).toContain("<span class=\"yu-shield${failed.length ? ' yu-shield--fail' : ''}\"");
  });

  it('never claims all checks passed while any is still waiting', () => {
    expect(src).toContain("allPass ? 'All checks passed'");
    expect(src).toContain("failed.length ? 'Some checks need attention'");
    expect(src).toContain("'Checks run once it is live'");
  });
});

describe('the waiting style exists, or the class does nothing', () => {
  const css = read('domain/domain.css');

  it('defines tr-card--waiting', () => {
    expect(css).toContain('.tr-card--waiting {');
    expect(css).toContain('.tr-card--waiting .tr-card__verdict');
  });

  it('is cache-busted, or nobody sees any of this', () => {
    /*
     * These files have no cache-busting of their own; a stale copy is how a
     * UI fix appears not to have shipped.
     *
     * A floor, not an exact match. Pinning the number meant every later fix
     * to these files failed a test about a different fix, which teaches
     * people to bump the assertion without reading it. What matters is that
     * the version moved past the change this file is about.
     */
    const html = read('domain/domain.html');
    const css = /domain\.css\?v=(\d+)/.exec(html);
    const js = /yusuScreen\.js\?v=(\d+)/.exec(html);
    expect(css, 'domain.css must carry a ?v=').toBeTruthy();
    expect(js, 'yusuScreen.js must carry a ?v=').toBeTruthy();
    expect(Number(css[1])).toBeGreaterThanOrEqual(76);
    expect(Number(js[1])).toBeGreaterThanOrEqual(39);
  });
});

describe('the screen keeps asking until the checks report', () => {
  /*
   * ── What every customer saw ──────────────────────────────────────────────
   *
   * Governance Check and Ethics Check sat on "waiting" after a successful
   * deployment, on every application, until somebody reloaded the page.
   *
   * The self-check is fired by the very request that first sees the
   * deployment live, and takes the better part of a minute — three real
   * questions through the real pipeline. The poll stopped the moment the
   * status left 'attaching', which is that same request. So the screen gave
   * up asking at exactly the point it began waiting for something, and the
   * report landed eleven seconds after it stopped looking.
   *
   * Both checks had passed. The page just never asked again.
   */
  const js = read('domain/yusuScreen.js');
  const poll = js.slice(js.indexOf('function pollWhileBuilding'),
                        js.indexOf('function pollWhileBuilding') + 1600);

  it('does not stop the moment the build finishes', () => {
    expect(poll).not.toMatch(/if \(_dep\?\.status !== 'attaching'\) \{ _buildingSince = 0; return; \}/);
  });

  it('keeps polling while a live deployment has not reported', () => {
    expect(poll).toMatch(/liveWithoutReport/);
    expect(poll).toMatch(/!_dep\?\.conformance/);
  });

  it('stops once the report arrives', () => {
    // Otherwise a finished screen polls the server for ever.
    expect(poll).toMatch(/if \(!building && !liveWithoutReport\) \{ _buildingSince = 0; return; \}/);
  });

  it('gives up if the report never comes, rather than polling for ever', () => {
    expect(poll).toMatch(/REPORT_WAIT_MS/);
    expect(poll).toMatch(/Date\.now\(\) - _buildingSince > REPORT_WAIT_MS/);
  });

  it('is cache-busted, or nobody gets the fix', () => {
    const html = read('domain/domain.html');
    const m = /yusuScreen\.js\?v=(\d+)/.exec(html);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(40);
  });
});
