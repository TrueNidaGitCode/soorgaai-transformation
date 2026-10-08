/**
 * Detect → Explain → Recommend → Act → Measure → Learn, for each customer.
 *
 * ── What this is ───────────────────────────────────────────────────────────
 *
 * A watcher finds something about a person. That was the whole product: the
 * board said "Stopped Coming — Asha Rao" and left the rest to whoever read
 * it. This file carries the finding the rest of the way, one customer at a
 * time:
 *
 *   Explain    why it matters, in the business's terms, not the rule's
 *   Recommend  the next step to take with this customer
 *   Act        what the team says it did (the draft is written elsewhere;
 *              nothing here sends anything)
 *   Measure    whether the finding stopped being true after somebody acted
 *   Learn      which step has actually worked in THIS business, and the
 *              recommendation follows it once there is enough to go on
 *
 * ── The rule this file follows ─────────────────────────────────────────────
 *
 * Nothing here is written by a model. The playbook is written in code, per
 * watcher, so the same finding always gets the same explanation and the
 * same recommendation, and a test can read every word of it. What changes a
 * recommendation is a count of this business's own outcomes — never a
 * model's opinion of what usually works.
 *
 * "Worked" means one thing: somebody marked the finding as acted on, and the
 * watcher later stopped finding it. That is a measurement the application
 * makes itself, on the next run, from the customer's own records. It is not
 * "customers retained" in the accountant's sense, and the screen does not
 * call it that.
 */

/** How long an acted-on finding may stay open before it counts as not having worked. */
export const GIVE_UP_DAYS = 21;

/** How many tries a step needs, here, before it can displace the default. */
export const LEARN_AFTER = 3;

/**
 * The steps a team can take. One vocabulary for every watcher, so "what
 * worked" can be counted across them and read back in plain words.
 */
export const ACTIONS = {
  call: 'Called them',
  message: 'Sent a message',
  rebook: 'Offered a time to come back',
  offer: 'Offered a package or upgrade',
  bill: 'Raised or corrected the bill',
  record: 'Corrected the record',
  escalate: 'Passed it to a senior person',
};

/** The same steps, as an instruction: what the screen recommends doing next. */
export const DO = {
  call: 'Call them',
  message: 'Send them a message',
  rebook: 'Offer them a time to come back',
  offer: 'Offer a package or upgrade',
  bill: 'Raise or correct the bill',
  record: 'Correct the record',
  escalate: 'Pass it to a senior person',
};

/**
 * Per watcher: whether it is about keeping a customer or growing one, why it
 * matters, the steps worth trying in order, and what "won back" looks like
 * when the watcher stops finding it.
 *
 * Retention: the customer is drifting away, or showing a warning sign.
 * Growth:    the customer could buy more, or revenue earned was never billed —
 *            recovering unbilled delivered work counts as growth (decided
 *            6 October 2026).
 */
