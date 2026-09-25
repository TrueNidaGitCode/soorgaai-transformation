/**
 * What this application could watch, whether or not it is watching it yet.
 *
 * The agents screen used to open on an empty form: "call it ___, tell me when
 * ___". That asks the owner to invent, and inventing is the one thing the
 * person this is built for cannot do — it is why they cannot use a coding
 * assistant either. They can recognise their own Tuesday in a list. They
 * cannot describe it from nothing.
 *
 * So the application arrives knowing the administrative work of a small team:
 * twenty-seven watchers across seven areas, each in the words somebody would
 * use at their own desk.
 *
 * ── The rule this file exists to hold ──────────────────────────────────────
 *
 *   The data decides what is POSSIBLE.
 *   Cob decides what is FIRST.
 *   Nothing decides what is INVISIBLE.
 *
 * Every application gets the whole catalogue. An omitted watcher would be
 * undiscoverable — there is no "why is this not here?" anywhere on a screen —
 * and the judgement would have been made before a single row of real data
 * arrived. A cricket academy that Cob decided does not invoice would never
 * learn its application could have chased fees. A watcher shown and greyed
 * costs one line of text; a watcher withheld costs the customer the feature.
 *
 * ── It costs nothing until somebody taps ───────────────────────────────────
 *
 * Nothing here runs. A catalogue entry is a row of JSON; only an agent that
 * has been created has a schedule, and only a schedule spends money.
 */

/** The seven areas of a small team's administration. */
export const AREAS = ['People', 'Money', 'Customers', 'Suppliers', 'Schedule', 'Records', 'Compliance'];

/**
 * What a column has to look like to play a part.
 *
 * Matched on names, which is how this codebase already decides things about
 * generated datasets — the Data page picks an icon the same way. Generous on
 * purpose: a watcher offered and unused is a smaller mistake than one hidden
 * because a column was called "Dt" instead of "Date".
 */
export const ROLES = {
  /*
   * `who` also covers the person a piece of work is ON. An engineering
   * schedule names them assigned_to, owner or responsible, none of which is a
   * "customer" word, and without them every watcher that asks who is
   * accountable was offered to nobody on project data.
   */
  who:      /student|member|player|customer|client|patient|staff|employee|coach|person|contact|name|supplier|vendor|assign|owner|responsible|engineer/i,
  when:     /date|day|when|time|created|updated|logged|sent|received/i,
  /*
   * `due` is any date work is measured AGAINST, not only a date something is
   * owed by.
   *
   * Measured against a real project export — task_id, planned_finish,
   * baseline_finish, actual_finish, percent_complete, float_days — the old
   * pattern matched not one column. Every deadline watcher in the catalogue
   * needs this role, so on an engineering schedule the application offered
   * none of them: overdue, approaching, late delivery, all invisible. The
   * words a planner uses are planned, baseline, target, forecast and finish.
   */
  due:      /due|deadline|expir|valid|renew|by$|planned|baseline|target|forecast|finish|eta\b|milestone/i,
  amount:   /amount|total|value|price|cost|fee|rate|paid|balance|outstanding/i,
  status:   /status|state|stage|result|outcome|confirm|approv/i,
  ref:      /(^|[^a-z])(id|no|num|ref|code|invoice|order|ticket)([^a-z]|$)/i,
  supplier: /supplier|vendor|seller|manufacturer|partner/i,
  // A unit of scheduled work, whether it is an hour in a diary or a task on a
  // plan. The Schedule watchers hang off this, and without the project words
  // none of them reached a project.
  slot:     /slot|session|class|booking|appointment|shift|schedule|batch|task|activity|milestone|work ?package|wbs|job|ticket|sprint/i,
  doc:      /document|certificate|licence|license|permit|policy|registration|insurance/i,
  reply:    /reply|response|answer|resolved|closed|handled|acknowledg/i,
};

const C = (over) => ({ over: 'rows', op: 'gt', value: 0, ...over });

