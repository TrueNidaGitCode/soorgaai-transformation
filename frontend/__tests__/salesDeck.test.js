/**
 * The presentation: the finalised clinic proposal.
 *
 * ── Who it is written for ──────────────────────────────────────────────────
 *
 * A clinic owner, manager or admin lead, reading it in their inbox with
 * nobody there to explain it. Seven slides, opening on a cover rather than a
 * problem, each stating its point in one line before it shows anything.
 *
 * ── What this file protects ────────────────────────────────────────────────
 *
 * THE WORDS. A reader who knows nothing about software has to finish it
 * understanding the product, so every term of art that creeps back in —
 * dataset, column, row, model, pipeline, webhook — is asserted absent rather
 * than discouraged in a comment.
 *
 * THE ONE FIGURE. Everything else here is prose and is meant to be, but the
 * count on slide 2 is counted from the running product, and every check named
 * beside it is looked up in the live catalogue before it is drawn. A deck that
 * names a check the product does not have is worse than a deck with no
 * examples.
 *
 * THE WARNING THAT LEFT THE DECK. The approved version drops the "Coming
 * next" panel and the sentence "no message is ever sent to a patient
 * automatically". Both were doing work, and the deck is the customer's to
 * decide. So what they said now lives on the Presentation card, which is read
 * by the person selling rather than the person buying — and this file makes
 * sure it stays there.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/sales.js');
const css = read('../admin/sales.css');
const html = read('../admin/sales.html');

/** The deck's own block, so a match elsewhere in the file cannot pass for it. */
const deck = js.slice(js.indexOf('/* ── The presentation'), js.indexOf('/*\n * Pitches, by industry.'));

/** The prose a reader actually sees, without the comments that explain it. */
const slides = deck.slice(deck.indexOf('const CLINIC_WATCHERS = ['), deck.indexOf('function deckHub'));

/** The card above the deck, which the seller reads and the customer never does. */
const card = js.slice(js.indexOf('sg-fm__msg--deck'), js.indexOf('href="#sg-deck"'));

describe('the three things that leave this page', () => {
  it('still sends an email and a short message', () => {
    expect(js).toContain('<p class="sg-fm__kind">Email</p>');
    expect(js).toContain('<p class="sg-fm__kind">WhatsApp or LinkedIn</p>');
  });

  it('now also has the presentation, beside them', () => {
    expect(js).toContain('<p class="sg-fm__kind">Presentation</p>');
    expect(js).toContain('href="#sg-deck"');
    expect(js).toContain('<div id="sg-deck"></div>');
  });
});

describe('seven slides, as approved', () => {
  it('opens on a cover and runs to pricing', () => {
    expect([...deck.matchAll(/n: '(\d\d)'/g)].map((m) => m[1]))
      .toEqual(['00', '01', '02', '03', '04', '05', '06']);
  });

  it('labels them in the order the reader asks the questions', () => {
    expect([...deck.matchAll(/kicker: '([^']+)'/g)].map((m) => m[1])).toEqual([
      'Sales proposal', 'The problem', 'What it does', 'What you see',
      'How it works', 'Privacy and control', 'Pricing',
    ]);
  });

  it('opens on the sentence the whole deck is named after', () => {
    expect(deck).toContain('Your Clinic Has All the Information.');
    expect(deck).toContain('Nobody Sees the Full Picture.');
    expect(deck).toContain('No new software to learn. No workflows to replace.');
  });

  it('draws the five systems on the cover, meeting in one place', () => {
    expect(deck).toContain("hub: ['CRM', 'Calendar', 'Phone', 'Staff', 'Payments']");
    // Described for a reader who cannot see it.
    expect(deck).toContain('meeting in one place');
  });

  it('ends on one ask and where to find us', () => {
    expect(deck).toContain('Want to see what SvargAI can find in your clinic?');
    expect(deck).toContain('svargai.com');
  });
});

describe('one patient, carried through the deck', () => {
  it('tells the story on the problem slide in the order it happened', () => {
    const one = deck.slice(deck.indexOf("n: '01'"), deck.indexOf("n: '02'"));
    expect([...one.matchAll(/\['(CRM|Phone|Staff)', '([^']*)/g)].map((m) => `${m[1]}: ${m[2]}`)).toEqual([
      'CRM: Patient books an appointment.',
      'CRM: Appointment marked No Show.',
      'Phone: Patient calls and asks about a treatment package.',
      // Curly quotes, so the capture runs to the end of the sentence.
      'Staff: “I’ll check and get back to you.”',
      'CRM: No follow-up recorded.',
    ]);
  });

  it('keeps the story to a CRM and a phone', () => {
    // WhatsApp is a connector, not part of this story, and a third system is
    // a third thing to explain before the point lands.
    const one = deck.slice(deck.indexOf("n: '01'"), deck.indexOf("n: '02'"));
    expect(one).not.toMatch(/WhatsApp/i);
  });

  it('marks the one line where something went wrong, twice, in one colour', () => {
    // The missing follow-up, on the problem slide and again on the finding.
    expect(deck).toContain("['CRM', 'No follow-up recorded.', true]");
    expect(deck).toContain("['CRM', 'No follow-up recorded', true]");
    expect(css).toContain('.sg-deck__steps li.is-bad .sg-deck__chev');
    expect(css).toContain('.sg-deck__what li.is-bad span, .sg-deck__what li.is-bad b');
  });

  it('pays the story off with the same patient and the evidence', () => {
    const three = deck.slice(deck.indexOf("n: '03'"), deck.indexOf("n: '04'"));
    expect(three).toContain('Rahul Sharma');
    expect(three).toContain('Needs follow-up');
    expect(three).toContain('evidence: [');
    expect(deck).toContain('The evidence behind it');
    expect(three).toContain('SvargAI shows exactly why each item was raised.');
  });
});

