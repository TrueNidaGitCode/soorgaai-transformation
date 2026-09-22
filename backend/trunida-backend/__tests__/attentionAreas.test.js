/**
 * The headings a findings board groups under, and where they come from.
 *
 * ── Why these are in the knowledge base ────────────────────────────────────
 *
 * A physiotherapy centre thinks in Retention, Utilisation, Growth, Cash and
 * Compliance. An engineering organisation thinks in Schedule, Quality, Cost,
 * People, Customer and Risk. The same watcher — "somebody stopped turning up"
 * — is Retention in one and Adoption in another. That is industry knowledge,
 * and industry knowledge lives in the knowledge base, so publishing a new
 * industry defines its own categories with no code change.
 *
 * ── Why they are parsed and not inferred ───────────────────────────────────
 *
 * Categories decide how a screen is laid out. That is navigation, not an
 * answer: it must be identical every morning for one business, and identical
 * between two businesses in the same trade, or two customers in one industry
 * end up with screens that cannot be discussed together. A model asked to
 * infer them would produce a defensible list each time and a slightly
 * different one the next time, and nothing would report the drift.
 */

import { describe, it, expect } from 'vitest';
import { attentionAreas, categoryOf, categoriesFor } from '../services/attentionAreasService.js';
import { CATALOGUE } from '../eame-template/services/agentCatalogue.js';
import { watcherPlanFile } from '../services/watcherPlanService.js';

const COVERED = ['Clinics & Wellness', 'Sports Academies', 'Automotive',
  'Education Technology', 'Artificial Intelligence'];

describe('every covered industry states its own categories', () => {
  for (const industry of COVERED) {
    it(`${industry} names categories in its own words`, () => {
      const areas = attentionAreas(industry);
      expect(areas.length, `${industry} has no table`).toBeGreaterThanOrEqual(5);
      for (const a of areas) {
        expect(a.name, 'a category needs a name').toBeTruthy();
        expect(a.asks, `${a.name} must say what it answers`).toBeTruthy();
        expect(a.watchers.length, `${a.name} claims no watchers`).toBeGreaterThan(0);
      }
    });

    it(`${industry} places every watcher exactly once`, () => {
      /*
       * Completeness and exclusivity together. A watcher named nowhere would
       * fall silently into the last category; a watcher named twice would put
       * one finding under two headings and make the counts disagree with the
       * rows.
       */
      const areas = attentionAreas(industry);
      const placed = areas.flatMap(a => a.watchers);
      expect(new Set(placed).size, 'a watcher is claimed twice').toBe(placed.length);

      const all = CATALOGUE.map(c => c.id);
      const missing = all.filter(id => !placed.includes(id));
      expect(missing, `${industry} does not place these`).toEqual([]);
    });
  }

  it('uses different words for different trades', () => {
    // The whole point. If two industries produced the same headings, the table
    // would be ceremony around a constant.
    const clinic = attentionAreas('Clinics & Wellness').map(a => a.name);
    const engineering = attentionAreas('Automotive').map(a => a.name);
    expect(clinic).toContain('Retention');
    expect(engineering).toContain('Schedule');
    expect(clinic).not.toEqual(engineering);
  });
});

describe('routing a finding to its category', () => {
  const clinic = attentionAreas('Clinics & Wellness');

  it('sends a watcher to the category that claims it', () => {
    expect(categoryOf(clinic, 'stopped-coming')).toBe('Retention');
    expect(categoryOf(clinic, 'empty-slot')).toBe('Utilisation');
    expect(categoryOf(clinic, 'unanswered-enquiry')).toBe('Growth');
    expect(categoryOf(clinic, 'overdue-invoice')).toBe('Cash');
  });

  it('sends an unknown watcher to the last category, not to an "Other"', () => {
    // A business does not have an Other, and an escape hatch is where findings
    // quietly go to be ignored.
    expect(categoryOf(clinic, 'a-watcher-added-after-this-table')).toBe(clinic[clinic.length - 1].name);
  });

  it('says nothing when the industry has no table', () => {
    // An industry published before this, or one grounded on core content only,
    // keeps working on the generic areas every watcher already carries.
    expect(attentionAreas('Nowhere Land')).toEqual([]);
    expect(categoryOf([], 'stopped-coming')).toBe('');
  });
});

