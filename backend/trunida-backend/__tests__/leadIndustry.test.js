/**
 * A lead says what business it is in, in the same words the knowledge base does.
 *
 * The industry is not decoration on a row. It is what decides which KB overlay
 * grounds a conversation and which AI opportunities are worth leading with —
 * so a lead and a blueprint have to mean the same thing by "Automotive" or the
 * join is a coincidence rather than a key.
 *
 * The second property is the one worth protecting: the field SUGGESTS the
 * industries the KB covers and REFUSES none. You meet companies in industries
 * you have no overlay for; refusing them would lose the pipeline, and silently
 * accepting them as though they were covered would lose the signal. A lane full
 * of an industry the KB has never heard of is the clearest statement there is
 * about what to write next, and it only survives if the row can say it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fieldsFor, motionRegistry, MOTIONS } from '../services/gtmMotions.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the field', () => {
  it('is asked for on a walk-in, where it is often all you know', () => {
    const keys = fieldsFor('walk-in').map(f => f.key);
    expect(keys).toContain('industry');
    // Before the person. You have the stand and the sector; the name comes
    // after the visit.
    expect(keys.indexOf('industry')).toBeLessThan(keys.indexOf('name'));
  });

  it('is asked for on every motion, not only the one it was added for', () => {
    for (const m of MOTIONS) {
      expect(fieldsFor(m.key).map(f => f.key), `${m.key} does not ask for it`)
        .toContain('industry');
    }
  });

  it('is never required', () => {
    /*
     * A required industry is a guess typed to get past a form. You meet a
     * company at a trade show knowing only its name, and a blank is a truthful
     * answer that a mandatory field would turn into a false one.
     */
    for (const m of MOTIONS) {
      const f = fieldsFor(m.key).find(x => x.key === 'industry');
      expect(f.required, `${m.key} requires an industry`).toBeFalsy();
    }
  });
});

describe('what it suggests', () => {
  it('offers the industries it is handed, and nothing when handed none', () => {
    const none = fieldsFor('walk-in').find(f => f.key === 'industry');
    expect(none.suggestions).toBeUndefined();

    const some = fieldsFor('walk-in', { industries: ['Automotive', 'Sports Academies'] })
      .find(f => f.key === 'industry');
    expect(some.suggestions).toEqual(['Automotive', 'Sports Academies']);
  });

  it('is a suggestion list, not a closed set', () => {
    /*
     * `options` is what gtmMotions validates against — addLead rejects a value
     * outside it. `suggestions` is a datalist and rejects nothing. The field
     * must use the second, or the first electronics manufacturer we meet is
     * refused by the form for the crime of not being in the knowledge base.
     */
    const f = fieldsFor('walk-in', { industries: ['Automotive'] }).find(x => x.key === 'industry');
    expect(f.options).toBeUndefined();
    expect(f.suggestions).toBeDefined();
  });

  it('carries them through the registry to the screen', () => {
    const reg = motionRegistry({ industries: ['Automotive'] });
    const walk = reg.motions.find(m => m.key === 'walk-in');
    expect(walk.fields.find(f => f.key === 'industry').suggestions).toEqual(['Automotive']);
  });

  it('does not read the filesystem to answer a question about a form', () => {
    // The registry is a registry. The controller looks the industries up and
    // hands them in, so a missing KB directory costs the form its suggestions
    // and never costs the screen its motions.
    const src = read('../services/gtmMotions.js');
    expect(src).not.toContain('listGroundedIndustries');
    expect(src).not.toMatch(/from 'fs'/);

    const ctrl = read('../controllers/salesSignalsController.js');
    expect(ctrl).toContain('listGroundedIndustries');
    // Failing soft, on purpose.
    expect(ctrl).toMatch(/try \{ industries = listGroundedIndustries\(\); \} catch/);
  });
});

describe('it survives the trip to the database', () => {
  it('is on the model, and indexed because a lane is filtered by it', () => {
    const model = read('../models/ColdLead.js');
    expect(model).toMatch(/industry: \{ type: String, default: '', trim: true, index: true \}/);
  });

  it('is written by addLead and by updateLead', () => {
    const svc = read('../services/salesSignalsService.js');
    // Both, or the field is settable when a lead is created and never again —
    // which for a walk-in is exactly backwards, since the industry is often
    // corrected after the visit.
    expect(svc).toContain("...(industry !== undefined ? { industry: String(industry).trim().slice(0, 80) } : {})");
    expect(svc).toContain("if (industry !== undefined) set.industry = String(industry).trim().slice(0, 80);");
  });

  it('is carried by the controller on both the create and the update path', () => {
    /*
     * The failure this pins: a field named in the form, named on the model and
     * named in the service, dropped in the four lines between them. It has
     * happened here before — orgContext was passed by the screen, missing from
     * the signature, and the one sentence worth reading went on the floor.
     */
    const ctrl = read('../controllers/salesSignalsController.js');
    const create = ctrl.slice(ctrl.indexOf('export async function createLead'), ctrl.indexOf('export async function patchLead'));
    const patch  = ctrl.slice(ctrl.indexOf('export async function patchLead'), ctrl.indexOf('export async function removeLead'));
    // Read off the request AND handed to the service, on each path.
    expect(create.match(/industry/g)?.length, 'createLead drops it').toBeGreaterThanOrEqual(2);
    expect(patch.match(/industry/g)?.length, 'patchLead drops it').toBeGreaterThanOrEqual(2);
  });
});