/**
 * The catalogue.
 *
 * `needs` are the roles a single dataset must cover — together, because a
 * watcher asks one question of one body of records. `question` is filled from
 * the columns that matched, so a created agent asks about the real column
 * names rather than about the words in this file.
 */
export const CATALOGUE = [
  // ── People ───────────────────────────────────────────────────────────────
  { id: 'stopped-coming', area: 'People', name: 'Stopped Coming',
    says: 'Somebody who used to turn up has stopped',
    needs: ['who', 'when'], question: '{who} in {dataset} with no {when} in the last 14 days' },
  { id: 'missing-attendance', area: 'People', name: 'Missing Attendance',
    says: 'A session with no attendance recorded',
    needs: ['slot', 'when'], question: '{slot} in {dataset} with no {when} recorded' },
  { id: 'timesheet-chaser', area: 'People', name: 'Timesheet Chaser',
    says: 'Staff who have not submitted their hours',
    needs: ['who', 'status'], question: '{who} in {dataset} whose {status} is not submitted' },
  { id: 'leave-clash', area: 'People', name: 'Leave Clash',
    says: 'Two people away on the same day',
    needs: ['who', 'when', 'status'], question: 'days in {dataset} where more than one {who} is away' },
  { id: 'new-joiner', area: 'People', name: 'New Joiner Not Set Up',
    says: 'Someone added but not finished',
    needs: ['who', 'status'], question: 'recently added {who} in {dataset} whose {status} is incomplete' },

  // ── Money ────────────────────────────────────────────────────────────────
  { id: 'overdue-invoice', area: 'Money', name: 'Overdue Invoice',
    says: 'Past the due date and still unpaid',
    needs: ['due', 'amount'], question: 'rows in {dataset} past their {due} and not paid',
    condition: C({}) },
  { id: 'never-invoiced', area: 'Money', name: 'Never Invoiced',
    says: 'Work done with no invoice raised',
    needs: ['who', 'amount', 'status'], question: '{who} in {dataset} with no invoice raised' },
  { id: 'part-payment', area: 'Money', name: 'Part Payment',
    says: 'Paid less than billed',
    needs: ['amount', 'status'], question: 'rows in {dataset} where the {amount} paid is less than billed' },
  { id: 'unusual-expense', area: 'Money', name: 'Unusual Expense',
    says: 'An amount well outside the normal range',
    needs: ['amount', 'when'], question: 'rows in {dataset} whose {amount} is far above the usual' },
  { id: 'renewal-due', area: 'Money', name: 'Renewal Due',
    says: 'A recurring charge coming up',
    needs: ['due'], question: 'rows in {dataset} whose {due} falls in the next 14 days' },
  /*
   * The record says nobody came; the rest of the row says somebody did.
   *
   * A real no-show is a fact of the week and the No Show watcher below finds
   * those. This is the opposite and it is the one that costs money: the
   * patient arrived, was treated, and the front desk never marked them in, so
   * the session was delivered and never counted. Every trace of the visit is
   * still in the row — a check-in time, a duration, a room, a therapist — and
   * only the status disagrees with them.
   *
   * It is filed under Money rather than Schedule because that is what it is.
   * A session given away is not a scheduling detail, and the person who cares
   * is the one looking at the month's revenue.
   */
  { id: 'absent-but-attended', area: 'Money', name: 'Marked Absent, But Attended',
    says: 'Recorded as a no-show, but the visit left its fingerprints',
    needs: ['slot', 'status', 'when'],
    question: '{slot} in {dataset} whose {status} says no show or absent, but which has a {when} recorded' },

  // ── Customers ────────────────────────────────────────────────────────────
  { id: 'unanswered-enquiry', area: 'Customers', name: 'Unanswered Enquiry',
    says: 'Came in and nobody has replied',
    needs: ['when', 'reply'], question: 'rows in {dataset} with no {reply} after 2 days' },
  { id: 'gone-quiet', area: 'Customers', name: 'Gone Quiet',
    says: 'A regular customer has stopped',
    needs: ['who', 'when'], question: '{who} in {dataset} who used to be regular and have stopped' },
  { id: 'repeat-complaint', area: 'Customers', name: 'Repeat Complaint',
    says: 'The same person, more than once',
    needs: ['who', 'when'], question: '{who} in {dataset} appearing more than once' },
  { id: 'promise-overdue', area: 'Customers', name: 'Promise Overdue',
    says: 'We said we would do something by a date',
    needs: ['due', 'status'], question: 'rows in {dataset} past their {due} and not {status} done' },

  // ── Suppliers ────────────────────────────────────────────────────────────
  { id: 'unconfirmed-order', area: 'Suppliers', name: 'Unconfirmed Order',
    says: 'Placed and never acknowledged',
    needs: ['supplier', 'status'], question: 'orders in {dataset} whose {status} is not confirmed' },
  { id: 'late-delivery', area: 'Suppliers', name: 'Late Delivery',
    says: 'Past the promised date',
    needs: ['supplier', 'due'], question: 'orders in {dataset} past their {due} and not delivered' },
  { id: 'price-change', area: 'Suppliers', name: 'Price Change',
    says: 'A cost has moved since last time',
    needs: ['supplier', 'amount'], question: 'suppliers in {dataset} whose {amount} has changed' },

  // ── Schedule ─────────────────────────────────────────────────────────────
  { id: 'empty-slot', area: 'Schedule', name: 'Empty Slot',
    says: 'Capacity going unused',
    needs: ['slot', 'when'], question: '{slot} in {dataset} with nobody booked' },
  { id: 'over-capacity', area: 'Schedule', name: 'Over Capacity',
    says: 'More booked than there is room for',
    needs: ['slot', 'who'], question: '{slot} in {dataset} with more {who} than places' },
  { id: 'no-show', area: 'Schedule', name: 'No Show',
    says: 'Booked and did not arrive',
    needs: ['slot', 'who', 'status'], question: '{who} in {dataset} booked but marked absent' },
  { id: 'unstaffed-session', area: 'Schedule', name: 'Unstaffed Session',
    says: 'Scheduled with nobody assigned',
    needs: ['slot', 'who'], question: '{slot} in {dataset} with no {who} assigned' },

  /*
   * ── Work that has stopped moving ──────────────────────────────────────────
   *
   * Three watchers for the shape of a schedule rather than a diary, added
   * when the first engineering conversation made schedule risk the vertical.
   *
   * Each one is two clauses over one dataset, both inside OPS, so a finding
   * from them is a finding the code stands behind. What they deliberately do
   * NOT attempt: comparing planned against actual on the same row, which
   * needs a column-to-column comparison the where-clause cannot express, and
   * following a dependency to its downstream impact, which needs a graph. Both
   * are real gaps and are named on the Capital page rather than implied away.
   */
  { id: 'no-progress', area: 'Schedule', name: 'No Progress',
    says: 'Still open, and nothing has moved on it for a fortnight',
    needs: ['slot', 'status', 'when'],
    question: '{slot} in {dataset} that is not done and whose {when} is older than 14 days' },
  { id: 'blocked-work', area: 'Schedule', name: 'Blocked Work',
    says: 'Waiting on somebody, and still waiting',
    needs: ['slot', 'status'],
    question: '{slot} in {dataset} whose {status} says blocked, on hold or waiting' },
  { id: 'unassigned-work', area: 'Schedule', name: 'Unassigned Work',
    says: 'Scheduled, open, and nobody owns it',
    needs: ['slot', 'who', 'status'],
    question: '{slot} in {dataset} that is not done and has no {who} against it' },

  // ── Records ──────────────────────────────────────────────────────────────
  { id: 'missing-detail', area: 'Records', name: 'Missing Detail',
    says: 'Rows without something you rely on',
    needs: ['who'], question: 'rows in {dataset} missing a {who}' },
  { id: 'nothing-new', area: 'Records', name: 'Nothing New',
    says: 'A source that has stopped delivering',
    needs: ['when'], question: 'the most recent {when} in {dataset}',
    // Not a count of rows: the question is how old the newest one is.
    condition: C({ over: 'rows', op: 'eq', value: 0 }) },
  { id: 'duplicate', area: 'Records', name: 'Duplicate',
    says: 'The same person or thing twice',
    // With a reference as well as a name: on an event log the same person
    // appearing twice is Tuesday, not a duplicate.
    needs: ['who', 'ref'], question: '{who} in {dataset} sharing a {ref} with another row' },
  { id: 'stale-source', area: 'Records', name: 'Stale Source',
    says: 'A connection that has not synced',
    needs: ['when'], question: 'rows in {dataset} added in the last 7 days',
    condition: C({ over: 'rows', op: 'eq', value: 0 }) },

  // ── Compliance ───────────────────────────────────────────────────────────
  { id: 'expiring-soon', area: 'Compliance', name: 'Expiring Soon',
    says: 'A certificate, licence or document running out',
    needs: ['doc', 'due'], question: '{doc} in {dataset} whose {due} falls in the next 30 days' },
  { id: 'deadline-approaching', area: 'Compliance', name: 'Deadline Approaching',
    says: 'A filing or return coming up',
    needs: ['due', 'status'], question: 'rows in {dataset} whose {due} is near and are not {status} done' },
  { id: 'missing-document', area: 'Compliance', name: 'Missing Document',
    says: 'Required and never supplied',
    needs: ['who', 'doc'], question: '{who} in {dataset} with no {doc}' },
];

