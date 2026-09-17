/**
 * The rules that keep Svarg able to send email at all.
 *
 * outreachService is 840 lines that put mail in a stranger's inbox, and it had
 * no tests. Everything else Svarg does is recoverable: a bad blueprint is
 * regenerated, a crashed application is redeployed. A sending domain that gets
 * blocked for emailing people who asked to be left alone takes sign-in codes
 * down with it, for every customer, and is not undone by a fix.
 *
 * Two of these rules were already broken once each, in production:
 *
 *   - the per-row "Send now" button skipped the organisation-paragraph check,
 *     and the first real cold email went out entirely generic;
 *   - the weekly gap sat inside the ignoreSchedule branch, so six clicks of
 *     that button would have sent a stranger six emails in an afternoon.
 *
 * Both were found by reading. These tests are what should have found them.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

// ── The world outreachService talks to ───────────────────────────────────────

const sent = [];
const sendOutreachEmail = vi.fn(async (msg) => { sent.push(msg); });
vi.mock('../services/mailService.js', () => ({ sendOutreachEmail }));

let signedUpEmails = new Set();
vi.mock('../models/user.js', () => ({
  User: { exists: async ({ email }) => (signedUpEmails.has(email) ? { _id: 'u1' } : null) },
}));

vi.mock('../services/llmService.js', () => ({ generate: vi.fn() }));
vi.mock('../services/websiteService.js', () => ({ readCompanySite: vi.fn() }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) } }));
vi.mock('../services/blueprintUseCase.js', () => ({ resolveUseCase: vi.fn() }));
vi.mock('../models/OutreachTemplate.js', () => ({ default: { findOne: async () => null } }));

/** One lead, in memory, behaving the way a Mongoose document does. */
let store = new Map();
function makeLead(over = {}) {
  const lead = {
    _id: over._id || 'lead1',
    name: 'Priya',
    email: 'priya@example.com',
    company: 'Vesoma',
    motion: 'cold-email',
    status: 'to-contact',
    unsubscribedAt: null,
    unsubscribeToken: 'tok-1',
    refCode: 'r1',
    orgContext: 'They coach 300 swimmers across two pools.',
    sends: [],
    ...over,
    sequence: {
      subject: 'A question about {{company}}',
      body: 'Hi {{name}},\n\n{{context}}\n\nHave a look: {{link}}',
      enabled: true,
      sentCount: 0,
      lastSentAt: null,
      nextSendAt: new Date(Date.now() - 1000),
      intervalDays: 7,
      maxSends: 6,
      stoppedReason: '',
      ...(over.sequence || {}),
    },
  };
  lead.save = async () => { store.set(String(lead._id), lead); return lead; };
  lead.toObject = () => ({ ...lead });
  store.set(String(lead._id), lead);
  return lead;
}

vi.mock('../models/ColdLead.js', () => ({
  default: {
    findById: async (id) => store.get(String(id)) || null,
    find: () => ({
      select: () => ({
        limit: () => ({ lean: async () => [...store.values()]
          .filter(l => l.sequence.enabled && l.sequence.nextSendAt && l.sequence.nextSendAt <= new Date() && !l.unsubscribedAt)
          .map(l => ({ _id: l._id })) }),
      }),
    }),
    // Returns a thenable that also answers .lean(), because one caller awaits
    // it directly and the other chains — which is how Mongoose queries behave.
    findOneAndUpdate: (filter, update, opts = {}) => {
      const run = async () => {
        const lead = filter._id ? store.get(String(filter._id))
          : [...store.values()].find(l => l.unsubscribeToken === filter.unsubscribeToken);
        if (!lead) return null;
        // The sweep's claim: only take it if it is still due.
        if (filter['sequence.nextSendAt'] && !(lead.sequence.nextSendAt && lead.sequence.nextSendAt <= new Date())) return null;
        const before = JSON.parse(JSON.stringify({ ...lead, save: undefined, toObject: undefined }));
        for (const [k, v] of Object.entries(update.$set || {})) {
          if (k.startsWith('sequence.')) lead.sequence[k.slice(9)] = v;
          else lead[k] = v;
        }
        return opts.new ? lead : before;
      };
      const p = run();
      return { then: p.then.bind(p), catch: p.catch.bind(p), lean: () => p };
    },
  },
}));

