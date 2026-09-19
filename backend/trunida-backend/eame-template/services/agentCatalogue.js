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
  who:      /student|member|player|customer|client|patient|staff|employee|coach|person|contact|name|supplier|vendor/i,
  when:     /date|day|when|time|created|updated|logged|sent|received/i,
  due:      /due|deadline|expir|valid|renew|by$/i,
  amount:   /amount|total|value|price|cost|fee|rate|paid|balance|outstanding/i,
  status:   /status|state|stage|result|outcome|confirm|approv/i,
  ref:      /(^|[^a-z])(id|no|num|ref|code|invoice|order|ticket)([^a-z]|$)/i,
  supplier: /supplier|vendor|seller|manufacturer|partner/i,
  slot:     /slot|session|class|booking|appointment|shift|schedule|batch/i,
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

/** Default cadence. Overridden per entry where a different one is obvious. */
const DEFAULT = { schedule: 'weekdays', atHour: 7, condition: C({}) };

const SLOW = new Set(['renewal-due', 'expiring-soon', 'deadline-approaching', 'price-change', 'unusual-expense']);

// ── Matching against what this application actually holds ────────────────────

/**
/**
 * Every column that could play this role.
 * Exported so a test can show which columns a watcher would consider.
 */
export function columnsFor(role, columns) {
  const re = ROLES[role];
  if (!re) return [];
  return (columns || []).filter((c) => re.test(String(c)));
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
  return using ? { dataset: dataset.name, using } : null;
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
    let match = null;
    for (const d of datasets || []) {
      match = matchDataset(entry, d);
      if (match) break;
    }
    return {
      id: entry.id,
      area: entry.area,
      name: entry.name,
      says: entry.says,
      ready: !!match,
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