/**
 * How much it matters, per watcher.
 *
 * ── Why this is a fixed table and not a judgement ──────────────────────────
 *
 * The board has to put something at the top, and the obvious way to decide is
 * to ask the model which finding matters most. That is exactly the thing the
 * model is not allowed to do here: ranking findings is deciding, and deciding
 * belongs to code. A watcher's severity is a property of the QUESTION — money
 * already owed is worse than a form with a blank in it, whoever the customer
 * is — so it can be written down once, by a person, and never inferred.
 *
 * Held apart from CATALOGUE rather than added to all 28 entries: this is an
 * editorial judgement that will be argued about and revised, and keeping it in
 * one readable block is what makes revising it a conversation rather than a
 * diff across the whole file.
 *
 * `high`   money at risk, a customer walking, a legal date passing
 * `medium` work not done, capacity wasted, somebody waiting
 * `low`    tidiness — real, worth knowing, never worth an early morning
 */
const SEVERITY = {
  high: [
    'overdue-invoice', 'never-invoiced', 'part-payment',
    'stopped-coming', 'gone-quiet', 'unanswered-enquiry',
    'expiring-soon', 'deadline-approaching',
    'unstaffed-session', 'late-delivery',
  ],
  low: [
    'missing-detail', 'duplicate', 'nothing-new', 'stale-source',
    'new-joiner', 'leave-clash', 'price-change',
  ],
};