describe('the categories reach a delivered application', () => {
  it('ride along in the file the application already reads', () => {
    /*
     * data/agents.json already carried Cob's watcher ordering. Categories are
     * a third key on it rather than a second mechanism — no new file, no new
     * gateway endpoint, nothing for delivery to learn.
     */
    const file = watcherPlanFile({
      businessObjective: 'clients stop coming and enquiries go unanswered',
      industryFit: { industry: 'Clinics & Wellness' },
    });
    expect(file.path).toBe('data/agents.json');
    const plan = JSON.parse(file.content);
    expect(plan.categories.map(c => c.name)).toEqual(
      ['Retention', 'Utilisation', 'Growth', 'Cash', 'Compliance']);
    expect(plan.startHere.length).toBeGreaterThan(0);
  });

  it('send none when the blueprint matched no industry', () => {
    const plan = JSON.parse(watcherPlanFile({ businessObjective: 'something' }).content);
    expect(plan.categories).toEqual([]);
  });

  it('carry what the chips need and nothing else', () => {
    for (const c of categoriesFor('Automotive')) {
      expect(Object.keys(c).sort()).toEqual(['asks', 'name', 'watchers']);
    }
  });
});

describe('a generated sample that does not fit its header', () => {
  /*
   * ── What this cost ───────────────────────────────────────────────────────
   *
   * A physiotherapy centre's attendance log shipped with rows carrying fourteen
   * fields against a fifteen-column header. Nothing noticed. Every column after
   * the gap shifted left, so attendance_status on those rows read "0" instead
   * of "No-Show" — and asking the application for no-shows returned none while
   * the file plainly contained them.
   *
   * Three of the six datasets that clinic was given were affected. The data was
   * wrong in a way that looked exactly like the data being fine.
   */
  it('drops a short row rather than padding it', async () => {
    /*
     * Padding is the tempting repair and the wrong one. The missing field is
     * not at the end — those rows were no-shows, so the gap sat among three
     * consecutive blank timestamps. Appending an empty cell leaves everything
     * between the gap and the end still in the wrong column, and a confidently
     * wrong row is worse than an absent one: it is the sort that reaches a
     * customer as a finding.
     */
    const { enforceMarker } = await import('../services/syntheticDatasetService.js');
    const header = '_source,log_id,client_id,check_in,session_start,session_end,method,status';
    const good = 'sample,LOG-1,CL-1,2026-09-20 09:00,2026-09-20 09:05,2026-09-20 09:50,QR,Completed';
    const short = 'sample,LOG-3,CL-3,,,Front_Desk,No-Show';

    const r = enforceMarker([header, good, short].join('\n'));
    expect(r.rowCount).toBe(1);
    expect(r.dropped).toBe(1);
    expect(r.csv).not.toContain('LOG-3');
  });

  it('keeps a row whose comma is inside quotes', async () => {
    /*
     * The mistake the fix could easily have introduced. The generator is asked
     * for realistic values and a quoted comma is the normal case, not the edge
     * one — "Cabin B, Electrotherapy" is one field. Counting on a naive split
     * would call a perfectly good row malformed and drop it, trading one kind
     * of silent data loss for another.
     */
    const { enforceMarker } = await import('../services/syntheticDatasetService.js');
    const header = '_source,log_id,cabin,status';
    const quoted = 'sample,LOG-2,"Cabin B, Electrotherapy",No-Show';

    const r = enforceMarker([header, quoted].join('\n'));
    expect(r.rowCount).toBe(1);
    expect(r.dropped).toBe(0);
    expect(r.csv).toContain('Cabin B, Electrotherapy');
  });

  it('checks arity on the branch that adds the marker too', async () => {
    // A generation that forgot the marker column takes a different path, and
    // the first version of this fix only guarded one of the two.
    const { enforceMarker } = await import('../services/syntheticDatasetService.js');
    const r = enforceMarker(['log_id,client_id,status', 'LOG-1,CL-1,Completed', 'LOG-2,CL-2'].join('\n'));
    expect(r.rowCount).toBe(1);
    expect(r.dropped).toBe(1);
    expect(r.csv).not.toContain('LOG-2');
  });
});
