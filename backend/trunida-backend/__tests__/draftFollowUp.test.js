/**
 * The follow-up: written by a model, believed only because of where the facts came from.
 *
 * ── Why this file is careful ───────────────────────────────────────────────
 *
 * Everywhere else in this product the model plans and narrates while code
 * counts, joins and decides. Drafting is the first place a model writes prose
 * that goes to a customer's customer — over the customer's name, not ours. A
 * follow-up containing an invented date or a wrong number is worse than no
 * follow-up at all, because somebody sends it.
 *
 * So the rule is narrow and testable: the model is handed a closed list of
 * facts taken from the finding's stored evidence — which was computed in code
 * and validated before it was written down — and told it may not add another.
 * These tests hold the facts list to exactly that, and hold the prompt to
 * saying so.
 *
 * ── And it does not send ───────────────────────────────────────────────────
 *
 * Nothing in a delivered application can reach a third party, by design: it
 * holds no mail credentials and no provider key. Drafting deliberately stops
 * short of an egress path rather than quietly opening one.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { factsFor } from '../eame-template/services/draftService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const svc = read('../eame-template/services/draftService.js');

const finding = (over = {}) => ({
  key: 'STU-0182',
  title: 'Aarav Sharma',
  agentName: 'Stopped Coming',
  firstSeenAt: new Date(Date.now() - 6 * 86400000),
  evidence: {
    dataset: 'Daily Session Roll Call Logs',
    columns: ['Student Name', 'Session Date'],
    window: '14 days to 22 Sep 2026',
    rule: 'no session date in the last 14 days',
    records: 31,
    entities: 12,
    rows: 2,
    lines: [['Aarav Sharma', '05 Sep 2026'], ['Aarav Sharma', '02 Sep 2026']],
  },
  ...over,
});

describe('the facts handed to the model', () => {
  it('carries what the finding actually established', () => {
    const lines = factsFor(finding()).join('\n');
    expect(lines).toContain('Aarav Sharma');
    expect(lines).toContain('no session date in the last 14 days');
    expect(lines).toContain('14 days to 22 Sep 2026');
    expect(lines).toContain('Daily Session Roll Call Logs');
  });

  it('includes the customer\'s own rows, so the message can be specific', () => {
    const lines = factsFor(finding());
    expect(lines.some(l => l.includes('05 Sep 2026'))).toBe(true);
  });

  it('caps the rows, because a draft is not a data export', () => {
    const many = Array.from({ length: 20 }, (_, i) => ['Aarav Sharma', 'day ' + i]);
    const records = factsFor(finding({ evidence: { ...finding().evidence, lines: many } }))
      .filter(l => l.startsWith('Record:'));
    expect(records).toHaveLength(6);
  });

  it('states how long it has been open, computed here rather than guessed there', () => {
    // A model asked "how long has this been going on" would answer. This is
    // arithmetic on a stored date, so it is done in code.
    expect(factsFor(finding()).join('\n')).toMatch(/Open for: 6 days/);
  });

  it('adds nothing when the finding carries no evidence', () => {
    /*
     * An old finding, stored before evidence was kept. It must produce a thin
     * fact list rather than a confident invented one — and the service refuses
     * outright rather than asking the model to fill the gap.
     */
    const lines = factsFor({ key: 'x', title: 'Someone' });
    expect(lines).toHaveLength(1);
    expect(svc).toContain('This finding has no evidence stored yet');
  });

  it('survives a finding that is barely there', () => {
    expect(() => factsFor(null)).not.toThrow();
    expect(() => factsFor({})).not.toThrow();
  });
});

describe('what the prompt forbids', () => {
  it('tells the model it may not introduce a fact', () => {
    // The single instruction the whole feature rests on.
    expect(svc).toMatch(/Do not state any number, date, name or detail that is not in the FACTS/);
  });

  it('tells it to ask rather than assume when the facts are thin', () => {
    expect(svc).toMatch(/too thin[\s\S]*asks rather than assumes/i);
  });

  it('forbids inventing a reason, a promise or an offer', () => {
    // "We are sorry you have been unwell" is a diagnosis. The finding says
    // somebody stopped attending; it never says why.
    expect(svc).toMatch(/claim to know why something happened/);
  });
});

describe('it drafts and does not send', () => {
  it('has no outbound path of its own', () => {
    for (const forbidden of ['nodemailer', 'sendMail', 'graph.facebook', 'twilio', 'SMTP']) {
      expect(svc, forbidden).not.toContain(forbidden);
    }
  });

  it('is reachable without being the owner, because it delivers nothing', () => {
    const routes = read('../eame-template/routes/agentsRoutes.js');
    const line = routes.split('\n').find(l => l.includes("'/findings/:id/draft'"));
    expect(line).toBeTruthy();
    expect(line).toContain('protect');
    expect(line).not.toContain('ownerOnly');
  });

  it('says on the screen that nothing is sent', () => {
    // The promise has to be visible where the draft is, not only in a comment.
    expect(read('../eame-template/frontend/index.html'))
      .toContain('Svarg never sends this. You decide who receives it.');
  });

  it('ships to a customer\'s repository', async () => {
    /*
     * The trap this catches has bitten twice: a new template file included in
     * the manifest but absent from the fixed-path list reaches nobody, and the
     * application it belongs to fails to boot.
     */
    const { buildManifest } = await import('../services/eameProjectBuilder.js');
    const paths = buildManifest({ appName: 'Probe' }).map(f => f.path);
    for (const p of ['services/draftService.js', 'frontend/findings.js']) {
      expect(paths, p).toContain(p);
    }
  });
});