const SEVERITY_BY_ID = new Map([
  ...SEVERITY.high.map((id) => [id, 'high']),
  ...SEVERITY.low.map((id) => [id, 'low']),
]);

/** Everything not named above is medium — the honest default. */
export function severityFor(id) {
  return SEVERITY_BY_ID.get(id) || 'medium';
}

/** Highest first, for sorting a board. */
export const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/** Default cadence. Overridden per entry where a different one is obvious. */
const DEFAULT = { schedule: 'weekdays', atHour: 7, condition: C({}) };

const SLOW = new Set(['renewal-due', 'expiring-soon', 'deadline-approaching', 'price-change', 'unusual-expense']);

// ── Matching against what this application actually holds ────────────────────

/**
 * Within a role, some columns are better than others.
 *
 * ── The finding that forced this ───────────────────────────────────────────
 *
 * A physiotherapy centre's package sheet carried both `sale_date` and
 * `last_session_date`. The Stopped Coming watcher took `sale_date`, because it
 * appears first in the table and both satisfy the `when` role — producing
 * "clients with no sale_date in the last 14 days", which is true of every
 * package sold a fortnight ago and means nothing at all.
 *
 * A finding that is structurally valid and semantically empty is worse than no
 * finding: it arrives with evidence attached, looks authoritative, and teaches
 * somebody that the product does not understand their business.
 *
 * `good` columns are tried first, `bad` ones last, everything else in between.
 * This only reorders the candidates — the search below is still exhaustive, so
 * anything that matched before still matches. It just stops taking the first
 * column that fits when a better one is sitting further along the row.
 */