const S = '../services/outreachService.js';
let svc;

let saved;
beforeEach(async () => {
  vi.resetModules();
  saved = { ...process.env };
  process.env.PUBLIC_API_URL = 'https://api.svarg.test';
  process.env.FRONTEND_URL = 'https://www.svargai.com';
  sent.length = 0;
  sendOutreachEmail.mockClear();
  sendOutreachEmail.mockImplementation(async (msg) => { sent.push(msg); });
  store = new Map();
  signedUpEmails = new Set();
  svc = await import(S);
});
afterEach(() => { process.env = saved; });

// ── Who must never be emailed ────────────────────────────────────────────────

describe('people Svarg must not email', () => {
  it('will not email somebody who unsubscribed', async () => {
    const lead = makeLead({ unsubscribedAt: new Date() });
    const v = await svc.canSend(lead);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/unsubscribed/i);
  });

  it('will not email somebody who replied — a conversation is not a sequence', async () => {
    const v = await svc.canSend(makeLead({ status: 'replied' }));
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/replied/i);
  });

  it('will not email a lead marked dead', async () => {
    expect((await svc.canSend(makeLead({ status: 'dead' }))).ok).toBe(false);
  });

  it('will not email somebody who has since signed up', async () => {
    // Asked live rather than read off the lead's status, so a signup five
    // minutes ago still stops the next follow-up.
    signedUpEmails.add('priya@example.com');
    const v = await svc.canSend(makeLead());
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/signed up/i);
  });

  it('matches a signup case-insensitively, since addresses are not case-sensitive', async () => {
    signedUpEmails.add('priya@example.com');
    expect((await svc.canSend(makeLead({ email: 'PRIYA@Example.com' }))).ok).toBe(false);
  });

  it('will not email a lane that does not send — a warm intro is not a sequence', async () => {
    // Checked here, not on the screen: the sweep does not go through the
    // screen, and re-filing a lead must stop the machinery at once.
    for (const motion of ['warm-intro', 'walk-in', 'referral']) {
      const v = await svc.canSend(makeLead({ motion }));
      expect(v.ok, motion).toBe(false);
      expect(v.reason).toMatch(/never sends automatically/i);
    }
  });

  it('will not email a lead that has only a phone number', async () => {
    const v = await svc.canSend(makeLead({ email: '' }));
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/no email address/i);
  });
});

// ── The limits that protect the sending domain ───────────────────────────────

describe('the limits, by every route', () => {
  it('holds the weekly gap even for a manual send', async () => {
    /*
     * This is the one that was broken. The gap sat inside the ignoreSchedule
     * branch, so "Send now" skipped it — and six clicks in an afternoon would
     * have sent a stranger six emails in an afternoon, by the easiest action
     * on the screen. Manual may ignore the SCHEDULE. Never this.
     */
    const lead = makeLead({ sequence: { lastSentAt: new Date(Date.now() - 2 * 86400000) } });
    for (const manual of [false, true]) {
      const v = await svc.canSend(lead, { ignoreSchedule: manual });
      expect(v.ok, `manual=${manual}`).toBe(false);
      expect(v.reason).toMatch(/one a week/i);
    }
  });

  it('allows the send once a full week has passed', async () => {
    const lead = makeLead({ sequence: { lastSentAt: new Date(Date.now() - 8 * 86400000) } });
    expect((await svc.canSend(lead)).ok).toBe(true);
  });

  it('stops at six emails however high maxSends is set', async () => {
    const lead = makeLead({ sequence: { sentCount: 6, maxSends: 99 } });
    const v = await svc.canSend(lead);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/already sent/);
  });

  it('refuses a follow-up interval under a week, whatever the request says', async () => {
    makeLead();
    await expect(svc.setSequence('lead1', { intervalDays: 2 })).rejects.toThrow(/at least 7 days/i);
    await expect(svc.setSequence('lead1', { maxSends: 20 })).rejects.toThrow(/At most 6/);
    // Slower is always allowed.
    const out = await svc.setSequence('lead1', { intervalDays: 30 });
    expect(out.sequence.intervalDays).toBe(30);
  });

  it('refuses to restart a sequence for somebody who unsubscribed', async () => {
    makeLead({ unsubscribedAt: new Date() });
    await expect(svc.setSequence('lead1', { enabled: true })).rejects.toThrow(/unsubscribed/i);
  });
});

