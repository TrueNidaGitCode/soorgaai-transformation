/**
 * Who we sell to, held to the decision that was actually taken.
 *
 * The ICP is not a reference card. `icpFor(role)` feeds the cold-email writer,
 * so whatever is in it is what gets written to real people.
 *
 * It described "VP of Engineering — holds budget for engineering productivity
 * tools" long after the product had been narrowed to administration, and
 * nothing noticed, because nothing tested it. A lead whose designation was
 * "Operations Manager" matched nothing and got an email written with no
 * guidance at all; anyone with "technology" in their title got pitched an
 * engineering productivity tool.
 *
 * These exist so the definition and the product cannot drift apart again in
 * silence.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { ICP, icpFor } from '../services/outreachService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the people we sell to', () => {
  it('recognises whoever runs operations and administration', () => {
    for (const role of [
      'Operations Manager', 'Admin Head', 'Office Manager', 'Administration Lead',
      'Back Office Executive', 'Operations Coordinator',
    ]) {
      expect(icpFor(role), role).not.toBeNull();
    }
  });

  it('recognises the owner, who at a small firm is the operations manager', () => {
    for (const role of ['Owner', 'Founder', 'Proprietor', 'Managing Director']) {
      expect(icpFor(role), role).not.toBeNull();
    }
  });

  it('recognises whoever runs one site', () => {
    for (const role of ['Centre Manager', 'Practice Manager', 'Branch Manager', 'Academy Head']) {
      expect(icpFor(role), role).not.toBeNull();
    }
  });
});

describe('the people we deliberately do not sell to', () => {
  it('does not match the three functions that were ruled out', () => {
    /*
     * Sales, engineering and marketing workflows are each a different buyer, a
     * different vocabulary and a different product. The ICP matching on them
     * is how an email meant for an office manager goes out written for a VP.
     */
    for (const role of [
      'VP of Engineering', 'CTO', 'Head of Platform', 'VP of Marketing',
      'Growth Lead', 'VP of Sales', 'CRO', 'Business Development Manager',
    ]) {
      expect(icpFor(role), role).toBeNull();
    }
  });

  it('carries no trace of the old definition', () => {
    const text = JSON.stringify(ICP).toLowerCase();
    expect(text).not.toContain('engineering productivity');
    expect(text).not.toContain('vp of engineering');
    expect(text).not.toContain('revenue motion');
  });
});

describe('what each brief tells the writer', () => {
  it('leads with the work, never with the technology', () => {
    for (const p of ICP) {
      expect(p.brief.length, p.label).toBeGreaterThan(80);
      // "AI" as a pitch is the thing every one of these people has already been
      // sold once. The brief has to point at their week instead.
      expect(p.brief.toLowerCase(), p.label).not.toMatch(/\bai-powered|cutting.edge|transform your/);
    }
  });

  it('names the shape of the work the product is for', () => {
    const all = ICP.map((p) => p.brief).join(' ').toLowerCase();
    expect(all).toMatch(/coordination|administrative|admin/);
  });
});

describe('the screen says the same thing as the writer', () => {
  const ui = read('../../../frontend/admin/sales.js');

  it('shows the definition where leads are added', () => {
    expect(ui).toContain('function renderIcpView()');
    expect(ui).toContain('Who we sell to');
    expect(ui).toContain('high volume of recurring');
  });

  it('says plainly what is out of scope', () => {
    // The refusal is the half that keeps the narrowing alive on a busy day.
    expect(ui).toContain('Sales workflows. Engineering workflows. Marketing workflows.');
  });

  it('no longer advises the operator to sell to a VP of Engineering', () => {
    expect(ui).not.toContain('VP of Engineering');
    expect(ui).not.toContain('engineering productivity tools');
  });

  it('is a tab of its own, beside Funnel, Reports and Pitches', () => {
    const html = read('../../../frontend/admin/sales.html');
    expect(html).toContain('id="sg-view-icp"');
    expect(html).toContain('id="sg-icp"');
  });
});

describe('a tab shows only its own view', () => {
  const ui = read('../../../frontend/admin/sales.js');
  const html = read('../../../frontend/admin/sales.html');

  it('has one mechanism for visibility, not two', () => {
    /*
     * The bug. renderStage ended with an inline display:block, and an inline
     * display beats [hidden] — so setView's `sg-stage.hidden = !funnel` had no
     * effect and the funnel's stage tabs stayed on screen while the ICP tab
     * was open. Two ways of hiding the same element is one way too many.
     */
    expect(html).toContain('<div id="sg-stage" hidden></div>');
    expect(html).not.toContain('id="sg-stage" style="display:none"');

    const render = ui.slice(ui.indexOf('function renderStage()'));
    const body = render.slice(0, render.indexOf('\n}'));
    expect(body).not.toContain('style.display');
  });

  it('hides every funnel panel when the view is not the funnel', () => {
    const view = ui.slice(ui.indexOf('function setView(view)'), ui.indexOf('function renderReports'));
    for (const id of ['sg-kinds', 'sg-tabs', 'sg-stage', 'nl-panel']) {
      expect(view, id).toContain(`document.getElementById('${id}').hidden = !funnel;`);
    }
  });

  it('re-applies the view after a load, so a refresh does not reveal the funnel', () => {
    /*
     * load() rebuilds the funnel's panels on every refresh. Rendering only for
     * the open tab would leave a stale funnel behind when somebody switched
     * back to it, so the content is always rebuilt and setView decides what is
     * on screen.
     */
    expect(ui).toContain('setView(state.view);');
  });

  it('keeps the banner working, which the first attempt at this broke', () => {
    // The fix was applied to the wrong occurrence of an identical line: the
    // banner's, near the top of the file, rather than renderStage's.
    const banner = ui.slice(ui.indexOf('function banner(message'), ui.indexOf('function banner(message') + 700);
    expect(banner).toContain("el.style.display = 'block';");
  });
});