const PREFER = {
  // Recency beats origin. A watcher asking who has gone missing wants the
  // last time something happened, not the day the record was created.
  when: {
    good: /last|latest|recent|seen|visit|attend|activity|check.?in/i,
    bad:  /expir|valid|renew|birth|dob|sale|purchase|join|enrol|signup|sign.?up|start/i,
  },
  // A count is never the thing that was booked.
  slot: {
    good: /slot|cabin|room|booking|appointment|class|batch|shift/i,
    bad:  /^total|count|num|_no$|qty|quantity|remaining|completed/i,
  },
  who: {
    good: /name/i,
    bad:  /^total|count|num|qty/i,
  },
  due: { good: /due|deadline/i, bad: /^total|count/i },
  amount: { good: /amount|balance|outstanding|total/i, bad: /count|qty|sessions/i },
};

/**
 * Every column that could play this role, best first.
 * Exported so a test can show which columns a watcher would consider.
 */
export function columnsFor(role, columns) {
  const re = ROLES[role];
  if (!re) return [];
  const hits = (columns || []).filter((c) => re.test(String(c)));

  const p = PREFER[role];
  if (!p) return hits;
  const rank = (c) => {
    const s = String(c);
    if (p.good && p.good.test(s)) return 0;
    if (p.bad && p.bad.test(s)) return 2;
    return 1;
  };
  // Stable within a rank, so a dataset's own column order still decides
  // between two equally good candidates.
  return hits
    .map((c, i) => [c, rank(c), i])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map(([c]) => c);
}

/**
 * Give every role its own column, or fail.
 *
 * One column must not play two parts. "Session Date" satisfies both the slot
 * role and the when role, and letting it do both produced Missing Attendance
 * as "Session Date with no Session Date recorded" — a question about nothing,
 * offered as ready. It also made almost everything look possible: eighteen of
 * twenty-eight watchers on a single attendance sheet.
 *
 * Solved exactly rather than greedily. The numbers are tiny — a handful of
 * roles against a handful of columns — and a greedy pass would fail real
 * matches by letting an early role take the column a later one needed.
 */
export function assignRoles(roles, columns) {
  const used = new Set();
  const out = {};
  const place = (i) => {
    if (i === roles.length) return true;
    for (const col of columnsFor(roles[i], columns)) {
      if (used.has(col)) continue;
      used.add(col); out[roles[i]] = col;
      if (place(i + 1)) return true;
      used.delete(col); delete out[roles[i]];
    }
    return false;
  };
  return place(0) ? out : null;
}

/**
 * Can this dataset support this watcher? All of its roles, in one dataset —
 * because a watcher asks one question of one body of records, and a date in
 * the invoices and a name in the attendance do not make an overdue invoice.
 */
export function matchDataset(entry, dataset) {
  const using = assignRoles(entry.needs, dataset?.columns || []);
  return using ? { dataset: dataset.name, using, fit: fitOf(entry, dataset, using) } : null;
}

/**
 * How WELL this dataset answers this watcher, not merely whether it can.
 *
 * ── Why a second number was needed ─────────────────────────────────────────
 *
 * A clinic's package sheet and its appointment diary both satisfy Empty Slot
 * structurally — a package sheet has session columns and dates. Taking the
 * first dataset that fit produced "last_session_date in Package Sales and
 * Balances with nobody booked", when the Appointment Booking Diary was sitting
 * right there with a cabin and a booking time.
 *
 * So: one point for every role filled by a column this role actually prefers,
 * and a point for a dataset whose own NAME belongs to the watcher's area. Both
 * are cheap signals, and the whole scale is small on purpose — this decides
 * between two workable answers, not between right and wrong.
 */
