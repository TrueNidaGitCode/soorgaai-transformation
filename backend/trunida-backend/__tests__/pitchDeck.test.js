/**
 * The deck's numbers, counted rather than typed.
 *
 * A deck goes stale the day it is exported, and the stale part is always the
 * figures. The version this replaces said five agents watch for five things;
 * the catalogue is thirty-six across seven areas, and neither the slide nor
 * the person presenting it knew that.
 *
 * So the countable claims are counted off the same code the product runs on.
 * What this file protects is the boundary around that: what the deck is
 * allowed to know is exactly what a delivered application puts on the wire,
 * which is which watcher fired and nothing else.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  watcherAreas, connectorsShipped, summariseUse, WINDOW_DAYS,
} from '../services/pitchDeckService.js';
import { CATALOGUE, AREAS } from '../eame-template/services/agentCatalogue.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('the watchers, as the deck counts them', () => {
  const areas = watcherAreas();

  it('counts every watcher in the catalogue and invents none', () => {
    expect(areas.reduce((n, a) => n + a.count, 0)).toBe(CATALOGUE.length);
  });

  it('groups them by the areas of a business the product defines', () => {
    for (const a of areas) expect(AREAS).toContain(a.area);
  });

  it('leads with the fullest area, so the slide opens on its strongest row', () => {
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i - 1].count).toBeGreaterThanOrEqual(areas[i].count);
    }
  });

  it('drops an empty area rather than showing a zero', () => {
    // "Why is Compliance empty" is not a question worth having in a pitch.
    for (const a of areas) expect(a.count).toBeGreaterThan(0);
  });

  it('names real watchers, so the slide can show examples', () => {
    const names = areas.flatMap((a) => a.watchers.map((w) => w.name));
    expect(names).toContain('No Show');
    expect(names.length).toBe(CATALOGUE.length);
  });

  it('follows the catalogue when it changes, rather than a written-down list', () => {
    const grown = watcherAreas([...CATALOGUE, { id: 'x', area: 'Money', name: 'X', says: 'y' }]);
    expect(grown.find((a) => a.area === 'Money').count)
      .toBe(areas.find((a) => a.area === 'Money').count + 1);
  });
});

describe('the systems it says it can read', () => {
  const list = connectorsShipped();

  it('is read off what actually ships, not off a slide', () => {
    // A connector removed from the product disappears from the deck on the
    // next load, rather than being sold for another six months.
    expect(list.map((c) => c.kind)).toContain('zohocrm');
    expect(list.map((c) => c.kind)).toContain('phone');
  });

  it('gives each one a name somebody outside the building recognises', () => {
    expect(list.find((c) => c.kind === 'zohocrm').name).toBe('Zoho CRM');
    expect(list.find((c) => c.kind === 'phone').name).toBe('Cloud telephony');
    expect(list.find((c) => c.kind === 'leadsquared').name).toBe('LeadSquared');
  });

  it('names every connector that ships, rather than showing its file name', () => {
    // LeadSquared reached the deck as "leadsquared" the day it shipped,
    // because the directory is read and the names are not.
    for (const c of list) expect(c.name, c.kind).not.toBe(c.kind);
  });

  it('leaves out the one that is not a customer system', () => {
    // svarg is the control plane talking to itself.
    expect(list.map((c) => c.kind)).not.toContain('svarg');
  });
});

describe('what customers have done with it', () => {
  const rows = [
    { kind: 'watcher_started', watcherId: 'no-show' },
    { kind: 'watcher_started', watcherId: 'no-show' },
    { kind: 'watcher_started', watcherId: 'promise-overdue' },
    { kind: 'watcher_disabled', watcherId: 'leave-clash' },
    { kind: 'finding_opened' }, { kind: 'finding_opened' }, { kind: 'finding_opened' },
    { kind: 'finding_resolved' },
  ];
  const u = summariseUse(rows);

  it('counts what was switched on and what was switched off again', () => {
    // The first says what sounds valuable; the difference says what turned
    // out to be. Only the pair is worth putting in front of a buyer.
    expect(u.started).toBe(3);
    expect(u.stopped).toBe(1);
    expect(u.kept).toBe(2);
  });

  it('counts findings resolved against findings raised', () => {
    // "We raised four hundred things" is a nuisance. "And two hundred were
    // closed" is a product.
    expect(u.opened).toBe(3);
    expect(u.resolved).toBe(1);
  });

  it('never reports more kept than were ever started', () => {
    const odd = summariseUse([{ kind: 'watcher_disabled', watcherId: 'a' }]);
    expect(odd.kept).toBe(0);
  });

  it('names the watchers customers reach for first, from the catalogue', () => {
    expect(u.popular[0]).toMatchObject({ id: 'no-show', name: 'No Show', count: 2 });
  });

  it('reports an empty quarter as empty rather than as a claim', () => {
    const none = summariseUse([]);
    expect(none).toMatchObject({ started: 0, kept: 0, opened: 0, resolved: 0, popular: [] });
  });
});

describe('what the deck may never know', () => {
  const svc = read('../services/pitchDeckService.js');
  const wire = read('../services/tenantSignalService.js');

  it('reads only the two fields a watching signal carries', () => {
    expect(svc).toContain('{ kind: 1, watcherId: 1, _id: 0 }');
  });

  it('is safe because of the wire, not because of this file', () => {
    // The allow-list drops a finding key, a name or a row before it is ever
    // stored. A promise in the application is not a control; this is.
    expect(wire).toContain("doc.watcherId = String(raw.watcherId || '').slice(0, 64);");
  });

  it('carries no customer-facing field into the deck', () => {
    for (const forbidden of ['finding.key', 'evidence', 'rows:', 'datasetName']) {
      expect(svc.includes(forbidden)).toBe(false);
    }
  });

  it('looks at a window long enough to be a fact', () => {
    expect(WINDOW_DAYS).toBe(90);
  });
});

describe('a figure nobody can defend', () => {
  const svc = read('../services/pitchDeckService.js');

  it('is null when it cannot be read, never zero', () => {
    // Zero is a claim. "Could not read it" is the truth, and the page can
    // leave it out rather than print a number that is wrong.
    expect(svc).toContain('return M ? await M.countDocuments(where) : null;');
  });

  it('carries where it came from, on every claim', () => {
    expect((svc.match(/source:/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('survives a database that is not there', () => {
    // The sales board must open whether or not the signals collection does.
    expect(svc).toContain('catch { signals = []; }');
  });
});
