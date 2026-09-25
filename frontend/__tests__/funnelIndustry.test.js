/**
 * The funnel, grouped by the business each row is in.
 *
 * ── What the grouping said the first time it ran ───────────────────────────
 *
 * A hundred and two rows, thirty-odd industry spellings, and the impression
 * of a varied pipeline. Grouped, it is: sixty-three electronics and
 * industrial companies, thirty-nine with no industry recorded at all, and
 * nobody in the segment being sold to.
 *
 * That is the feature. Not a filter for convenience — a count that contradicts
 * what the screen looked like.
 *
 * ── The rules it has to keep ───────────────────────────────────────────────
 *
 * Nothing may be hidden by being unrecognised. A row whose words match no
 * group lands in Other, a row with no industry lands in Not set, and both are
 * shown with their counts: this screen already holds that a silent filter
 * which quietly drops a real prospect is worse than a bucket nobody likes.
 *
 * And the segment being sold to is shown even at zero, because that is the
 * one number worth putting in front of somebody.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/sales.js');
const css = read('../admin/sales.css');
const html = read('../admin/sales.html');

/** The shipped classifier, lifted out and run. */
function load() {
  const at = js.indexOf('const FUNNEL_SEGMENTS = [');
  expect(at, 'FUNNEL_SEGMENTS').toBeGreaterThan(-1);
  let depth = 0;
  let end = -1;
  for (let i = js.indexOf('[', at); i < js.length; i++) {
    if (js[i] === '[') depth++;
    else if (js[i] === ']' && --depth === 0) { end = i + 1; break; }
  }
  const segs = js.slice(js.indexOf('[', at), end);

  const fnAt = js.indexOf('function segmentOf(row) {');
  expect(fnAt, 'segmentOf').toBeGreaterThan(-1);
  depth = 0;
  let fnEnd = -1;
  for (let i = js.indexOf('{', fnAt); i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}' && --depth === 0) { fnEnd = i + 1; break; }
  }
  // eslint-disable-next-line no-new-func
  return new Function(`const FUNNEL_SEGMENTS = ${segs};
    ${js.slice(fnAt, fnEnd)}
    return { segmentOf, FUNNEL_SEGMENTS };`)();
}

const { segmentOf, FUNNEL_SEGMENTS } = load();

describe('every row lands somewhere', () => {
  it('never returns nothing, whatever it is given', () => {
    for (const row of [{}, { industry: '' }, { industry: '   ' }, null, undefined,
      { industry: 'Something Nobody Has Heard Of' }]) {
      expect(FUNNEL_SEGMENTS.map((s) => s.id)).toContain(segmentOf(row));
    }
  });

  it('puts a blank industry in Not set rather than in Other', () => {
    // They are different facts: one is a business we have not classified, the
    // other is a row somebody never finished filling in.
    expect(segmentOf({ industry: '' })).toBe('unset');
    expect(segmentOf({})).toBe('unset');
    expect(segmentOf({ industry: 'Artificial Intelligence' })).toBe('other');
  });
});

describe('the spellings actually in the funnel', () => {
  /*
   * Taken from the live data, not invented: these are the industry strings
   * on the hundred and two cold leads as typed.
   */
  const ELECTRONICS = [
    'Industrial Automation', 'Electronics Manufacturing Services', 'Semiconductors',
    'Test & Measurement', 'Electronics Design Services', 'IoT & Embedded Systems',
    'Metrology', 'Machine Vision & Inspection', 'PCB Manufacturing', 'Power Electronics',
    'Robotics & Automation', 'Electronic Components', 'Compliance & Testing Laboratories',
    'Semiconductor Design Services', 'Specialty Chemicals & Materials', 'Machine Tools',
    'Electronic Design Automation', 'Consumer Electronics', 'Electronic Components Distribution',
    'Warehouse Automation', 'Electromechanical Components', 'Power Semiconductors',
    'Industrial Trade Media', 'Wire Processing Machinery', 'SMT & Soldering Equipment',
    'Engineering Software (PLM/CAD)', 'Surface Treatment Equipment',
    'Industrial Sensors & Machine Vision', 'Advanced Materials', 'Energy & Power Electronics',
    'Cables & Connectors',
  ];

  it('collapses thirty-one spellings into one industry', () => {
    for (const s of ELECTRONICS) expect(segmentOf({ industry: s }), s).toBe('electronics');
  });

  it('recognises the segment being sold to, in the words a clinic would use', () => {
    for (const s of ['Physiotherapy', 'Physiotherapy clinic', 'Wellness centre',
      'Health & wellness', 'Rehabilitation', 'Dental clinic', 'Fitness & gym',
      'Sports medicine', 'Yoga studio']) {
      expect(segmentOf({ industry: s }), s).toBe('clinics');
    }
  });

  it('keeps academies and schools apart from clinics', () => {
    expect(segmentOf({ industry: 'Cricket academy' })).toBe('sports');
    expect(segmentOf({ industry: 'Coaching centre' })).toBe('sports');
    expect(segmentOf({ industry: 'School' })).toBe('education');
    expect(segmentOf({ industry: 'EdTech' })).toBe('education');
  });
});

describe('what the screen does with it', () => {
  it('filters the rows every stage shows, alongside the kind filter', () => {
    expect(js).toMatch(/state\.industry === 'all' \|\| segmentOf\(r\) === state\.industry/);
  });

  it('starts on all of them, so nothing is hidden before anybody chooses', () => {
    expect(js).toMatch(/industry: 'all',/);
  });

  it('shows the segment being sold to even when it holds nobody', () => {
    // The chip reading "Clinics & Wellness 0" is the point of the feature.
    const seg = FUNNEL_SEGMENTS.find((s) => s.id === 'clinics');
    expect(seg.always).toBe(true);
    expect(js).toMatch(/totals\[s\.id\] \|\| s\.always/);
    expect(css).toMatch(/\.sg-ind--focus \{/);
  });

  it('has a row of its own, hidden with the rest of the funnel', () => {
    expect(html).toContain('id="sg-inds"');
    expect(js).toContain("document.getElementById('sg-inds').hidden = !funnel;");
  });

  it('recounts when the kind filter changes, since its counts are of what that left', () => {
    expect(js).toMatch(/renderKindFilter\(\); renderIndustryFilter\(\);/);
  });
});