export const PLAYBOOK = {
  // A pattern learned from this business's own customers who left
  // (churnPatterns.js), approved by the owner.
  'learned-pattern': {
    kind: 'retention',
    why: 'This customer shows a pattern that came before many of the customers who left this business. It is not certain they will leave, but it is when a call matters most.',
    steps: ['call', 'message', 'rebook'],
    won: 'the pattern no longer shows for them',
  },
  'stopped-coming': {
    kind: 'retention',
    why: 'Someone who used to come regularly has stopped. Most people who drift away never say why, and the first few weeks are when a call still brings them back.',
    steps: ['call', 'rebook', 'message'],
    won: 'they come in again',
  },
  'gone-quiet': {
    kind: 'retention',
    why: 'Nobody has heard from this customer for a while. Silence is usually the first sign of a customer leaving, and it is cheap to break early.',
    steps: ['call', 'message', 'escalate'],
    won: 'there is contact with them again',
  },
  'no-show': {
    kind: 'retention',
    why: 'Missed appointments are an early warning: a customer who misses one and is not followed up is much more likely to stop altogether.',
    steps: ['call', 'rebook', 'message'],
    won: 'they are booked and attend again',
  },
  'no-show-then-contact': {
    kind: 'retention',
    why: 'They missed an appointment and then got in touch. They want to continue, and an answer now keeps them.',
    steps: ['rebook', 'call', 'message'],
    won: 'they are rebooked',
  },
  'repeat-complaint': {
    kind: 'retention',
    why: 'The same customer has raised more than one complaint. A second complaint is a customer deciding whether to stay.',
    steps: ['escalate', 'call', 'message'],
    won: 'no new complaint arrives',
  },
  'promise-not-kept': {
    kind: 'retention',
    why: 'Someone on the team promised this customer something and it has not happened yet. A broken promise costs more trust than no promise.',
    steps: ['call', 'message', 'escalate'],
    won: 'the promised follow-up is recorded',
  },
  'promise-overdue': {
    kind: 'retention',
    why: 'A follow-up promised to this customer is past its date. They are waiting on you.',
    steps: ['call', 'message', 'escalate'],
    won: 'the follow-up is done',
  },
  'contact-no-record': {
    kind: 'retention',
    why: 'This customer was in touch, but nothing about it was recorded. Whatever they asked for is at risk of being forgotten.',
    steps: ['record', 'call', 'message'],
    won: 'the contact is recorded',
  },
  'unanswered-enquiry': {
    kind: 'growth',
    why: 'Someone asked and has not had an answer. An enquiry answered the same day converts far more often than one answered next week.',
    steps: ['call', 'message', 'offer'],
    won: 'they get a reply',
  },
  'opportunity-gone-quiet': {
    kind: 'retention',
    why: 'An open deal or opportunity has had no activity. Opportunities that go quiet are usually lost without anyone deciding to lose them.',
    steps: ['call', 'message', 'escalate'],
    won: 'there is activity on it again',
  },
  'asked-to-upgrade': {
    kind: 'growth',
    why: 'This customer asked about more — a bigger package, an upgrade, another service. They have told you they are ready to buy.',
    steps: ['offer', 'call', 'message'],
    won: 'the upgrade is taken up',
  },
  'renewal-due': {
    kind: 'growth',
    why: 'A package or plan is ending soon. Renewals offered before the end are taken far more often than ones chased after it.',
    steps: ['offer', 'call', 'message'],
    won: 'they renew',
  },
  'expiring-soon': {
    kind: 'growth',
    why: 'Something this customer bought is about to expire. It is the natural moment to offer the next one.',
    steps: ['offer', 'call', 'message'],
    won: 'it is renewed or replaced',
  },
  'absent-but-attended': {
    kind: 'growth',
    why: 'The customer was marked absent, but the records show they were treated. Work that was delivered has not been counted, so it has not been billed.',
    steps: ['record', 'bill'],
    won: 'the record matches what happened',
  },
  'cancelled-not-updated': {
    kind: 'growth',
    why: 'A cancelled appointment is still recorded as a no-show. The customer may be penalised for something they told you about, and the slot is mis-counted.',
    steps: ['record', 'message'],
    won: 'the record is corrected',
  },
  'package-overused': {
    kind: 'growth',
    why: 'This customer has used more sessions than their package covers. That is delivered work nobody has paid for — and a customer who clearly wants more.',
    steps: ['offer', 'bill', 'call'],
    won: 'the extra sessions are paid for',
  },
  'never-invoiced': {
    kind: 'growth',
    why: 'Work was delivered and never invoiced. It is revenue already earned.',
    steps: ['bill', 'record'],
    won: 'an invoice is raised',
  },
  'overdue-invoice': {
    kind: 'growth',
    why: 'An invoice is past its due date. The longer it waits, the less likely it is to be paid in full.',
    steps: ['message', 'call', 'escalate'],
    won: 'it is paid',
  },
  'part-payment': {
    kind: 'growth',
    why: 'This customer has paid part of what they owe. The balance is easiest to collect while the work is fresh.',
    steps: ['message', 'call', 'bill'],
    won: 'the balance is paid',
  },
};