function fitOf(entry, dataset, using) {
  let score = 0;
  for (const [role, col] of Object.entries(using || {})) {
    const p = PREFER[role];
    if (p?.good && p.good.test(String(col))) score += 1;
    if (p?.bad && p.bad.test(String(col))) score -= 1;
  }
  // "Appointment Booking Diary" for a Schedule watcher; "Fee Ledger" for Money.
  const areaWords = {
    Schedule: /appointment|booking|diary|slot|schedule|session|calendar/i,
    Money: /invoice|payment|fee|ledger|billing|package|sales|account/i,
    People: /attendance|roll|register|staff|student|member|client|patient/i,
    Customers: /enquir|inquir|lead|customer|complaint|ticket/i,
    Suppliers: /supplier|vendor|purchase|order|delivery/i,
    Records: /record|master|roster|list|catalog/i,
    Compliance: /document|certificate|licence|license|compliance|consent/i,
  }[entry.area];
  if (areaWords && areaWords.test(String(dataset?.name || ''))) score += 2;
  return score;
}

/** The question, with the real column and dataset names in it. */
export function fillQuestion(entry, match) {
  let q = entry.question.replace('{dataset}', match.dataset);
  for (const [role, col] of Object.entries(match.using)) q = q.split(`{${role}}`).join(col);
  // A role named in the question but not in `needs` leaves a placeholder,
  // which would reach the model as literal braces.
  return q.replace(/\{[a-z]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * The whole catalogue, in the order this application should show it, with what
 * each one would run on and why it cannot.
 *
 * @param {Array} datasets  from data/datasets.json
 * @param {{ order?: string[], startHere?: string[] }} [plan]  data/agents.json
 */
export function catalogueFor(datasets, plan = {}) {
  const order = Array.isArray(plan.order) ? plan.order : [];
  const startHere = new Set(Array.isArray(plan.startHere) ? plan.startHere : []);

  const rows = CATALOGUE.map((entry) => {
    /*
     * The BEST dataset, not the first one that fits.
     *
     * Several datasets in the same business will satisfy a watcher's roles —
     * a package sheet and an appointment diary both hold sessions and dates.
     * Taking the first produced questions about the wrong body of records,
     * which read as authoritative and meant nothing. Ties keep the earlier
     * dataset, so an application with one obvious source is unchanged.
     */
    let match = null;
    for (const d of datasets || []) {
      const m = matchDataset(entry, d);
      if (m && (!match || m.fit > match.fit)) match = m;
    }
    return {
      id: entry.id,
      area: entry.area,
      name: entry.name,
      says: entry.says,
      ready: !!match,
      severity: severityFor(entry.id),
      startHere: startHere.has(entry.id),
      using: match ? match.dataset : '',
      question: match ? fillQuestion(entry, match) : '',
      schedule: SLOW.has(entry.id) ? 'daily' : DEFAULT.schedule,
      atHour: DEFAULT.atHour,
      condition: entry.condition || DEFAULT.condition,
      // Said in the owner's terms, because this line is what makes them
      // connect a source: it names the thing that would unlock the watcher.
      missing: match ? '' : `Needs records with ${entry.needs.map(niceRole).join(' and ')}`,
    };
  });

  // Cob's order first, then ready ones, then the rest. Cob can promote; it
  // cannot remove — an entry it never mentions still appears, lower down.
  const rank = (r) => {
    const named = order.indexOf(r.id);
    if (r.startHere) return -1000 + named;
    if (named >= 0) return named;
    return r.ready ? 500 : 1000;
  };
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function niceRole(role) {
  return ({
    who: 'a name', when: 'a date', due: 'a due date', amount: 'an amount',
    status: 'a status', ref: 'a reference', supplier: 'a supplier',
    slot: 'a session or booking', doc: 'a document', reply: 'a reply or response',
  })[role] || role;
}

/** One entry by id, for creating an agent from the catalogue. */
export function entryFor(id) {
  return CATALOGUE.find((e) => e.id === id) || null;
}