// ── Nothing goes out half-written ────────────────────────────────────────────

describe('what an email must have before it leaves', () => {
  it('refuses to send when no unsubscribe link can be built', async () => {
    // Cold email with a decorative opt-out is how a sending domain is lost.
    delete process.env.PUBLIC_API_URL;
    delete process.env.BACKEND_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    delete process.env.RAILWAY_STATIC_URL;
    vi.resetModules();
    const fresh = await import(S);
    const v = await fresh.canSend(makeLead());
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/unsubscribe link/i);
  });

  it('refuses a body that asks for the organisation paragraph and has none', async () => {
    // The manual button skipped this once, and the first real cold email went
    // out entirely generic.
    const lead = makeLead({ orgContext: '   ' });
    for (const manual of [false, true]) {
      const v = await svc.canSend(lead, { ignoreSchedule: manual });
      expect(v.ok, `manual=${manual}`).toBe(false);
      expect(v.reason).toMatch(/entirely generic/);
    }
  });

  it('leaves a body alone that never asks for the paragraph', async () => {
    const lead = makeLead({ orgContext: '', sequence: { body: 'Hi {{name}}, a quick note.' } });
    expect((await svc.canSend(lead)).ok).toBe(true);
  });

  it('refuses a sequence with no subject or no message', async () => {
    expect((await svc.canSend(makeLead({ sequence: { subject: '' } }))).ok).toBe(false);
    expect((await svc.canSend(makeLead({ _id: 'l2', sequence: { body: '' } }))).ok).toBe(false);
  });
});

// ── Sending ──────────────────────────────────────────────────────────────────