describe('what it says it watches', () => {
  it('names them in four groups a clinic recognises', () => {
    expect([...deck.matchAll(/group: '([^']+)'/g)].map((m) => m[1]))
      .toEqual(['Patients', 'Appointments', 'Payments', 'Follow-ups']);
  });

  it('shows two in each, because a slide is taken in at a glance', () => {
    const block = deck.slice(deck.indexOf('const CLINIC_WATCHERS'), deck.indexOf('const DECK = ['));
    for (const g of block.split('group:').slice(1)) {
      expect((g.match(/\['[a-z-]+', '/g) || []).length).toBe(2);
    }
  });

  it('checks every one against the live catalogue before drawing it', () => {
    expect(deck).toContain('g.items.filter(([id]) => !f || known.has(id))');
    for (const id of ['no-show', 'promise-overdue', 'gone-quiet', 'overdue-invoice']) {
      expect(deck).toContain(`'${id}'`);
    }
  });

  it('reads the count rather than printing one', () => {
    expect(deck).toContain('f.watchers.total');
    expect(deck).toContain("api('/deck')");
    expect(slides).not.toMatch(/\b36\b/);
  });

  it('draws the deck even when the count has not arrived', () => {
    expect(deck).toContain('.catch(() => { renderDeck(); })');
  });
});

describe('the words a clinic owner should never have to read', () => {
  it('uses none of them', () => {
    for (const word of [
      'dataset', 'column', 'schema', 'pipeline', 'webhook', 'API',
      'orchestration', 'machine learning', 'autonomous', 'LLM',
    ]) {
      expect(slides.toLowerCase(), word).not.toContain(word.toLowerCase());
    }
  });

  it('says what happened, not what a field was set to', () => {
    expect(slides).toContain('Patient did not turn up');
    expect(slides).not.toContain('status changed to');
  });

  it('says who decides', () => {
    expect(deck).toContain('Your Team Decides');
    expect(deck).toContain('Your team makes the final call.');
    expect(deck).toContain('Your team decides what happens next.');
  });
});

/**
 * The customer's deck is the customer's to decide. What it stopped saying
 * has to keep being said to the person selling it, or the only place the
 * qualification existed is gone.
 */
describe('what the deck stopped saying, and where it went', () => {
  it('warns the seller that the finding card is more than one finding today', () => {
    expect(card).toContain('Promise Not Kept joins the call to the CRM');
    expect(card).toContain('still being built');
    expect(card).toContain('do not describe it as one row on the board today');
  });

  it('keeps the strongest privacy claim alive for the room', () => {
    // Structural and checkable: the application holds no mail credentials.
    expect(card).toContain('No message is ever sent to a patient automatically');
    expect(card).toContain('holds no mail');
  });

  it('never states the unbuilt joining as something it does today', () => {
    expect(slides).not.toMatch(/SvargAI connects related findings/);
    expect(slides).not.toMatch(/connects the signals/i);
  });
});

describe('pricing, as the pricing page states it', () => {
  it('carries all four plans, with Pro marked', () => {
    for (const p of ['Hobby', 'Pro', 'Ultra', 'Enterprise']) expect(deck).toContain(`'${p}'`);
    expect(deck).toContain("'a month', true,");
  });

  it('quotes the figures the pricing page quotes', () => {
    const page = read('../pricing/pricing.html');
    for (const amount of ['2,999', '28,999', '16,999', '1,63,999']) {
      expect(deck, amount).toContain(amount);
      expect(page, amount).toContain(amount);
    }
    expect(deck).toContain('₹');
  });

  it('lines the four cards up, because a reader compares them across', () => {
    // Two plans have no billing period and two have no annual line; without
    // these, four related things read as four unrelated boxes.
    expect(css).toMatch(/\.sg-deck__price \{[^}]*min-height/);
    expect(css).toMatch(/\.sg-deck__pwho \{[^}]*min-height/);
    expect(css).toMatch(/\.sg-deck__year \{[^}]*min-height/);
  });
});

describe('the page serves it', () => {
  it('bumps the cache-busting version, or nobody sees any of this', () => {
    expect(Number((html.match(/sales\.js\?v=(\d+)/) || [])[1])).toBeGreaterThanOrEqual(54);
    expect(Number((html.match(/sales\.css\?v=(\d+)/) || [])[1])).toBeGreaterThanOrEqual(46);
  });

  it('draws its own marks rather than reaching for pictures', () => {
    // Line drawings, inline. No stock imagery, no robots, nothing decorative.
    expect(deck).toContain('const RING_ICON = {');
    expect(deck).not.toMatch(/<img|background-image|\.png|\.jpg/);
  });
});
