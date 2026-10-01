/**
 * The message a lead's row generates.
 *
 * ── Why this one is a draft and not a template ─────────────────────────────
 *
 * Warm introduction sends nothing. Adding somebody mints a tracked link and
 * gives you a message to send yourself, so this copy is never checked by a
 * delivery failure the way a cold-email template is — a wrong word in it is
 * discovered by the person who reads it, if at all.
 *
 * It was rewritten from a pitch about Svarg into a pitch about the reader's
 * problem. Both the wording and the link are pinned, for different reasons:
 * the wording because it is the owner's and nothing else protects it, and the
 * link because losing the ref is an invisible failure — the message still
 * sends, and the signup it produces arrives as an anonymous guest while the
 * lead sits in Outreach looking as though they never replied.
 */
import { describe, it, expect } from 'vitest';
import { motionOf, motionSharesLink } from '../services/gtmMotions.js';

/** What the row actually puts on the clipboard, filled the way the page fills it. */
function generated(lead, link) {
  const m = motionOf(lead.motion);
  return (m?.message || []).join('\n')
    .replace(/\{\{\s*name\s*\}\}/gi, lead.name || 'there')
    .replace(/\{\{\s*company\s*\}\}/gi, lead.company || 'your team')
    .replace(/\{\{\s*link\s*\}\}/gi, link);
}

const LINK = 'https://www.svargai.com/?ref=Zm9vYmFy';
const out = generated({ motion: 'warm-intro', name: 'Dr Meera Iyer', company: 'Meera Physiotherapy' }, LINK);

describe('what a warm introduction now says', () => {
  it('opens on the reader’s problem, not on the product', () => {
    expect(out).toContain('Hi Dr Meera Iyer — I work with clinics and wellness centres on problems that quietly cost money.');
  });

  it('says what the product does, in one paragraph', () => {
    expect(out).toContain('SvargAI runs multiple AI agents on top of the data and systems you already use');
    expect(out).toContain('identify problems early');
  });

  it('gives the two examples, attributed to the centre that reported them', () => {
    /*
     * "a wellness centre in Bengaluru FOUND these" — not "we detected them".
     * The second invites "how?", and the honest answer is "they told us in an
     * interview", which is a worse sentence to have to say second.
     */
    expect(out).toContain('a wellness centre in Bengaluru found patients marked as “No Show”');
    expect(out).toContain('package entitlement without being noticed early');
    expect(out).not.toMatch(/we (found|detected)/i);
  });

  it('ends on a question and an offer, not on a pitch', () => {
    expect(out).toContain('Do you see similar problems at your centre? Happy to have a short chat.');
  });

  it('has none of the pitch it replaced', () => {
    // It asked a friend for an introduction to somebody else, which is a
    // different request from the one now being made.
    expect(out).not.toContain('transforms existing business workflows');
    expect(out).not.toContain('one good introduction');
  });
});

describe('the link', () => {
  it('is tracked, never the bare address', () => {
    expect(out).toContain(LINK);
    expect(out).not.toMatch(/Learn more: https:\/\/www\.svargai\.com\/\s*$/);
  });

  it('is the last thing in the message', () => {
    // Nothing after a link gets read on a phone.
    expect(out.trim().endsWith(LINK)).toBe(true);
  });

  it('is minted for this motion at all', () => {
    // A draft containing {{link}} on a motion that mints none would fill it
    // with the bare site address and quietly attribute nothing.
    expect(motionSharesLink('warm-intro')).toBe(true);
  });

  it('leaves no token unfilled', () => {
    expect(out).not.toMatch(/\{\{/);
  });
});

describe('the subject, for when it is sent as mail', () => {
  it('names the problem rather than the sender', () => {
    expect(motionOf('warm-intro').messageSubject).toBe('When a treated patient is recorded as a “No Show”');
  });
});

describe('a lead we know less about', () => {
  it('still produces a sendable message', () => {
    // {{name}} with nothing behind it becomes "there", not an empty greeting.
    const bare = generated({ motion: 'warm-intro' }, LINK);
    expect(bare).toContain('Hi there —');
    expect(bare).not.toMatch(/\{\{/);
    expect(bare.trim().endsWith(LINK)).toBe(true);
  });
});
