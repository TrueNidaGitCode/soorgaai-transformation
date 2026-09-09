/**
 * Svarg — the sales funnel
 *
 * Five stages, in the order a customer actually moves through them:
 *
 *   1 Outreach    a cold email you decided to send        (typed in)
 *   2 Discovery   an anonymous guest generated a blueprint (observed)
 *   3 Conversion  they signed up                           (observed)
 *   4 Onboarding  they launched a live application         (observed)
 *   5 Sales       they are on a paid plan                  (observed)
 *
 * Only stage 1 has to be entered by hand. Everything after it is a record the
 * product already writes, which is the whole reason this board can be trusted
 * while dialling: four of the five stages cannot be wrong without the product
 * itself being wrong.
 *
 * ── An account appears once, at its furthest stage ──────────────────────────
 *
 * Someone running a live application has also signed up, and listing them in
 * both makes every count a lie — five stages summing to more than the number
 * of real people. Each account is placed at the furthest stage it has reached
 * and appears nowhere else, so the five counts are a funnel that adds up.
 *
 * ── Conversion is detected, never recorded ──────────────────────────────────
 *
 * A cold lead leaves Outreach when a User exists with the same email, not when
 * somebody remembers to tick a box. The two can therefore never disagree.
 *
 * ── What the product cannot tell you ────────────────────────────────────────
 *
 * A guest blueprint has no email and never will. IP is captured from the day
 * guestMeta shipped and is the only way to tell one company returning from
 * several unrelated visitors — blueprints older than that field have none, and
 * a missing IP means unknown, never "same as another missing IP".
 *
 * Read-only apart from the cold-lead helpers at the bottom.
 */

import { User } from '../models/user.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';
import GeneratedApplication from '../models/GeneratedApplication.js';
import HostedDeployment from '../models/HostedDeployment.js';
import UsageLedger from '../models/UsageLedger.js';
import AccountPlan from '../models/AccountPlan.js';
import ColdLead from '../models/ColdLead.js';
import UserProfile from '../models/UserProfile.js';
import { classify } from './accountKindService.js';
import { isMotion, laneOf, motionEmails, motionSharesLink, fieldsFor, DEFAULT_MOTION } from './gtmMotions.js';
import { trackedLink } from './outreachService.js';
import crypto from 'crypto';
import { generate } from './llmService.js';

const DAY = 86400000;

/** A live deployment unqueried for this long is a churn signal, not an active account. */
const QUIET_DAYS = 7;

export const STAGES = ['outreach', 'discovery', 'conversion', 'onboarding', 'sales'];

// ── Formatting helpers ───────────────────────────────────────────────────────

export function daysAgo(date) {
  if (!date) return null;
  return (Date.now() - new Date(date).getTime()) / DAY;
}

