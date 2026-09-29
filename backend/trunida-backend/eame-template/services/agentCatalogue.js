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
  /*
   * A CRM names the person a meeting is WITH differently again: who_id is
   * Zoho's column for the contact an appointment belongs to, and participants
   * is the list of people invited. Without them, every watcher asking about
   * an appointment matched `owner` — the member of staff whose diary it is —
   * and asked which of the practice's own staff had failed to turn up.
   */
  who:      /student|member|player|customer|client|patient|staff|employee|coach|person|contact|name|supplier|vendor|assign|owner|responsible|engineer|who_?id|participant|attendee|invitee/i,
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
  /*
   * `by$` used to be here on its own, for "complete by" and "pay by". It also
   * matched Created_By, Modified_By and Check_In_By — three columns naming a
   * PERSON, present on every record a CRM hands over. On Zoho's Deals, where
   * no real deadline column matched at all, they were the only candidates, so
   * Overdue Invoice offered to find "rows past their Created_By".
   *
   * So `by` only after a word that makes it a deadline. Closing is here for
   * the same reason from the other side: Closing_Date is the date a CRM
   * measures a deal against, and nothing in this pattern reached it.
   */
  due:      /due|deadline|expir|valid|renew|(?:complete|finish|submit|respond|repl|pay|deliver|return|confirm|book|clos)[a-z]*[_ ]?by$|clos(?:e|ing)|planned|baseline|target|forecast|finish|eta\b|milestone/i,
  amount:   /amount|total|value|price|cost|fee|rate|paid|balance|outstanding/i,
  status:   /status|state|stage|result|outcome|confirm|approv/i,
  ref:      /(^|[^a-z])(id|no|num|ref|code|invoice|order|ticket)([^a-z]|$)/i,
  supplier: /supplier|vendor|seller|manufacturer|partner/i,
  // A unit of scheduled work, whether it is an hour in a diary or a task on a
  // plan. The Schedule watchers hang off this, and without the project words
  // none of them reached a project.
  // meeting/event/visit/consult are what a CRM calls the booked thing. Their
  // absence is why an appointment diary lost every Schedule watcher to a
  // lead list that merely happened to have more columns.
  slot:     /slot|session|class|booking|appointment|meeting|event|visit|consult|shift|schedule|batch|task|activity|milestone|work ?package|wbs|job|ticket|sprint/i,
  doc:      /document|certificate|licence|license|permit|policy|registration|insurance/i,
  reply:    /reply|response|answer|resolved|closed|handled|acknowledg/i,
  /*
   * Somebody here said they would do something.
   *
   * A column that exists because a conversation was read into one — see
   * callSignalService. It is deliberately its own role rather than a use of
   * `status`: a call's status is "completed" and says nothing about whether
   * anyone committed to anything, and the two columns sit side by side on the
   * same row.
   */
  promise:  /promise|commit|undertak|assur|callback|call ?back|follow ?up/i,
};

const C = (over) => ({ over: 'rows', op: 'gt', value: 0, ...over });

