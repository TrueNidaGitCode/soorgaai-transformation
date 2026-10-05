/**
 * The first message ends in a link that attributes.
 *
 * ── The failure this guards is invisible ───────────────────────────────────
 *
 * Both outreach messages used to end "Learn more: https://www.svargai.com/".
 * That reads perfectly, sends perfectly, and attributes nothing: the ref is
 * the only thing that turns somebody who signs up into a row against the
 * conversation that produced them. Without it the signup arrives as an
 * anonymous guest and the lead sits in Outreach afterwards looking as though
 * they never replied — so the message appears to have failed when what failed
 * was the measurement.
 *
 * Nothing about sending the message would surface that, which is why the
 * token is pinned here and the filled-in result is measured in a browser by
 * scripts/check_first_message.mjs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const ui = readFileSync(new URL('../../../frontend/admin/sales.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../frontend/admin/sales.css', import.meta.url), 'utf8');

/** The clinics message, which is where the effort is going. */
const clinics = ui.slice(ui.indexOf('const FIRST_MESSAGE'), ui.indexOf("'engineering': {"));
/** Engineering, the second vertical: the same rule, its own two messages. */
const engineering = ui.slice(ui.indexOf("'engineering': {"), ui.indexOf('const ENGINEERING_FIRST'));

describe('the link is a token, not an address', () => {
  it('ends both messages with it', () => {
    expect((clinics.match(/Learn more: \{\{link\}\}/g) || []).length).toBe(2);
    expect((engineering.match(/Learn more: \{\{link\}\}/g) || []).length).toBe(2);
  });

  it('leaves no bare address behind to be sent by accident', () => {
    expect(clinics).not.toContain('Learn more: https://www.svargai.com/');
  });

  it('is filled from the lead the message is addressed to', () => {
    expect(ui).toContain("const link = lead?.inviteLink || 'https://www.svargai.com/';");
    expect(ui).toMatch(/replace\(\/\\\{\\\{\\s\*link\\s\*\\\}\\\}\/gi/);
  });

  it('falls back to the plain address rather than to nothing', () => {
    // A message you cannot read until you have picked somebody is a message
    // nobody will read. The untracked version still works; it just measures
    // nothing, and the block says so.
    expect(ui).toContain('attributes nothing');
  });
});

describe('who the message is addressed to', () => {
  it('offers only leads that actually have a link', () => {
    // A lead on a motion that mints no link would offer a chooser entry whose
    // only effect is to fill the name — and quietly send the untracked
    // address, which is the bug wearing the fix's clothes.
    expect(ui).toContain("(state.signals?.outreach || []).filter((r) => r.inviteLink)");
  });

  it('fills the bracket the subtitle tells you to fill', () => {
    expect(ui).toContain("replace(/\\[Name\\]/g, lead?.name ? esc(lead.name) : '[Name]')");
  });

  it('leaves the bracket standing when nobody is chosen, rather than blanking it', () => {
    // "Hi ," is worse than "Hi [Name]," — one is an unfinished draft and the
    // other is a message that looks finished and is not.
    expect(ui).toContain("'[Name]'");
  });
});

describe('what reaches the clipboard', () => {
  it('is decoded text, not the entities the page is written in', () => {
    /*
     * The copy holds &mdash; and &ldquo; so it reads correctly on this page.
     * Pasting those into WhatsApp sends them literally.
     */
    expect(ui).toContain('function fmPlain');
    expect(ui).toContain("box.innerHTML = String(l).replace(/<[^>]+>/g, '')");
  });

  it('takes the signature with the email and not with the short message', () => {
    expect(ui).toContain("? [...fmFill(o.email, lead), '', ...fmFill(o.sign, lead)]");
    expect(ui).toContain(': fmFill(o.short, lead);');
  });

  it('says so plainly when the browser refuses the clipboard', () => {
    expect(ui).toContain('The browser refused the clipboard.');
  });
});

describe('the message itself', () => {
  it('still says what it was written to say', () => {
    for (const phrase of [
      'clinics and wellness centres',
      'multiple AI agents',
      'No Show',
      'package',
      'Do you see similar problems at your centre?',
    ]) expect(clinics).toContain(phrase);
  });

  it('keeps the attribution right — the centre found these, not us', () => {
    // The one correction the draft needed: "we found" invites "how?", and the
    // answer is "they told us in an interview".
    expect(clinics).toContain('a wellness centre in Bengaluru found');
    expect(clinics).not.toContain('we found examples such as');
  });
});

describe('the picker is a real control', () => {
  it('is styled rather than a bare browser select', () => {
    expect(css).toContain('.sg-fm__who select');
    expect(css).toContain('.sg-fm__copy');
  });
});
