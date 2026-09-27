/**
 * The layer between the systems and the agents.
 *
 * ── What this is for ───────────────────────────────────────────────────────
 *
 * The board had one word — watcher — for two different things: the systems
 * being read, and the agents deciding what the rows mean. Two concepts under
 * one word is how a product that finds business problems starts reading as an
 * integration monitor, so the screen now names three layers: your systems ask
 * "what happened", business agents ask "what does it mean", and the Chief asks
 * "what should you know about".
 *
 * ── The rule this file holds ───────────────────────────────────────────────
 *
 * A source shown beside a finding must be a system that actually put rows into
 * this application. data/sources.json lists what the INDUSTRY usually runs on,
 * which is right for offering somebody a connector on the Data page and wrong
 * beside evidence: an application whose owner uploaded one spreadsheet must
 * say one spreadsheet, however many systems a clinic normally has.
 *
 * So the sources are read from provenance — what landed, from where, when.
 */
import { describe, it, expect } from 'vitest';
import { sourcesFrom, sourceLabel, SOURCE_LABELS } from '../eame-template/services/connectorService.js';

/** What provenanceSummary() returns: per dataset, counts by where rows came from. */
const PROV = {
  'Appointment Booking Diary': {
    bySource: { folder: 120, own: 8 },
    lastChange: '2026-09-20T09:00:00.000Z',
    missing: 0,
  },
  'Enquiries and Calls': {
    bySource: { whatsapp: 40 },
    lastChange: '2026-09-26T09:00:00.000Z',
    missing: 0,
  },
  'Fee payments': {
    bySource: { folder: 60 },
    lastChange: '2026-09-01T09:00:00.000Z',
    missing: 0,
  },
};

describe('the systems this application actually reads', () => {
  it('names every source that put rows in, busiest first', () => {
    const out = sourcesFrom(PROV);
    expect(out.map((s) => s.kind)).toEqual(['folder', 'whatsapp', 'own']);
    expect(out[0].rows).toBe(180);      // 120 + 60, across two datasets
    expect(out[0].datasets).toEqual(['Appointment Booking Diary', 'Fee payments']);
  });

  it('narrows to the datasets one agent reads, which is the whole point', () => {
    /*
     * The agent comparing the diary against the call log reads two systems;
     * the one watching fees reads one. That difference is what the chips
     * under an agent's name are showing, and it has to be true.
     */
    const both = sourcesFrom(PROV, ['Appointment Booking Diary', 'Enquiries and Calls']);
    expect(both.map((s) => s.kind).sort()).toEqual(['folder', 'own', 'whatsapp']);

    const one = sourcesFrom(PROV, ['Fee payments']);
    expect(one.map((s) => s.kind)).toEqual(['folder']);
    expect(one[0].rows).toBe(60);
  });

  it('carries the most recent change across the datasets a source feeds', () => {
    const whatsapp = sourcesFrom(PROV).find((s) => s.kind === 'whatsapp');
    expect(whatsapp.lastChange).toBe('2026-09-26T09:00:00.000Z');
  });

  it('invents nothing when nothing has landed', () => {
    /*
     * The honest empty state, and the one that matters most: an application
     * with no rows must not show "CRM · Connected · Watching" because its
     * industry block mentions a CRM. The screen says no records have arrived.
     */
    expect(sourcesFrom({})).toEqual([]);
    expect(sourcesFrom(null)).toEqual([]);
    expect(sourcesFrom(PROV, [])).toEqual([]);
    expect(sourcesFrom(PROV, ['A Dataset Nobody Connected'])).toEqual([]);
  });

  it('gives a system a name somebody recognises, and never a blank', () => {
    expect(sourceLabel('whatsapp')).toBe('WhatsApp');
    expect(sourceLabel('folder')).toBe('Your folder of spreadsheets');
    // An unknown kind is titled rather than shown raw or dropped: a source
    // feeding real rows must appear even if this map has not heard of it.
    expect(sourceLabel('hubspot')).toBe('Hubspot');
    expect(sourceLabel('')).toBe('Unknown');
    expect(sourceLabel(undefined)).toBe('Unknown');
  });

  it('labels the sources a row can actually carry', () => {
    // The values landRows writes, so a real _source never falls through to
    // the title-case fallback.
    for (const kind of ['own', 'folder', 'whatsapp', 'chat', 'sample']) {
      expect(SOURCE_LABELS[kind], kind).toBeTruthy();
    }
  });
});