describe('the screen', () => {
  const ui = read('../../../frontend/admin/sales.js');

  it('shows it against the organisation on both tables', () => {
    // Two row renderers, two org cells. A field that appears on one of them is
    // a field that vanishes when you switch tab.
    expect(ui.match(/\$\{industryCell\(r\)\}/g)?.length).toBe(2);
  });

  it('marks an industry the knowledge base does not cover', () => {
    expect(ui).toContain('sg-industry--ungrounded');
    const css = read('../../../frontend/admin/sales.css');
    expect(css).toContain('.sg-industry--ungrounded');
  });

  it('reads what is grounded from the registry rather than keeping a second copy', () => {
    expect(ui).toContain('function groundedIndustries()');
    expect(ui).not.toContain('state.industries');
  });

  it('can be corrected from Log, like the location beside it', () => {
    expect(ui).toContain('sg-l-industry');
    expect(ui).toContain("industry: box.querySelector('.sg-l-industry').value.trim(),");
  });
});

describe('the location select does not destroy what it does not recognise', () => {
  const ui = read('../../../frontend/admin/sales.js');

  it('carries the row\u2019s current value as an option', () => {
    /*
     * The list is India and US. A row whose location is neither — an area typed
     * on a walk-in, a city written by an import — matched no option, so the
     * browser selected the first ("not recorded") and Save wrote an empty
     * string over it. Opening the log to READ a row deleted a field on it.
     *
     * This is the same family as the bug that made a contactless walk-in
     * overwrite a real cold-email lead: a value that is absent and a value that
     * is unrecognised are not the same thing, and code that treats them the
     * same loses data quietly.
     */
    expect(ui).toContain('function locationOptions(current)');
    expect(ui).toContain("const all = current && !known.includes(current) ? [...known, current] : known;");
  });

  it('is used by both tables, and the old inline list is gone', () => {
    expect(ui.match(/\$\{locationOptions\(r\.location\)\}/g)?.length).toBe(2);
    expect(ui).not.toContain("${['India', 'US'].map(o =>");
  });
});

/*
 * ── The half that was missing ──────────────────────────────────────────────
 *
 * Everything above is about the field being ASKED for and STORED. It was, and
 * correctly. It was never read back.
 *
 * The funnel builds its own row for each lead rather than passing the document
 * through, and industry was not among the fields it copied. So the industry
 * cell rendered empty for every lead that had one, the edit form opened blank
 * over a saved value — one Save away from erasing it — and the industry
 * grouping put all hundred and two rows in "Not set". Four clinics were added
 * and the Clinics & Wellness count stayed at zero.
 *
 * A field written and not returned looks, from the screen, exactly like a
 * field nobody filled in.
 */
describe('the industry survives the round trip to the screen', () => {
  const svc = read('../services/salesSignalsService.js');

  /** The outreach row builder: the object the funnel actually renders. */
  function outreachRow() {
    const at = svc.indexOf('const outreach = leads');
    expect(at, 'the outreach builder').toBeGreaterThan(-1);
    return svc.slice(at, svc.indexOf('.sort(byRecency)', at));
  }

  it('is copied onto the row the funnel renders', () => {
    expect(outreachRow()).toMatch(/industry: l\.industry \|\| '',/);
  });

  it('defaults to a string, like every other optional field on the row', () => {
    // The row's own rule, learned when an undefined email reached .padEnd and
    // was reported to the operator as "could not read the sales funnel".
    expect(outreachRow()).not.toMatch(/industry: l\.industry,/);
  });

  it('is the field the row already renders and edits', () => {
    const ui = read('../../../frontend/admin/sales.js');
    // Both halves were already there, reading a value that never arrived.
    expect(ui).toContain('function industryCell(r)');
    expect(ui).toMatch(/value="\$\{esc\(r\.industry \|\| ''\)\}"/);
  });

  it('is what the funnel groups by, so an empty read reads as Not set', () => {
    const ui = read('../../../frontend/admin/sales.js');
    expect(ui).toContain('function segmentOf(row)');
    expect(ui).toMatch(/if \(!text\) return 'unset';/);
  });
});