/** Anything a watcher finds that has no playbook entry yet. */
const GENERIC = {
  kind: 'other',
  why: 'A watcher found something about this customer that needs a person to look at it.',
  steps: ['call', 'message', 'record'],
  won: 'the watcher stops finding it',
};

export function playbookFor(watcherId) {
  return PLAYBOOK[watcherId] || GENERIC;
}

export function kindOf(watcherId) {
  return playbookFor(watcherId).kind;
}

const DAY = 86400000;

function time(v) {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * What has worked in this business, per watcher and step.
 *
 * Read from the findings themselves. A tried step is one somebody marked as
 * done; it worked if the watcher stopped finding it afterwards (recorded in
 * `outcomes` at the moment it resolved), and it did not if the finding is
 * still open GIVE_UP_DAYS later. Anything in between is still waiting and
 * counts as neither — a step does not fail for not having worked yet.
 */
export function learnFrom(findings = [], now = Date.now()) {
  const stats = {};
  const bump = (w, a, worked) => {
    if (!w || !ACTIONS[a]) return;
    const s = ((stats[w] ||= {})[a] ||= { tried: 0, worked: 0 });
    s.tried += 1;
    if (worked) s.worked += 1;
  };
  for (const f of findings) {
    for (const o of f.outcomes || []) bump(f.watcherId, o.action, true);
    const acted = f.acted;
    if (f.state !== 'resolved' && acted && time(acted.at) !== null && now - time(acted.at) > GIVE_UP_DAYS * DAY) {
      bump(f.watcherId, acted.action, false);
    }
  }
  return stats;
}

/**
 * The step to take next, and whether this business's own record chose it.
 *
 * The playbook's first step is the default. It is displaced only by a step
 * that has been tried LEARN_AFTER times here and worked more often than the
 * default has — and the default must have been tried as often, or a lucky
 * streak on a new step beats a default nobody has tried yet.
 */
export function recommendFor(watcherId, stats = {}) {
  const pb = playbookFor(watcherId);
  const mine = stats[watcherId] || {};
  const rate = (a) => (mine[a] && mine[a].tried ? mine[a].worked / mine[a].tried : 0);
  const fallback = pb.steps[0];

  let pick = fallback;
  let learnt = false;
  for (const a of pb.steps) {
    const s = mine[a];
    if (!s || s.tried < LEARN_AFTER) continue;
    const d = mine[fallback];
    const defaultKnown = d && d.tried >= LEARN_AFTER;
    if (a !== fallback && defaultKnown && rate(a) > rate(pick)) { pick = a; learnt = true; }
  }
  const s = mine[pick];
  return {
    action: pick,
    label: DO[pick],
    learnt,
    evidence: s && s.tried ? { tried: s.tried, worked: s.worked } : null,
  };
}

/** "2 days ago" for a stage line. */
function ago(at, now) {
  const t = time(at);
  if (t === null) return '';
  const days = Math.floor((now - t) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days + ' days ago';
}

const SEV = { high: 0, medium: 1, low: 2 };

/**
 * One customer's summary, across every open and recently resolved finding
 * that names them.
 *
 * `open` and `resolved` are board views (findingView + person). Each stage
 * carries a state the screen draws as a chip — done, partly, waiting, or
 * none — and one line saying what it means for this customer.
 */
export function spineFor(person, open = [], resolved = [], stats = {}, now = Date.now()) {
  const sorted = [...open].sort((a, b) =>
    (SEV[a.severity] ?? 1) - (SEV[b.severity] ?? 1)
    || (time(a.since) ?? 0) - (time(b.since) ?? 0));
  const top = sorted[0];
  const watchers = [...new Set(sorted.map(f => f.watcher).filter(Boolean))];
  const kinds = [...new Set(sorted.map(f => kindOf(f.watcherId)))].filter(k => k !== 'other');

  const pb = top ? playbookFor(top.watcherId) : GENERIC;
  const rec = top ? recommendFor(top.watcherId, stats) : null;

  const acted = sorted.filter(f => f.acted && f.acted.at)
    .sort((a, b) => time(b.acted.at) - time(a.acted.at));
  const won = resolved.filter(f => (f.outcomes || []).length);

  const stages = {
    detect: {
      state: 'done',
      line: (sorted.length === 1 ? '1 finding' : sorted.length + ' findings')
        + (watchers.length ? ' — ' + watchers.join(', ') : ''),
    },
    explain: { state: 'done', line: pb.why },
    recommend: {
      state: 'done',
      line: rec.label + (rec.learnt && rec.evidence
        ? ` — it worked for ${rec.evidence.worked} of ${rec.evidence.tried} here`
        : ''),
    },
    /*
     * Partly, when some of this customer's findings have a step marked and
     * some do not: "done" would hide the high-priority one nobody touched.
     */
    act: acted.length
      ? {
        state: acted.length === sorted.length ? 'done' : 'part',
        line: `${ACTIONS[acted[0].acted.action] || 'Acted'} ${ago(acted[0].acted.at, now)}`
          + (acted.length < sorted.length ? ` — ${acted.length} of ${sorted.length} findings acted on` : ''),
      }
      : { state: 'waiting', line: 'Nobody has marked a step as done yet' },
    // What "worked" means is the acted-on finding's, not the top one's.
    measure: won.length
      ? { state: 'done', line: won.length === 1 ? '1 finding resolved after the team acted' : `${won.length} findings resolved after the team acted` }
      : acted.length
        ? { state: 'waiting', line: `Waiting until ${playbookFor(acted[0].watcherId).won}` }
        : { state: 'none', line: 'Starts when a step is marked as done' },
    learn: rec.learnt
      ? { state: 'done', line: 'The recommendation follows what has worked in your business' }
      : { state: 'waiting', line: `Learns once a step has been tried ${LEARN_AFTER} times here` },
  };

  return {
    person,
    kinds,
    severity: top ? top.severity : 'medium',
    findings: sorted.length,
    top: top ? top.id : '',
    // What the AI's analysis is matched against: see customerAnalysis.
    openIds: sorted.map(f => f.id),
    watcherIds: [...new Set(sorted.map(f => f.watcherId).filter(Boolean))],
    recommend: rec,
    stages,
  };
}

/**
 * Every customer on the board, worst first: the person with a high-priority
 * finding before the person with three medium ones, then by how many.
 */
export function customersIn(open = [], resolved = [], stats = {}, now = Date.now()) {
  const by = new Map();
  const add = (f, list) => {
    const p = String(f.person || '').trim();
    if (!p) return;
    if (!by.has(p)) by.set(p, { open: [], resolved: [] });
    by.get(p)[list].push(f);
  };
  for (const f of open) add(f, 'open');
  for (const f of resolved) add(f, 'resolved');

  const out = [];
  for (const [person, g] of by) {
    if (!g.open.length) continue;   // only customers something is still open for
    out.push(spineFor(person, g.open, g.resolved, stats, now));
  }
  return out.sort((a, b) =>
    (SEV[a.severity] ?? 1) - (SEV[b.severity] ?? 1) || b.findings - a.findings || a.person.localeCompare(b.person));
}

/** The finding-level slice of the same thing, for the detail screen. */
export function guidanceFor(finding, stats = {}) {
  const pb = playbookFor(finding?.watcherId);
  const rec = recommendFor(finding?.watcherId, stats);
  return {
    kind: pb.kind,
    why: pb.why,
    won: pb.won,
    recommend: rec,
    steps: pb.steps.map(a => ({ action: a, label: ACTIONS[a] })),
  };
}