export function age(date) {
  const d = daysAgo(date);
  return d === null ? '—' : `${d < 1 ? d.toFixed(1) : Math.round(d)}d`;
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export function usd(n) {
  return `$${(Number(n) || 0).toFixed(4)}`;
}

function byRecency(a, b) {
  return new Date(b.at || 0) - new Date(a.at || 0);
}

/**
 * The grouping key for "is this the same prospect coming back".
 *
 * Objective text, normalised. Two visits from one person are near-identical
 * because they retype or paste the same description; two different companies
 * producing the same 60 characters is not a case worth designing around.
 */
function objectiveKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// ── Collection ───────────────────────────────────────────────────────────────

export async function collectSignals() {
  const [users, blueprints, apps, deployments, ledgers, plans, leads, profiles] = await Promise.all([
    User.find({}).select('_id email name role createdAt accountKind').lean(),
    TransformationBlueprint.find({ archived: { $ne: true } })
      .select('_id userId guestId guestMeta businessObjective status createdAt opportunityApproval')
      .lean(),
    GeneratedApplication.find({}).select('_id blueprintId userId status useCase createdAt updatedAt').lean(),
    HostedDeployment.find({}).select('_id userId blueprintId status usage railway liveAt preparedAt').lean(),
    UsageLedger.find({}).select('userId scope calls costUsd byStage lastCallAt').lean(),
    AccountPlan.find({}).select('userId plan status currentPeriodEnd updatedAt').lean(),
    ColdLead.find({}).lean(),
    // The organisation an account belongs to. Lives on the profile rather than
    // the user, so an account with no profile yet simply has no organisation —
    // which is a real state (signed up, never completed setup), not a gap.
    UserProfile.find({}).select('userId orgName websiteUrl').lean(),
  ]);

  const orgOf = new Map(profiles.map(p => [String(p.userId), p.orgName || '']));
  const siteOf = new Map(profiles.map(p => [String(p.userId), p.websiteUrl || '']));

  const emailOf   = new Map(users.map(u => [String(u._id), u.email]));
  const bpById    = new Map(blueprints.map(b => [String(b._id), b]));
  const planOf    = new Map(plans.map(p => [String(p.userId), p]));
  const ledgerOf  = new Map(ledgers.map(l => [String(l.userId), l]));
  const knownEmails = new Set(users.map(u => String(u.email || '').toLowerCase()));

  const appsByBp = new Map(apps.map(a => [String(a.blueprintId), a]));
  const depByBp  = new Map(deployments.map(d => [String(d.blueprintId), d]));

  // Per-account rollups, so each stage decision is a lookup rather than a scan.
  const bpsByUser = new Map();
  for (const b of blueprints) {
    if (!b.userId) continue;
    const k = String(b.userId);
    if (!bpsByUser.has(k)) bpsByUser.set(k, []);
    bpsByUser.get(k).push(b);
  }

  const liveByUser = new Map();
  for (const d of deployments) {
    if (d.status !== 'live') continue;
    const k = String(d.userId);
    if (!liveByUser.has(k)) liveByUser.set(k, []);
    liveByUser.get(k).push(d);
  }

  // Ref codes seen on anonymous previews — computed before Outreach so a lead
  // row can say whether its email produced a visit.
  const unclaimedRefs = new Set(
    blueprints.filter(b => b.guestId && !b.userId && b.guestMeta?.ref).map(b => b.guestMeta.ref)
  );

  /**
   * Refs that now sit on a blueprint someone OWNS.
   *
   * The other half of the tracked link. A guest blueprint carries the ref of
   * whoever's link brought them; signing in claims that blueprint by setting
   * userId and unsetting guestId, and guestMeta survives untouched. So a ref
   * found on an owned blueprint is proof that this specific lead's link
   * produced this specific account.
   *
   * This is the only way a warm introduction can ever leave Outreach. Those
   * leads are added with a mobile number and frequently no email at all, and
   * the email match below can never fire for them — without this they would
   * sit at the top of the funnel for ever while the person was already paying.
   */
  const claimedRefs = new Map();
  for (const b of blueprints) {
    if (b.userId && b.guestMeta?.ref) claimedRefs.set(b.guestMeta.ref, String(b.userId));
  }

  const userByEmail = new Map(users.map(u => [String(u.email || '').toLowerCase(), u]));
  const userById    = new Map(users.map(u => [String(u._id), u]));

  /**
   * The account this lead became, and how we know — or null.
   *
   * Two routes, deliberately in this order: an address match is the stronger
   * claim because it identifies the person, while a link match identifies the
   * click. Both are real; the report says which one applies.
   */
  function accountFor(l) {
    const addr = String(l.email || '').toLowerCase();
    if (addr && userByEmail.has(addr)) return { user: userByEmail.get(addr), how: 'email' };
    const uid = l.refCode ? claimedRefs.get(l.refCode) : null;
    if (uid && userById.has(uid)) return { user: userById.get(uid), how: 'link' };
    return null;
  }

  // ── 1. Outreach — everyone in flight, minus anyone who has since signed up ─
  const outreach = leads
    .filter(l => !accountFor(l))
    .map(l => ({
      id: String(l._id),
      at: l.lastContactedAt || l.createdAt,
      email: l.email,
      name: l.name || '',
      company: l.company || '',
      status: l.status || 'to-contact',
      note: l.note || '',
      orgContext: l.orgContext || '',
      role: l.role || '',
      companyUrl: l.companyUrl || '',
      subjectAlternates: l.subjectAlternates || [],
      linkedinUrl: l.linkedinUrl || '',
      // How this conversation started, and therefore which lane it renders on.
      // Leads predating motions have no value stored, so they read as cold
      // email — which is what they were.
      motion: l.motion || DEFAULT_MOTION,
      lane: laneOf(l.motion || DEFAULT_MOTION),
      via: l.via || '',
      nextStep: l.nextStep || '',
      nextStepAt: l.nextStepAt || null,
      phone: l.phone || '',
      relationship: l.relationship || '',
      location: l.location || '',
      /**
       * The link to send them, for the motions where you do the sending.
       *
       * Cold email puts this in the mail itself; a warm introduction is a
       * WhatsApp message you write, so the link has to be something you can
       * copy. Same ref either way — it is what turns their visit into an
       * attributed row instead of another anonymous guest.
       */
      inviteLink: motionSharesLink(l.motion || DEFAULT_MOTION) ? trackedLink(l) : '',
      // Leads are classified by the same rules. A +svargtest address is a
      // probe whether it is a lead or an account.
      //
      // The phone goes in because "no email" is not evidence of a test row on a
      // motion that never uses email. Without it every warm introduction was
      // classified test and hidden by the filter, which defaults to real — the
      // lead saved, the invite link appeared, and the row silently did not.
      ...classify(l.email, { phone: l.phone }),
      // Did the email actually do anything? A ref that shows up on a guest
      // blueprint is the only proof available, and it is the single most
      // useful fact about a cold lead.
      clicked: !!(l.refCode && unclaimedRefs.has(l.refCode)),
      addedAt: l.createdAt,
      lastContactedAt: l.lastContactedAt,
      unsubscribedAt: l.unsubscribedAt || null,
      sequence: {
        enabled:      !!l.sequence?.enabled,
        subject:      l.sequence?.subject || '',
        body:         l.sequence?.body || '',
        intervalDays: l.sequence?.intervalDays ?? 7,
        maxSends:     l.sequence?.maxSends ?? 6,
        sentCount:    l.sequence?.sentCount || 0,
        lastSentAt:   l.sequence?.lastSentAt || null,
        nextSendAt:   l.sequence?.nextSendAt || null,
        stoppedReason: l.sequence?.stoppedReason || '',
      },
      // Only the LAST attempt, and only if it failed.
      //
      // This used to search the whole log for the most recent failure, so a
      // lead that failed once and then sent perfectly well kept displaying
      // "Failed: Brevo 401" for ever. Reporting a failure that has since been
      // fixed is the same class of lie as reporting a success that never
      // happened: the operator stops believing the column either way.
      lastError: (() => {
        const last = (l.sends || [])[(l.sends || []).length - 1];
        return last && !last.ok ? last.error : '';
      })(),
    }))
    .sort(byRecency);

  // Leads that did sign up — not a stage, but the only proof outreach works.
  // Leads that became accounts. Not a stage — nobody sits here — but the only
  // evidence outreach works at all, so it carries what makes it evidence:
  // how long it took and how many emails it cost, not just who.
  const converted = leads
    .map(l => ({ l, hit: accountFor(l) }))
    .filter(x => x.hit)
    .map(({ l, hit }) => {
      const u = hit.user;
      const signedUpAt = u?.createdAt || null;
      const sent = l.sequence?.sentCount || 0;
      // Negative when the account predates the lead — they signed up on their
      // own and were added to outreach afterwards. That is not a conversion
      // and saying so is the difference between a metric and a flattering one.
      const days = signedUpAt ? Math.round((new Date(signedUpAt) - new Date(l.createdAt)) / DAY) : null;
      const motion = l.motion || DEFAULT_MOTION;
      return {
        id: String(l._id),
        email: l.email,
        company: l.company || '',
        role: l.role || '',
        // Which motion produced this customer — the reason for filing leads by
        // motion at all. Without it the lanes are just a tidier list.
        motion,
        lane: laneOf(motion),
        via: l.via || '',
        addedAt: l.createdAt,
        signedUpAt,
        daysToConvert: days,
        emailsSent: sent,
        /**
         * The honest label, and it differs by motion.
         *
         * For cold email the evidence is an email that actually went out before
         * they signed up. For every other motion there is nothing to count —
         * an introduction leaves no send log — so the evidence is that the lead
         * was on the board, being worked, before the account existed.
         *
         * Weaker evidence, and worth knowing that it is weaker. But requiring a
         * send would mark every hand-worked conversion "not attributable" and
         * leave cold email looking like the only motion that has ever produced
         * a customer, which would be precisely backwards.
         */
        attributed: days !== null && days >= 0 && (motionEmails(motion) ? sent > 0 : true),
        /**
         * Which of the two joins found them.
         *
         * "link" is the stronger evidence of the two despite being the weaker
         * identifier: an address match only proves the same person exists as an
         * account, while a claimed ref proves they arrived through this lead's
         * own link. Worth distinguishing on the report rather than collapsing
         * both into a tick.
         */
        matchedBy: hit.how,
        account: u ? String(u.email || '') : '',
      };
    })
    .sort((a, b) => new Date(b.signedUpAt || 0) - new Date(a.signedUpAt || 0));

  // ── 2. Discovery — anonymous guests, grouped into one row per prospect ─────
  const unclaimed = blueprints.filter(b => b.guestId && !b.userId);
  const grouped = new Map();
  for (const b of unclaimed) {
    const key = objectiveKey(b.businessObjective) || String(b._id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        at: b.createdAt, firstSeen: b.createdAt, visits: 0, completed: 0,
        who: `guest:${String(b.guestId).slice(0, 8)}`,
        objective: b.businessObjective,
        ips: new Set(), userAgents: new Set(), referers: new Set(), refs: new Set(),
        countries: new Set(),
        // A guest sets no company on the blueprint today, so this is almost
        // always empty. Read anyway rather than hard-coded blank: the day the
        // preview asks for a company name, this row starts showing it.
        org: b.companyName || '',
      });
    }
    const g = grouped.get(key);
    g.visits += 1;
    if (b.guestMeta?.country) g.countries.add(b.guestMeta.country);
    if (!g.org && b.companyName) g.org = b.companyName;
    if (b.status === 'completed') g.completed += 1;
    if (b.guestMeta?.ref) g.refs.add(b.guestMeta.ref);
    if (b.guestMeta?.ip) g.ips.add(b.guestMeta.ip);
    if (b.guestMeta?.userAgent) g.userAgents.add(b.guestMeta.userAgent);
    if (b.guestMeta?.referer) g.referers.add(b.guestMeta.referer);
    if (new Date(b.createdAt) > new Date(g.at)) g.at = b.createdAt;
    if (new Date(b.createdAt) < new Date(g.firstSeen)) g.firstSeen = b.createdAt;
  }

  // A ref code turns an anonymous guest into a named prospect: it can only
  // have come from the link in one person's email.
  const leadByRef = new Map(leads.filter(l => l.refCode).map(l => [l.refCode, l]));

  const discovery = [...grouped.values()].map(g => {
    const ips = [...g.ips];
    const fromLead = [...g.refs].map(r => leadByRef.get(r)).filter(Boolean)[0] || null;
    return {
      ...g,
      refs: [...g.refs],
      // The whole reason the tracked link exists: this row stops being
      // "someone" and becomes "the person we emailed".
      fromLead: fromLead ? { email: fromLead.email, company: fromLead.company || '' } : null,
      ips,
      // Said explicitly rather than left as an empty cell: a blank IP column
      // reads as "different visitor" when it actually means "not recorded".
      ipLabel: ips.length ? ips.join(', ') : 'not recorded',
      countries: [...g.countries],
      // Same rule as the IP: say "not recorded" rather than leaving a blank
      // that reads like a fact. Country is resolved from the IP, so a visit
      // predating IP capture can never have one.
      countryLabel: g.countries.size ? [...g.countries].join(', ') : 'not recorded',
      userAgents: [...g.userAgents],
      referers: [...g.referers],
      note: g.visits > 1
        ? `came back ${g.visits}× over ${age(g.firstSeen)}, ${g.completed} finished, never signed up`
        : (g.completed ? 'saw a finished blueprint, never signed up' : 'started, did not finish'),
    };
  }).sort((a, b) => (b.visits - a.visits) || byRecency(a, b));

  // ── 3-5. Every account, placed at the furthest stage it has reached ────────
  const conversion = [];
  const onboarding = [];
  const sales = [];

  for (const u of users) {
    if (u.role === 'admin') continue; // staff are not prospects

    const uid  = String(u._id);
    const plan = planOf.get(uid);
    const live = liveByUser.get(uid) || [];
    const bps  = bpsByUser.get(uid) || [];
    const ledger = ledgerOf.get(uid);

    // Country for an account is whatever their own guest previews recorded.
    // A user who signed up directly never presented an IP we stored, so this
    // is empty for most — which the screen must show as "not recorded".
    const ownCountry = bps.map(b => b.guestMeta?.country).filter(Boolean)[0] || '';

    const base = {
      id: uid,
      email: u.email,
      name: u.name || '',
      // From their profile. Blank means they never finished profile setup,
      // which is itself worth seeing on a sales board.
      org: orgOf.get(uid) || '',
      website: siteOf.get(uid) || '',
      country: ownCountry,
      // Real prospect, one of ours, or a test row — see accountKindService.
      // Carried on every row rather than filtered here: the screen decides
      // what to show, and it has to be able to say what it is leaving out.
      ...classify(u.email, u),
      signedUpAt: u.createdAt,
      blueprints: bps.length,
      spendUsd: ledger?.costUsd || 0,
      calls: ledger?.calls || 0,
    };

    // Stage 5 — a paid plan. Nothing is above this.
    if (plan && plan.plan && plan.plan !== 'hobby') {
      sales.push({
        ...base,
        at: plan.updatedAt || u.createdAt,
        plan: plan.plan,
        planStatus: plan.status || 'active',
        currentPeriodEnd: plan.currentPeriodEnd || null,
        note: `${plan.plan}${plan.status && plan.status !== 'active' ? ` (${plan.status})` : ''}`
            + `${plan.currentPeriodEnd ? `, renews ${new Date(plan.currentPeriodEnd).toISOString().slice(0, 10)}` : ''}`,
      });
      continue;
    }

    // Stage 4 — something of theirs is live.
    if (live.length) {
      const requests = live.reduce((n, d) => n + (d.usage?.requests || 0), 0);
      const last = live.map(d => d.usage?.lastRequestAt).filter(Boolean).sort().pop();
      const quiet = requests === 0 || (daysAgo(last) ?? 99) > QUIET_DAYS;
      onboarding.push({
        ...base,
        at: last || live[0].liveAt,
        liveCount: live.length,
        requests,
        quiet,
        url: live[0].railway?.url || '',
        objective: bpById.get(String(live[0].blueprintId))?.businessObjective || '',
        note: requests === 0
          ? `live ${age(live[0].liveAt)}, never queried — nobody is using it`
          : `${requests} queries, last ${age(last)} ago${quiet ? ' — going quiet' : ''}`,
      });
      continue;
    }

    // Stage 3 — signed up, nothing live yet. The blocker is the useful part.
    const approvedNotBuilt = bps.filter(b => b.opportunityApproval?.approved && !appsByBp.has(String(b._id)));
    const builtNotLive = bps.filter(b => {
      const app = appsByBp.get(String(b._id));
      return app?.status === 'passed' && depByBp.get(String(b._id))?.status !== 'live';
    });

    let note;
    if (builtNotLive.length)          note = 'application built and passed, never launched';
    else if (approvedNotBuilt.length) note = `approved an opportunity ${age(approvedNotBuilt[0].opportunityApproval.approvedAt)} ago, no build started`;
    else if (bps.length)              note = `${bps.length} blueprint(s), no application yet`;
    else                              note = 'signed up, never generated a blueprint';

    conversion.push({
      ...base,
      at: bps[0]?.createdAt || u.createdAt,
      blocker: builtNotLive.length ? 'not-launched' : (approvedNotBuilt.length ? 'not-built' : ''),
      objective: bps[0]?.businessObjective || '',
      note,
    });
  }


  // ── Accounts — the same people rolled up by organisation ───────────────────
  //
  // The funnel answers "who is where". The go-to-market asks a different
  // question: which COMPANIES have someone using this, and has anyone with
  // budget there been approached yet.
  //
  // Bottom-up means a power user appears first and the buyer is found second,
  // so the useful unit is the organisation — one person generating four
  // blueprints is a reason to go looking for their VP, and that is invisible
  // in a list sorted by person.
  //
  // Built from the stage rows rather than re-queried, so an account can never
  // disagree with the funnel it was derived from.
  const accounts = new Map();
  const account = (name) => {
    const key = String(name).trim();
    if (!accounts.has(key)) {
      accounts.set(key, {
        org: key, users: [], leads: [], blueprints: 0,
        live: 0, paid: 0, furthest: 'conversion',
      });
    }
    return accounts.get(key);
  };

  const RANK = { conversion: 1, onboarding: 2, sales: 3 };
  for (const [stage, rows] of [['conversion', conversion], ['onboarding', onboarding], ['sales', sales]]) {
    for (const r of rows) {
      if (r.kind !== 'real' || !r.org) continue;
      const a = account(r.org);
      a.users.push({ email: r.email, blueprints: r.blueprints, stage });
      a.blueprints += r.blueprints || 0;
      if (stage === 'onboarding') a.live += 1;
      if (stage === 'sales') a.paid += 1;
      if (RANK[stage] > RANK[a.furthest]) a.furthest = stage;
    }
  }

  // Cold leads attach to the same organisation, so "have we approached anyone
  // with budget here" is answerable without cross-referencing two screens.
  for (const l of outreach) {
    if (!l.company) continue;
    account(l.company).leads.push({ email: l.email, role: l.role || '', status: l.status });
  }

  const accountList = [...accounts.values()].map(a => {
    // A power user is someone who did the work, not merely someone who signed
    // up. That distinction is the whole trigger for the outreach that follows.
    const powerUsers = a.users.filter(u => (u.blueprints || 0) > 0);
    return {
      ...a,
      powerUsers,
      dormant: a.users.length - powerUsers.length,
      functionsContacted: [...new Set(a.leads.map(l => l.role).filter(Boolean))],
      // What to do next, said rather than left to be worked out per row.
      nextAction: a.paid ? 'Paying — expand to another department'
        : !powerUsers.length ? 'Signed up, no activity — activate before selling'
        : a.leads.length ? 'Decision-maker approached — follow up'
        : 'Power user active, no decision-maker approached yet',
    };
  }).sort((x, y) => (y.powerUsers.length - x.powerUsers.length) || (y.blueprints - x.blueprints));

  // Where each converted lead actually got to. Attached after the stages are
  // built so it can never disagree with them.
  const stageOf = new Map();
  for (const [stage, rows] of [['conversion', conversion], ['onboarding', onboarding], ['sales', sales]]) {
    for (const r of rows) stageOf.set(String(r.email).toLowerCase(), stage);
  }
  for (const c of converted) c.stage = stageOf.get(String(c.email).toLowerCase()) || 'conversion';

  conversion.sort(byRecency);
  onboarding.sort(byRecency);
  sales.sort(byRecency);

  // ── Look-alike accounts ────────────────────────────────────────────────────
  //
  // Nothing above can put one account in two stages. But one PERSON can hold
  // several accounts, and praneshbabykannan@soorgaai.com sitting in Conversion
  // while praneshbabykannan@svargai.com sits in Onboarding reads, at a glance
  // down a monospace column, as the same row printed twice — the two domains
  // differ by one letter.
  //
  // So each row is told where its look-alikes are. Deliberately a note and not
  // a merge: they are genuinely separate accounts with separate blueprints and
  // separate spend, and collapsing them would hide real work. The heuristic is
  // the local part with separators removed, which is a guess — hence "looks
  // like", never a claim.
  const localOf = (e) => String(e || '').toLowerCase().split('@')[0].replace(/[.+_-]/g, '');
  const byLocal = new Map();
  for (const [stage, rows] of [['outreach', outreach], ['conversion', conversion], ['onboarding', onboarding], ['sales', sales]]) {
    for (const r of rows) {
      const k = localOf(r.email);
      if (!k) continue;
      if (!byLocal.has(k)) byLocal.set(k, []);
      byLocal.get(k).push({ stage, email: r.email, row: r });
    }
  }
  for (const entries of byLocal.values()) {
    if (entries.length < 2) continue;
    for (const e of entries) {
      e.row.alsoAt = entries
        .filter(o => o.email !== e.email)
        .map(o => ({ stage: o.stage, email: o.email }));
    }
  }

  return {
    outreach, discovery, conversion, onboarding, sales,
    accounts: accountList,
    converted,
    counts: {
      outreach: outreach.length, discovery: discovery.length, conversion: conversion.length,
      onboarding: onboarding.length, sales: sales.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function section(n, title, hint, rows, render) {
  const head = `\n${n}. ${title.toUpperCase()}  ·  ${hint}  ·  ${rows.length}`;
  if (!rows.length) return `${head}\n   (nothing)`;
  return `${head}\n${rows.map(r => `   ${render(r)}`).join('\n')}`;
}

/**
 * The board, as text — what the CLI prints and what the model is given, so an
 * answer can never cite something the operator cannot see.
 */
export function renderBoard(s) {
  const c = s.counts;
  return [
    `SVARG SALES FUNNEL — ${new Date(s.generatedAt).toISOString().slice(0, 16).replace('T', ' ')}`,
    `outreach ${c.outreach} → discovery ${c.discovery} → conversion ${c.conversion} `
      + `→ onboarding ${c.onboarding} → sales ${c.sales}`,
    `(each account appears once, at the furthest stage it has reached)`,

    // The motion and the next step are on the line, not just in the database.
    // Nole answers from this text alone, so "which motion is actually working"
    // and "what has stalled" are unanswerable unless they are printed here.
    section(1, 'Outreach', 'everyone you are working toward a first conversation, by motion', s.outreach,
      r => `${age(r.at).padStart(5)}  ${String(r.status).padEnd(11)} ${r.email.padEnd(32)} `
         + `${clip(r.company, 24)}\n         via ${r.motion}${r.via ? ` (${clip(r.via, 40)})` : ''}`
         + ` — next: ${r.nextStep ? clip(r.nextStep, 50) : (motionEmails(r.motion) ? 'scheduled' : 'NOTHING RECORDED')}`
         + `${r.note ? `\n         ${clip(r.note, 90)}` : ''}`),

    section(2, 'Discovery', 'anonymous guests — no email exists for these', s.discovery,
      r => `${age(r.at).padStart(5)}  ${String(r.visits).padStart(2)}×  ${r.who.padEnd(16)} `
         + `${clip(r.objective, 52)}\n            ip: ${r.ipLabel}\n            ${r.note}`),

    section(3, 'Conversion', 'signed up, nothing live yet', s.conversion,
      r => `${age(r.at).padStart(5)}  ${r.email.padEnd(32)} ${clip(r.objective, 40)}\n         ${r.note}`),

    section(4, 'Onboarding', 'running a live application', s.onboarding,
      r => `${age(r.at).padStart(5)}  ${r.email.padEnd(32)} ${clip(r.objective, 40)}\n         ${r.note}`),

    section(5, 'Sales', 'on a paid plan', s.sales,
      r => `${age(r.at).padStart(5)}  ${r.email.padEnd(32)} ${r.note}`),

    s.converted.length
      ? `\nCONVERTED FROM OUTREACH · ${s.converted.length}\n`
        + s.converted.map(r => `   ${r.email}${r.company ? ` (${r.company})` : ''}`).join('\n')
      : '',
  ].filter(Boolean).join('\n');
}

// ── The agent ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
`You are Nole, the sales analyst for Svarg, an AI transformation platform. You
are given a live five-stage funnel read from Svarg's own database, and you
answer the operator's question about it while they are actively selling.

The stages are Outreach (cold emails, typed in by hand), Discovery (anonymous
guests who generated a blueprint), Conversion (signed up), Onboarding (running
a live application) and Sales (on a paid plan). Each account appears once, at
the furthest stage it has reached.

Rules:
- Answer only from the board. It is the complete picture available.
- Name specific rows — the email or guest id, and the age. Vague advice is useless.
- When you recommend contacting someone, say what to open with, based on what
  the row shows they actually did. They got somewhere and stopped; the opener
  should reference that, not a generic pitch.
- Discovery rows are anonymous: there is no email behind a guest id. Say so
  rather than inventing one, and treat them as evidence of demand, not as
  contactable leads. An IP of "not recorded" means the visit predates IP
  capture — it does NOT mean it is the same visitor as another blank one.
- A repeat visitor (visits > 1) is one prospect, not several. Weigh them by how
  many times they came back.
- If the board does not support an answer, say what is missing. Never invent a
  row, a name, a number, or a date.
- Be brief. The operator is between calls.

Write in PLAIN TEXT. The chat panel renders your reply literally, so markdown
does not become formatting — it becomes visible punctuation. No asterisks for
bold, no backticks around addresses, no # headings, no markdown tables. Use
short paragraphs, and a plain "- " where you need a list.`;

/**
 * @param {string} board renderBoard() output — the only evidence the model gets.
 * @param {string} question
 * @param {Array<{role: string, text: string}>} history
 *   Earlier turns, so "what about the second one" means something. Replayed as
 *   plain text rather than provider message roles because generate() takes a
 *   single user message, and because the board — not the transcript — has to
 *   stay the authority on facts.
 */
export async function askBoard(board, question, history = []) {
  const transcript = history
    .slice(-8) // enough for a follow-up to make sense, short enough to stay cheap
    .map(t => `${t.role === 'user' ? 'Operator' : 'Nole'}: ${String(t.text).slice(0, 1500)}`)
    .join('\n');

  const userMessage = transcript
    ? `${board}\n\n---\nEarlier in this conversation:\n${transcript}\n\n---\nOperator: ${question}`
    : `${board}\n\n---\nOperator: ${question}`;

  const { text } = await generate({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    label: 'sales-agent',
    maxTokens: 1200,
  });
  return text;
}

// ── Cold leads (the only writes in this module) ──────────────────────────────

const LEAD_STATUSES = ['to-contact', 'contacted', 'replied', 'dead'];

export async function addLead({
  email, name, company, role, companyUrl, linkedinUrl, note, orgContext,
  motion, via, nextStep, nextStepAt, phone, relationship, location,
  subject, body, addedByUserId,
}) {
  // An unrecognised motion is rejected rather than stored: a lead filed under a
  // key no lane matches would not appear on any tab, which is worse than a
  // refusal because nothing tells you it happened.
  if (motion !== undefined && motion !== '' && !isMotion(motion)) {
    throw new Error(`Unknown motion "${motion}".`);
  }
  const key = motion || DEFAULT_MOTION;

  const clean = String(email || '').trim().toLowerCase();
  const tel   = String(phone || '').trim();
  if (clean && !clean.includes('@')) throw new Error('That is not a valid email address.');

  /**
   * The fields this motion declares are checked here, not only on the form.
   *
   * The screen renders from the same list, so in practice the form catches
   * these first. But the form is one of two ways in and the API is the other,
   * and a rule that lives only in the browser is a rule that is not enforced.
   */
  const supplied = { name, phone: tel, company, relationship, location, email: clean, role, via, note };
  for (const f of fieldsFor(key)) {
    if (f.required && !String(supplied[f.key] ?? '').trim()) {
      throw new Error(`${f.label} is required for this motion.`);
    }
    // A select whose value is not one of its options came from something other
    // than the form. Store it and the row renders a value no filter matches.
    if (f.options && supplied[f.key] && !f.options.includes(supplied[f.key])) {
      throw new Error(`${f.label} must be one of: ${f.options.join(', ')}.`);
    }
  }

  /**
   * A backstop: some way to reach them, whatever the motion declares.
   *
   * The per-motion rules above give the precise message wherever there is one
   * to give — "Email address is required for this motion". This catches the
   * motion that declares neither field mandatory. A cold email needs an
   * address; a warm introduction to someone you already know needs a number and
   * often has no address for weeks. What neither can be is a row with no way to
   * reach the person at all — that is a name in a list, and it will sit at the
   * top of the funnel for ever.
   */
  if (!clean && !tel) {
    throw new Error('An email address or a mobile number is required — otherwise there is no way to reach them.');
  }

  // Upsert rather than reject: re-adding someone you already have should show
  // you the row you already have, not an error you have to read and dismiss.
  //
  // Matched on the address when there is one and the number otherwise, so the
  // same person added twice is one row either way.
  const filter = clean ? { email: clean } : { phone: tel };

  return ColdLead.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        status: 'to-contact', addedByUserId: addedByUserId || null,
        // Only when there is one. An empty string is a value as far as the
        // partial unique index is concerned, so writing '' here would put every
        // number-only lead back into collision with every other one.
        ...(clean ? { email: clean } : {}),
        /**
         * The ref, minted now rather than at send time.
         *
         * Cold email could leave this until the mail went out, because the mail
         * was what carried the link. On every other motion YOU send the link,
         * by hand, the moment the lead is added — so it has to exist by then or
         * the screen has nothing to give you to paste.
         */
        refCode: crypto.randomBytes(6).toString('base64url'),
        // On insert only. Re-adding an address must not silently move an
        // existing lead into a different lane — that would make a row vanish
        // from the tab someone was working it on.
        motion: motion || DEFAULT_MOTION,
      },
      $set: {
        ...(name    !== undefined ? { name:    String(name).trim() }    : {}),
        ...(company !== undefined ? { company: String(company).trim() } : {}),
        ...(role    !== undefined ? { role:    String(role).trim().slice(0, 80) } : {}),
        ...(companyUrl  !== undefined ? { companyUrl:  String(companyUrl).trim().slice(0, 300) }  : {}),
        ...(linkedinUrl !== undefined ? { linkedinUrl: String(linkedinUrl).trim().slice(0, 300) } : {}),
        ...(note    !== undefined ? { note:    String(note).trim() }    : {}),
        // The organisation paragraph — the one field that is not generic, and
        // for a while the one field this function quietly dropped. The
        // controller passed it, the signature did not name it, and it went on
        // the floor: the operator typed the only sentence worth reading and
        // the email went out without it.
        ...(orgContext !== undefined ? { orgContext: String(orgContext).slice(0, 4000) } : {}),
        // The route in, and what has to happen next. For every motion but cold
        // email these are the only things that say whether this is moving.
        ...(via      !== undefined ? { via:      String(via).trim().slice(0, 300) }      : {}),
        ...(phone        !== undefined ? { phone:        tel.slice(0, 40) }                          : {}),
        ...(relationship !== undefined ? { relationship: String(relationship).trim().slice(0, 40) }  : {}),
        ...(location     !== undefined ? { location:     String(location).trim().slice(0, 40) }      : {}),
        ...(nextStep !== undefined ? { nextStep: String(nextStep).trim().slice(0, 300) } : {}),
        ...(nextStepAt !== undefined
          ? { nextStepAt: nextStepAt ? new Date(nextStepAt) : null } : {}),
        // Written straight onto the sequence so one form can add the person
        // and the message together. `enabled` is untouched — adding a lead
        // never starts a sequence; sending is always an explicit press.
        ...(subject !== undefined ? { 'sequence.subject': String(subject).slice(0, 300) }   : {}),
        ...(body    !== undefined ? { 'sequence.body':    String(body).slice(0, 10000) }    : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function updateLead(id, {
  status, note, name, company, markContacted, motion, via, nextStep, nextStepAt,
  phone, relationship, location,
}) {
  const set = {};
  if (motion !== undefined) {
    // Re-filing a lead under another motion is legitimate — an intro that goes
    // nowhere becomes a cold email, a cold reply becomes a workshop — so this
    // is editable here even though addLead only sets it on insert.
    if (!isMotion(motion)) throw new Error(`Unknown motion "${motion}".`);
    set.motion = motion;
  }
  if (via      !== undefined) set.via      = String(via).trim().slice(0, 300);
  if (phone        !== undefined) set.phone        = String(phone).trim().slice(0, 40);
  if (relationship !== undefined) set.relationship = String(relationship).trim().slice(0, 40);
  if (location     !== undefined) set.location     = String(location).trim().slice(0, 40);
  if (nextStep !== undefined) set.nextStep = String(nextStep).trim().slice(0, 300);
  if (nextStepAt !== undefined) set.nextStepAt = nextStepAt ? new Date(nextStepAt) : null;
  if (status !== undefined) {
    if (!LEAD_STATUSES.includes(status)) throw new Error(`Unknown status "${status}".`);
    set.status = status;
    // Marking someone contacted without recording when is how a list turns
    // into a list of people you are not sure you emailed.
    if (status === 'contacted') set.lastContactedAt = new Date();
  }
  if (note    !== undefined) set.note    = String(note).trim();
  if (name    !== undefined) set.name    = String(name).trim();
  if (company !== undefined) set.company = String(company).trim();
  if (markContacted) set.lastContactedAt = new Date();

  if (!Object.keys(set).length) throw new Error('Nothing to update.');

  const doc = await ColdLead.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
  if (!doc) throw new Error('Lead not found.');
  return doc;
}

export async function deleteLead(id) {
  const r = await ColdLead.deleteOne({ _id: id });
  if (!r.deletedCount) throw new Error('Lead not found.');
  return true;
}
