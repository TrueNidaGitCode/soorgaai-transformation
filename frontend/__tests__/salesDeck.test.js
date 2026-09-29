/**
 * The presentation: the third thing that leaves this page, and the only one
 * that leaves it alone.
 *
 * ── Who it is written for ──────────────────────────────────────────────────
 *
 * A clinic owner, manager or admin lead, reading it in their inbox with
 * nobody there to explain it. That is a different reader from the one in the
 * room, and it decides everything: six slides in the order they would ask the
 * questions, plain business words, and one story — a patient who did not turn
 * up, rang about a package, was promised a call back and never got one —
 * carried from the first slide to the third so the deck holds together.
 *
 * ── What this file protects ────────────────────────────────────────────────
 *
 * Two things a renderer cannot.
 *
 * THE WORDS. A reader who knows nothing about software has to finish it
 * understanding the product. Every term of art that creeps back in — dataset,
 * column, row, model, pipeline, webhook — costs a reader rather than earning
 * one, so they are asserted absent rather than discouraged in a comment.
 *
 * THE ONE FUTURE-TENSE CLAIM. Reading a No Show and a phone call as one
 * patient needing attention is not built: each check finds its own thing and
 * the briefing lists them separately. Slide 4 says SvargAI *will* do it, under
 * "Coming next". Future tense is the whole safeguard, and a tense is exactly
 * the kind of thing an edit slips.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const js = read('../admin/sales.js');
const css = read('../admin/sales.css');
const html = read('../admin/sales.html');

/** The deck's own block, so a match elsewhere in the file cannot pass for it. */
const deck = js.slice(js.indexOf('/* ── The presentation'), js.indexOf('/*\n * Pitches, by industry.'));

/**
 * The prose the reader actually sees.
 *
 * From the watcher names through the last slide, so it covers everything
 * printed and none of the comments that explain it — several of which quote
 * the very words the slides must not use, in order to forbid them.
 */
const slides = deck.slice(deck.indexOf('const CLINIC_WATCHERS = ['), deck.indexOf('function deckWatchers'));

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

describe('six slides, in the order a clinic owner asks the questions', () => {
  it('has exactly six, numbered in order', () => {
    expect([...deck.matchAll(/n: '(\d\d)'/g)].map((m) => m[1]))
      .toEqual(['01', '02', '03', '04', '05', '06']);
  });

  it('asks them in the order somebody reading alone would', () => {
    // Is this my problem, what does it do, what would I see, how does it
    // work, what happens to my records, what does it cost.
    expect([...deck.matchAll(/kicker: '([^']+)'/g)].map((m) => m[1])).toEqual([
      'The problem', 'What it does', 'What you see',
      'How it works', 'Privacy and control', 'Pricing',
    ]);
  });

  it('opens on the sentence the reader has to recognise', () => {
    expect(deck).toContain('Your clinic already has the information. It is just spread across different places.');
    expect(deck).toContain('The clinic has all the information. But nobody sees the full picture.');
  });

  it('ends on one ask and where to find us', () => {
    expect(deck).toContain('Show us where your clinic loses the signal.');
    expect(deck).toContain('www.svargai.com');
  });
});

describe('one patient, carried through the deck', () => {
  it('tells the story on slide 1 in the order it happened', () => {
    const one = deck.slice(deck.indexOf("n: '01'"), deck.indexOf("n: '02'"));
    const said = [...one.matchAll(/\['(CRM|Phone|Staff)', '([^']*)/g)].map((m) => `${m[1]}: ${m[2]}`);
    expect(said).toEqual([
      'CRM: Patient books an appointment.',
      'CRM: Appointment marked No Show.',
      'Phone: Patient calls and asks about a treatment package.',
      // The staff line is in curly quotes, so it runs to the end of the match.
      'Staff: “I’ll check and get back to you.”',
      'CRM: No follow-up recorded.',
    ]);
  });

  it('keeps the first demonstration to a CRM and a phone', () => {
    // WhatsApp is a connector, not part of this story, and a third system in
    // the example is a third thing to explain before the point lands.
    const one = deck.slice(deck.indexOf("n: '01'"), deck.indexOf("n: '02'"));
    expect(one).not.toMatch(/WhatsApp/i);
  });

  it('pays the story off on slide 3 with the same patient', () => {
    const three = deck.slice(deck.indexOf("n: '03'"), deck.indexOf("n: '04'"));
    expect(three).toContain('Rahul Sharma');
    expect(three).toContain('Needs follow-up');
    expect(three).toContain('Call Rahul back about the package he asked about.');
  });

  it('shows the evidence, which is the point of the slide', () => {
    const three = deck.slice(deck.indexOf("n: '03'"), deck.indexOf("n: '04'"));
    expect(three).toContain('evidence: [');
    expect(deck).toContain('The evidence behind it');
    expect(three).toContain('It shows you why it raised it');
  });
});