/**
 * The catalogue.
 *
 * `needs` are the roles a single dataset must cover — together, because a
 * watcher asks one question of one body of records. `question` is filled from
 * the columns that matched, so a created agent asks about the real column
 * names rather than about the words in this file.
 *
 * A few entries carry `across` instead: two sides, each with its own roles,
 * matched to two DIFFERENT datasets and compared on the person and on the
 * clock. That shape exists for one kind of question — where one system
 * disagrees with another — and it is the only kind that cannot be asked of a
 * single dataset by construction. See matchPair.
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

  /*
   * ── Where the record disagrees with what happened ─────────────────────────
   *
   * Every watcher above asks one question of one body of records, because
   * that was the only thing the matcher could express. It is also the reason
   * the product could not see the problem two clinics actually described:
   * the customer did something, a trace of it exists in one system, and the
   * system that runs the business says otherwise. Neither dataset is wrong on
   * its own. The disagreement IS the finding, and it is invisible to anything
   * that reads one of them at a time.
   *
   * These three read two datasets and compare them on the person and on the
   * clock — see `across` and matchPair below. Sequence is the whole point: a
   * call before the appointment and a call after it are opposite findings
   * with opposite actions, and a join that only asked "did both happen"
   * returns them as one undifferentiated pile.
   *
   * Still no model in the decision. The join is set logic, the date
   * comparison is arithmetic, and a date that cannot be parsed never matches.
   */
  { id: 'cancelled-not-updated', area: 'Money', name: 'Cancelled, Still No Show',
    says: 'They said they could not come, and the booking was never changed',
    across: {
      left:  { needs: ['who', 'when', 'status'], prefer: /appoint|booking|diary|session|slot|schedule/i },
      right: { needs: ['who', 'when'], prefer: /enquir|call|contact|message|whatsapp|conversation|lead/i },
      mode: 'both', when: 'before',
    },
    question: '{left.who} in {left} whose {left.status} says no show or cancelled, who also appear'
      + ' in {right} whose {right.when} is BEFORE that appointment' },
  { id: 'no-show-then-contact', area: 'Customers', name: 'No Show, Then Got In Touch',
    says: 'Marked absent, and then they contacted you',
    across: {
      left:  { needs: ['who', 'when', 'status'], prefer: /appoint|booking|diary|session|slot|schedule/i },
      right: { needs: ['who', 'when'], prefer: /enquir|call|contact|message|whatsapp|conversation|lead/i },
      mode: 'both', when: 'after',
    },
    question: '{left.who} in {left} whose {left.status} says no show or absent, who also appear'
      + ' in {right} whose {right.when} is AFTER that appointment' },
  /*
   * The one a clinic recognises instantly, and the reason recordings are read
   * at all.
   *
   * A customer rings to ask about upgrading. Whoever answers says they will
   * check and get back to them. Nothing is written down anywhere, because the
   * conversation happened on the phone — and the business never learns it
   * lost a sale it had already half made.
   *
   * It fires on the `promise` column, which exists because a transcript was
   * read into one, and only when that reading carried the staff member's own
   * words. See callSignalService: a promise nobody can quote is discarded
   * rather than reported, because this watcher puts a named person on
   * somebody's morning list for forgetting something.
   */
  { id: 'promise-not-kept', area: 'Customers', name: 'Promise Not Kept',
    says: 'Someone here said they would get back, and nothing followed',
    across: {
      left: { needs: ['who', 'when', 'promise'], prefer: /call|phone|enquir|contact|conversation|lead/i },
      right: { needs: ['who', 'when'], prefer: /appoint|booking|diary|session|task|follow|slot|schedule/i },
      mode: 'leftOnly', when: 'after',
    },
    question: '{left.who} in {left} whose {left.promise} says yes, who have no row in'
      + ' {right} whose {right.when} is AFTER that call' },
  { id: 'contact-no-record', area: 'Customers', name: 'Contact Never Recorded',
    says: 'They got in touch and nothing happened afterwards',
    across: {
      left:  { needs: ['who', 'when'], prefer: /enquir|call|contact|message|whatsapp|conversation|lead/i },
      right: { needs: ['who', 'when'], prefer: /appoint|booking|diary|session|slot|schedule/i },
      mode: 'leftOnly', when: 'after',
    },
    question: '{left.who} in {left} who have no row in {right} whose {right.when} is AFTER'
      + ' they got in touch' },

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
    // A cancelled session nobody re-sold, and a customer who asked for
    // something and was never answered. Both are money, and both were
    // invisible to every watcher that reads one dataset at a time.
    'cancelled-not-updated', 'contact-no-record',
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
  /*
   * Recency beats origin, and the business event beats the record's own
   * history.
   *
   * A watcher asking who has gone missing wants the last time something
   * happened, not the day the record was created. Both of those were already
   * here. What was not: a CRM hands over its own audit stamps alongside the
   * dates a business actually cares about, and Created_Time and
   * Appointment_Date ranked the same — so which one a watcher asked about was
   * decided by the order Zoho happened to return its fields in.
   *
   * An appointment, a booking, a session or a scheduled thing IS the event.
   * A creation timestamp is a fact about the row.
   */
  when: {
    good: /last|latest|recent|seen|visit|attend|activity|check.?in|appoint|book|session|schedul/i,
    bad:  /expir|valid|renew|birth|dob|sale|purchase|join|enrol|signup|sign.?up|start|created/i,
  },
  /*
   * A state the business set beats a state the software set.
   *
   * Every record in a CRM carries approval, review and lock states that say
   * something about the row's passage through the system and nothing about
   * the customer. A watcher looking for "no show or absent" must not be
   * pointed at one of those.
   */
  /*
   * A state the business set beats a state the software set — and a state
   * about whether somebody turned up beats both.
   *
   * Measured on a real Zoho account: a meeting carried Check_In_State,
   * Check_In_Status, Record_Status__s and the practice's own
   * Appointment_Status. All four could play the role, so the column order
   * Zoho happened to return decided it, and the no-show watcher was pointed
   * at a check-in flag nobody fills in.
   */
  status: {
    good: /appointment|attend|show|present|absent|arriv/i,
    // `state` is a status word and also half of every postal address a CRM
    // holds. Billing_State is not a state anything is in.
    bad: /approval|review|lock|sync|record|convert|mailing|billing|shipping|address|city|country|province|postal/i,
  },
  // A count is never the thing that was booked.
  slot: {
    good: /slot|cabin|room|booking|appointment|class|batch|shift/i,
    bad:  /^total|count|num|_no$|qty|quantity|remaining|completed/i,
    /*
     * A date is not the thing that was booked — but it is a better answer
     * than a count, so it cannot simply be forbidden.
     *
     * Appointment_Date matched this role and the when role equally well and
     * took whichever was assigned first, leaving the watcher asking whether
     * a no-show had a Modified_Time, which every row on earth has. Vetoing
     * dates outright then broke the opposite case: on a packages sheet whose
     * only other candidates are total_sessions and sessions_completed,
     * last_session_date IS the best available answer.
     *
     * So: worse than a real booked thing, better than a tally.
     */
    weak: /date|time|status|state/i,
  },
  /*
   * The person the record is ABOUT, not the member of staff who owns it.
   *
   * `owner` has to stay eligible — on an engineering schedule the owner of a
   * task is exactly who the watcher means, and it is often the only name
   * there. But on an appointment it is the practitioner whose diary it is,
   * and a no-show watcher pointed at it asks which of the practice's own
   * staff failed to turn up. So: weaker than a customer's name, still better
   * than nothing.
   */
  who: {
    /*
     * A person's name, not a pointer to one.
     *
     * who_id and participants are eligible — on a CRM's Meetings they are the
     * only columns naming the person an appointment is with — but they are
     * references, and a finding that names somebody reads better than one
     * that cites a record. Left unranked rather than good, so they still win
     * where nothing better exists and lose to First_Name where it does:
     * Stopped Coming was going to Tasks on a Who_Id while Leads sat there
     * with a name.
     */
    good: /name/i,
    weak: /owner|assign|responsible|manager/i,
    /*
     * An address is not a person, however many name-shaped words are in it.
     *
     * A CRM's Accounts module carries
     * Billing_Flat_House_No_Building_Apartment_Name, which matches `name` and
     * so ranked as well as First_Name did. Stopped Coming went to it, and the
     * board read: "Billing_Flat_House_No_Building_Apartment_Name with no
     * Last_Activity_Time in the last 14 days".
     */
    bad:  /^total|count|num|qty|address|street|house|flat|building|apartment|city|country|postal|zip|state|province|lane|road/i,
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
  /*
   * The veto is read first, and that order is the whole point of having one.
   *
   * good said "this is the kind of word the role is about"; bad said "this is
   * not the kind of thing". A column can carry both — Appointment_Date is
   * about appointments AND is a date — and with good tested first it scored
   * top for 'the thing that was booked' on the strength of the word
   * "appointment", before the veto on dates was ever consulted. The watcher
   * then asked whether a no-show had a Modified_Time, which every row has.
   *
   * The same reading fixes others of the same shape: Total Sessions is not an
   * amount, however much "total" sounds like one.
   */
  const rank = (c) => {
    const s = String(c);
    // bad first, because a veto that can be out-argued is not a veto; then
    // weak, because a column can read as good and still be the wrong shape
    // (Appointment_Date is about appointments AND is a date); then good.
    if (p.bad && p.bad.test(s)) return 3;
    if (p.weak && p.weak.test(s)) return 2;
    if (p.good && p.good.test(s)) return 0;
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
  // A two-dataset watcher has no single-dataset answer, and asking for one
  // must return "no" rather than throw: this is called in a loop over every
  // entry in the catalogue.
  if (!Array.isArray(entry?.needs)) return null;
  const using = assignRoles(entry.needs, businessColumns(dataset));
  return using ? { dataset: dataset.name, using, fit: fitOf(entry, dataset, using) } : null;
}

/**
 * The columns a question can be about.
 *
 * A source may declare some of its columns to be its own bookkeeping —
 * Zoho's Enrich_Status__s and Last_Enriched_Time__s, say, which describe the
 * CRM's data-enrichment feature and nothing about the customer. They are kept
 * as data, because a row is a row and the owner may want to read them; they
 * are just never what a watcher is ABOUT. Without this, "marked absent but
 * attended" offered to compare an enrichment status against an enrichment
 * timestamp, which is a question about Zoho.
 *
 * Declared by the connector rather than pattern-matched here, because which
 * columns are housekeeping is knowledge the source has and this file cannot
 * guess without learning one vendor's naming.
 */
export function businessColumns(dataset) {
  const skip = new Set(Array.isArray(dataset?.internal) ? dataset.internal : []);
  return (dataset?.columns || []).filter((c) => !skip.has(c));
}

/**
 * Two datasets that, read together, could answer this watcher.
 *
 * ── Why a second matcher rather than a longer `needs` ──────────────────────
 *
 * matchDataset is deliberately single-dataset: a date in the invoices and a
 * name in the attendance do not make an overdue invoice, and relaxing that
 * would make almost everything look possible. That rule is still right for
 * every watcher that asks one question of one body of records.
 *
 * A disagreement between two systems is not that kind of question. It cannot
 * be asked of one dataset by construction, and it is the question two clinics
 * described unprompted. So it gets its own shape rather than weakening the
 * existing one.
 *
 * ── How a side is chosen ───────────────────────────────────────────────────
 *
 * Both sides must fill their roles, and the two must be DIFFERENT datasets —
 * a diary joined to itself finds every customer who ever rebooked, which is
 * noise wearing the clothes of a finding. `prefer` is a name hint, worth
 * three points, because structure alone cannot tell a booking diary from a
 * call log: both are a name, a date and a status. Without it the pair is
 * chosen by column shape, which is how "no-show, then got in touch" would be
 * answered from two attendance sheets.
 */
export function matchPair(entry, datasets) {
  const spec = entry.across;
  if (!spec) return null;
  const pool = (datasets || []).filter(Boolean);

  const side = (s, d) => {
    const using = assignRoles(s.needs, businessColumns(d));
    if (!using) return null;
    let fit = fitOf({ ...entry, area: null }, d, using);
    if (s.prefer && s.prefer.test(String(d.name || ''))) fit += 3;
    return { dataset: d.name, using, fit };
  };

  let best = null;
  for (const l of pool) {
    const left = side(spec.left, l);
    if (!left) continue;
    for (const r of pool) {
      if (r === l || r.name === l.name) continue;
      const right = side(spec.right, r);
      if (!right) continue;
      const fit = left.fit + right.fit;
      if (!best || fit > best.fit) {
        best = { dataset: `${l.name} + ${r.name}`, left, right, fit, mode: spec.mode, when: spec.when };
      }
    }
  }
  return best;
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
  /*
   * Records the business actually has beat records this application invented.
   *
   * Worth more than every other signal here put together, and it has to be.
   * The sample datasets an application ships with were built to have exactly
   * the columns the business uses, so they win on structure by construction:
   * measured on a live physiotherapy application, "Appointment Booking Diary"
   * and a real "Meetings (Zoho CRM)" both scored 4 for No Show, and the tie
   * went to whichever came first in the index — the sample one.
   *
   * A watcher reads `kind: 'own'`. Bound to a dataset holding none of the
   * owner's rows it finds nothing every morning, which is indistinguishable
   * from a business with nothing wrong.
   *
   * Absent when the caller did not count — then this is 0 for everything and
   * the choice falls back to structure, exactly as before.
   */
  if (Number(dataset?.own) > 0) score += 4;
  for (const [role, col] of Object.entries(using || {})) {
    const p = PREFER[role];
    if (p?.good && p.good.test(String(col))) score += 1;
    if (p?.bad && p.bad.test(String(col))) score -= 1;
  }
  // "Appointment Booking Diary" for a Schedule watcher; "Fee Ledger" for Money.
  const areaWords = {
    // meeting/event/visit/consult: a CRM's diary is called Meetings, and
    // without them it lost every Schedule watcher to a lead list.
    Schedule: /appointment|booking|diary|slot|schedule|session|calendar|meeting|event|visit|consult/i,
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
  // Two datasets: the placeholders are sided, because both halves have a
  // `who` and a `when` and an unsided {who} could only mean one of them.
  if (entry.across && match.left && match.right) {
    let q = entry.question
      .split('{left}').join(match.left.dataset)
      .split('{right}').join(match.right.dataset);
    for (const [role, col] of Object.entries(match.left.using)) q = q.split(`{left.${role}}`).join(col);
    for (const [role, col] of Object.entries(match.right.using)) q = q.split(`{right.${role}}`).join(col);
    return q.replace(/\{[a-z.]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
  }

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
    if (entry.across) {
      match = matchPair(entry, datasets);
    } else {
      for (const d of datasets || []) {
        const m = matchDataset(entry, d);
        if (!m) continue;
        /*
         * Fit first; then, between two that answer equally well, the one
         * holding more of the business's records.
         *
         * Nine CRM modules are structurally alike, so ties are the normal
         * case rather than the edge one, and "keep the earlier dataset" then
         * means alphabetical order: Stopped Coming went to Calls (two rows)
         * over Leads (ten), because C sorts before L. More records is not
         * proof of a better answer, but it is a better guess than the
         * alphabet, and it keeps a one-source application unchanged.
         */
        if (!match || m.fit > match.fit || (m.fit === match.fit && (Number(d.own) || 0) > (match.own || 0))) {
          match = { ...m, own: Number(d.own) || 0 };
        }
      }
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
      missing: match ? '' : missingFor(entry),
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

/**
 * What would unlock this watcher, in the owner's own terms.
 *
 * For a two-dataset watcher this is the line that matters most on the whole
 * screen: the reason it cannot run is almost always that the second source
 * has never been connected, and "needs a name and a date" would send somebody
 * to look at the diary they already have.
 */
function missingFor(entry) {
  if (entry.across) {
    return 'Needs two sources: records with '
      + `${entry.across.left.needs.map(niceRole).join(' and ')}, and a separate log of calls,`
      + ' messages or enquiries with a name and a date';
  }
  return `Needs records with ${entry.needs.map(niceRole).join(' and ')}`;
}

function niceRole(role) {
  return ({
    who: 'a name', when: 'a date', due: 'a due date', amount: 'an amount',
    status: 'a status', ref: 'a reference', supplier: 'a supplier',
    slot: 'a session or booking', doc: 'a document', reply: 'a reply or response',
    promise: 'whether someone committed to call back',
  })[role] || role;
}

/** One entry by id, for creating an agent from the catalogue. */
export function entryFor(id) {
  return CATALOGUE.find((e) => e.id === id) || null;
}