describe('sending one email', () => {
  it('puts the unsubscribe link in both the text and the HTML', async () => {
    makeLead();
    const r = await svc.sendNext('lead1', { manual: true });
    expect(r.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('https://api.svarg.test/api/outreach/unsubscribe?token=tok-1');
    expect(sent[0].html).toContain('Unsubscribe');
  });

  it('fills the tokens, and leaves none of them showing', async () => {
    makeLead();
    await svc.sendNext('lead1', { manual: true });
    expect(sent[0].subject).toBe('A question about Vesoma');
    expect(sent[0].text).toContain('Hi Priya,');
    expect(sent[0].text).toContain('300 swimmers');
    expect(sent[0].text).toContain('https://www.svargai.com/?ref=r1');
    expect(sent[0].text).not.toMatch(/\{\{/);
  });

  it('escapes the body in the HTML part, so a stray angle bracket is not markup', async () => {
    makeLead({ name: 'Priya <script>alert(1)</script>' });
    await svc.sendNext('lead1', { manual: true });
    expect(sent[0].html).not.toContain('<script>');
    expect(sent[0].html).toContain('&lt;script&gt;');
  });

  it('counts the send, schedules the next, and marks the lead contacted', async () => {
    const lead = makeLead();
    await svc.sendNext('lead1', { manual: true });
    expect(lead.sequence.sentCount).toBe(1);
    expect(lead.status).toBe('contacted');
    expect(lead.sequence.nextSendAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
  });

  it('never schedules the next one sooner than a week, even if the lead says 1 day', async () => {
    const lead = makeLead({ sequence: { intervalDays: 1 } });
    await svc.sendNext('lead1', { manual: true });
    expect(lead.sequence.nextSendAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86400000);
  });

  it('closes the sequence when the last of the six goes out', async () => {
    const lead = makeLead({ sequence: { sentCount: 5, maxSends: 6, lastSentAt: null } });
    await svc.sendNext('lead1', { manual: true });
    expect(lead.sequence.enabled).toBe(false);
    expect(lead.sequence.nextSendAt).toBeNull();
    expect(lead.sequence.stoppedReason).toMatch(/All 6 emails sent/);
  });

  it('does not burn one of the six when the provider fails', async () => {
    // A misconfigured key must not cost the lead its whole sequence.
    sendOutreachEmail.mockImplementation(async () => { throw new Error('Brevo 401'); });
    const lead = makeLead();
    const r = await svc.sendNext('lead1', { manual: true });
    expect(r.sent).toBe(false);
    expect(lead.sequence.sentCount).toBe(0);
    expect(lead.sends.at(-1)).toMatchObject({ ok: false });
    expect(lead.sequence.stoppedReason).toMatch(/Brevo 401/);
  });

  it('backs off a day after a failure rather than retrying every sweep', async () => {
    sendOutreachEmail.mockImplementation(async () => { throw new Error('nope'); });
    const lead = makeLead();
    await svc.sendNext('lead1', { manual: true });
    expect(lead.sequence.nextSendAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600000);
  });

  it('records every attempt, sent or not, so the history is not only the successes', async () => {
    const lead = makeLead();
    await svc.sendNext('lead1', { manual: true });
    expect(lead.sends).toHaveLength(1);
    expect(lead.sends[0]).toMatchObject({ ok: true, manual: true, subject: 'A question about Vesoma' });
  });

  it('turns an automatic send that is refused into a stopped sequence, not a repeat', async () => {
    // The sweep would otherwise meet the same refusal every fifteen minutes.
    const lead = makeLead({ status: 'replied' });
    const r = await svc.sendNext('lead1');
    expect(r.sent).toBe(false);
    expect(lead.sequence.enabled).toBe(false);
    expect(lead.sequence.stoppedReason).toMatch(/replied/i);
    expect(sent).toHaveLength(0);
  });

  it('leaves a manual refusal alone — one click must not pause the sequence', async () => {
    const lead = makeLead({ sequence: { lastSentAt: new Date() } });
    const r = await svc.sendNext('lead1', { manual: true });
    expect(r.sent).toBe(false);
    expect(lead.sequence.enabled).toBe(true);
  });

  it('mints the unsubscribe token and ref code for a lead created before they existed', async () => {
    const lead = makeLead({ unsubscribeToken: '', refCode: '' });
    await svc.sendNext('lead1', { manual: true });
    expect(lead.unsubscribeToken).toBeTruthy();
    expect(lead.refCode).toBeTruthy();
    expect(sent[0].text).toContain(lead.unsubscribeToken);
  });
});

// ── The sweep ────────────────────────────────────────────────────────────────

describe('the sweep', () => {
  it('sends what is due and reports what it did', async () => {
    makeLead({ _id: 'a' });
    makeLead({ _id: 'b', email: 'two@example.com' });
    const r = await svc.runOutreachSweep({});
    expect(r).toMatchObject({ due: 2, sent: 2, failed: 0 });
    expect(sent).toHaveLength(2);
  });

  it('does not send the same email twice when two runs overlap', async () => {
    // The claim is what prevents it: only one run can flip nextSendAt away
    // from a due value, and the loser skips the lead entirely.
    makeLead({ _id: 'a' });
    const [first, second] = await Promise.all([
      svc.runOutreachSweep({}),
      svc.runOutreachSweep({}),
    ]);
    expect(first.sent + second.sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it('leaves out anybody who unsubscribed, before it even considers them', async () => {
    makeLead({ _id: 'a', unsubscribedAt: new Date() });
    const r = await svc.runOutreachSweep({});
    expect(r.due).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('survives one lead throwing, and keeps going', async () => {
    makeLead({ _id: 'a' });
    makeLead({ _id: 'b', email: 'two@example.com' });
    const original = store.get('a').save;
    store.get('a').save = async () => { throw new Error('write failed'); };
    const r = await svc.runOutreachSweep({});
    expect(r.failed).toBe(1);
    expect(r.sent).toBe(1);
    store.get('a').save = original;
  });
});

// ── Unsubscribe ──────────────────────────────────────────────────────────────

describe('unsubscribing', () => {
  it('stops everything in one action', async () => {
    const lead = makeLead();
    await svc.unsubscribeByToken('tok-1');
    expect(lead.unsubscribedAt).toBeTruthy();
    expect(lead.status).toBe('dead');
    expect(lead.sequence.enabled).toBe(false);
    expect(lead.sequence.nextSendAt).toBeNull();
  });

  it('is final — nothing goes out afterwards', async () => {
    makeLead();
    await svc.unsubscribeByToken('tok-1');
    const r = await svc.sendNext('lead1', { manual: true });
    expect(r.sent).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('says nothing about a token it does not recognise', async () => {
    expect(await svc.unsubscribeByToken('nope')).toBeNull();
    expect(await svc.unsubscribeByToken('')).toBeNull();
  });
});

// ── Claims about a prospect that are not true yet ────────────────────────────

describe('a subject line that claims work already done', () => {
  it('recognises the claim in the first person', () => {
    for (const s of [
      'I ran your admissions problem through Svarg',
      'We built something for your academy',
      'Giving your roster to an AI',
    ]) expect(svc.makesStoryClaim(s), s).toBe(true);
  });

  it('does not flag an ordinary question', () => {
    for (const s of [
      'A question about Vesoma',
      'Thought this might be useful',
      'Following up on my note',
    ]) expect(svc.makesStoryClaim(s), s).toBe(false);
  });
});

// ── Readiness ────────────────────────────────────────────────────────────────

describe('whether the machinery is wired up at all', () => {
  it('reports the limits and whether an unsubscribe link can be built', () => {
    const r = svc.outreachReadiness();
    expect(r).toMatchObject({
      canBuildUnsubscribeLink: true,
      minIntervalDays: 7,
      maxSends: 6,
      schedulerDisabled: false,
    });
  });

  it('says plainly when no unsubscribe link is possible', async () => {
    delete process.env.PUBLIC_API_URL;
    delete process.env.BACKEND_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    delete process.env.RAILWAY_STATIC_URL;
    vi.resetModules();
    expect((await import(S)).outreachReadiness().canBuildUnsubscribeLink).toBe(false);
  });

  it('falls back through the names Railway has used for the public address', async () => {
    delete process.env.PUBLIC_API_URL;
    delete process.env.BACKEND_URL;
    process.env.RAILWAY_PUBLIC_DOMAIN = 'svarg.up.railway.app';
    vi.resetModules();
    expect((await import(S)).outreachReadiness().unsubscribeBase).toBe('https://svarg.up.railway.app');
  });
});

// ── One gate, not two ────────────────────────────────────────────────────────

describe('the shape of the guard itself', () => {
  const src = readFileSync(new URL('../services/outreachService.js', import.meta.url), 'utf8');

  it('sends from exactly one place', () => {
    // A second call to the mail service is a second path with its own rules,
    // and the manual button is exactly the path somebody would exempt.
    expect(src.match(/sendOutreachEmail\(/g)).toHaveLength(1);
  });

  it('keeps the weekly gap outside the ignoreSchedule branch', () => {
    const gap = src.indexOf('MIN_INTERVAL_DAYS * DAY');
    const branch = src.indexOf('if (!ignoreSchedule)');
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(branch);
  });

  it('asks the gate after claiming the lead, not before', () => {
    const fn = src.slice(src.indexOf('export async function sendNext'));
    expect(fn.indexOf('canSend(lead')).toBeLessThan(fn.indexOf('compose(lead'));
  });
});