describe('what it says it watches', () => {
  it('names them in four groups a clinic recognises', () => {
    expect([...deck.matchAll(/group: '([^']+)'/g)].map((m) => m[1]))
      .toEqual(['Patients', 'Appointments', 'Payments', 'Follow-ups']);
  });

  it('explains the word "watchers" the first time it uses it', () => {
    expect(deck).toContain('Watchers are small checks that look for specific situations');
  });

  it('checks every one against the live catalogue before drawing it', () => {
    /*
     * The deck must not name a check the product does not have. Each entry
     * carries the catalogue id it corresponds to, and an id the catalogue has
     * dropped is filtered out rather than printed.
     */
    expect(deck).toContain("g.items.filter(([id]) => !f || known.has(id))");
    for (const id of ['no-show', 'promise-overdue', 'gone-quiet', 'overdue-invoice']) {
      expect(deck).toContain(`'${id}'`);
    }
  });

  it('puts the counts under the examples, not over them', () => {
    // A clinic owner does not buy thirty-six of anything. The number is there
    // to be checked, not to persuade, so it is small and it comes last.
    const two = deck.slice(deck.indexOf("n: '02'"), deck.indexOf("n: '03'"));
    expect(two).not.toMatch(/\b36\b|\bwatchers in the catalogue\b/);
    expect(deck).toContain('sg-deck__quiet');
    expect(deck).toContain('checks like these are available today');
  });

  it('still reads those counts rather than hard-coding them', () => {
    expect(deck).toContain('f.watchers.total');
    expect(deck).toContain('f.connectors.total');
    expect(deck).toContain("api('/deck')");
  });

  it('draws the deck even when the counts have not arrived', () => {
    expect(deck).toContain('.catch(() => { renderDeck(); })');
  });
});

describe('the one claim that is not yet true', () => {
  it('is future tense, under "Coming next"', () => {
    expect(deck).toContain('Coming next');
    expect(deck).toMatch(/SvargAI will connect related findings across your systems/);
  });

  it('is never stated as something it does today', () => {
    expect(deck).not.toMatch(/SvargAI connects related findings/);
    expect(deck).not.toMatch(/connects the signals/i);
  });

  it('is said plainly to the seller on the card, where the reader is not the buyer', () => {
    /*
     * The deck is customer-facing and future tense is enough there. The card
     * above it is read by the person selling, who needs the blunt version.
     */
    const card = js.slice(js.indexOf('sg-fm__msg--deck'), js.indexOf('href="#sg-deck"'));
    expect(card).toContain('it is not built');
    expect(card).toContain('Do not say it in the present tense in a room');
  });

  it('claims drafting, which is built, and never sending', () => {
    expect(deck).toContain('SvargAI can draft the follow-up message for you');
    expect(deck).toContain('A person reads it and decides');
    expect(deck).toContain('No message is ever sent to a patient automatically.');
  });
});

describe('the words a clinic owner should never have to read', () => {
  it('uses none of them', () => {
    for (const word of [
      'dataset', 'column', 'schema', 'pipeline', 'webhook', 'API',
      'orchestration', 'machine learning', 'autonomous', 'LLM', 'model',
    ]) {
      expect(slides.toLowerCase(), word).not.toContain(word.toLowerCase());
    }
  });

  it('says what happened, not what a field was set to', () => {
    // Against the slides, not the whole block: the comment above them quotes
    // the phrase in order to forbid it.
    expect(slides).toContain('Patient did not turn up');
    expect(slides).not.toContain('status changed to');
  });

  it('says who decides, in words, twice', () => {
    expect(deck).toContain('Your team decides what to do next');
    expect(deck).toContain('Your team decides what happens next');
  });
});

describe('pricing, as the pricing page states it', () => {
  it('carries all four plans', () => {
    for (const p of ['Hobby', 'Pro', 'Ultra', 'Enterprise']) expect(deck).toContain(`'${p}'`);
  });

  it('quotes the prices the pricing page quotes', () => {
    // The deck carries the rupee sign itself; the pricing page writes it as
    // an HTML entity, so only the figures can be compared across the two.
    const page = read('../pricing/pricing.html');
    for (const amount of ['2,999', '28,999', '16,999', '1,63,999']) {
      expect(deck, amount).toContain(amount);
      expect(page, amount).toContain(amount);
    }
    expect(deck).toContain('₹');
  });

  it('describes each plan by what a clinic gets, not by a tier name', () => {
    expect(deck).toContain('For watching a small part of the clinic.');
    expect(deck).toContain('For keeping core clinic operations under continuous watch.');
  });

  it('lines the four cards up, because a reader compares them across', () => {
    // A feature list starting at a different height in each card makes four
    // related things read as four unrelated boxes.
    expect(css).toContain('.sg-deck__price {');
    expect(css).toMatch(/\.sg-deck__price \{[^}]*min-height/);
    expect(css).toMatch(/\.sg-deck__pwho \{[^}]*min-height/);
  });
});

describe('the page serves it', () => {
  it('bumps the cache-busting version, or nobody sees any of this', () => {
    expect(Number((html.match(/sales\.js\?v=(\d+)/) || [])[1])).toBeGreaterThanOrEqual(53);
    expect(Number((html.match(/sales\.css\?v=(\d+)/) || [])[1])).toBeGreaterThanOrEqual(45);
  });

  it('keeps the one accent that means something', () => {
    // Orange marks the single line in the whole deck where something went
    // wrong — the missing follow-up — and the finding's own status. Nothing
    // else uses it, so it means one thing.
    expect(css).toContain('.sg-deck__case li.is-bad b { color: #E8834A; font-weight: 600; }');
  });
});
