/**
 * What went wrong, over a week, a month, and the year so far.
 *
 * ── The question this answers, and the one it does not ─────────────────────
 *
 * The board answers "what needs attention now". It is a list of what is true
 * this morning, and by design it forgets: a problem that was found and fixed
 * in March leaves no mark on it. So an owner can run this application for six
 * months and still not be able to say what it caught, which is the question
 * they ask when deciding whether to keep paying for it.
 *
 * This is that history. Not a second board — the same findings, counted.
 *
 * ── What counts as one occurrence ──────────────────────────────────────────
 *
 * A finding is not an event. It is a thing that became true, stayed true while
 * nobody fixed it, and then stopped. The watchers re-confirm it on every run,
 * so the same unfixed problem is seen daily for as long as it lasts.
 *
 * So an occurrence is counted in the period it FIRST appeared, and never
 * again. A patient who stopped coming in January is one occurrence in January,
 * not one in every week since. Counting re-confirmations would make a single
 * unfixed problem look like a worsening trend, which is exactly backwards: an
 * old problem that nobody has dealt with is a worse story than a new one, and
 * it should read as one line that will not go away rather than as thirty.
 *
 * `carried` is how that is told honestly. It counts what was already open when
 * the period began — so "3 new this week" beside "14 carried in" says
 * something very different from "3 new" alone.
 *
 * ── Local weeks, not UTC weeks ─────────────────────────────────────────────
 *
 * A week that ends at 05:30 on Monday morning is not a week anybody runs a
 * business by. Period boundaries are computed in the application's own
 * timezone, taken from the watchers, because that is where the owner already
 * set it — see adoptTimezone.
 */
import { findingsCollection, agentsCollection, localParts } from './agentService.js';
import mongoose from 'mongoose';

export const PERIODS = ['week', 'month', 'ytd'];

/** The local calendar day, as "YYYY-MM-DD", for a moment. */
function dayIn(at, tz) {
  return localParts(at, tz).day;
}

/**
 * How far ahead of UTC a timezone is at a given instant, in milliseconds.
 *
 * Formatted in the zone and read back as though it were UTC; the difference
 * IS the offset. Measured rather than tabulated because an offset is not a
 * property of a zone — it changes at a DST boundary, and several zones are
 * not whole hours from UTC in the first place.
 */
function offsetAt(at, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'UTC', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const x of f.formatToParts(at)) p[x.type] = x.value;
    // "24" is midnight in some locales' 2-digit hour formatting.
    const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return asIfUtc - at.getTime();
  } catch {
    // An unknown timezone must not stop the report being produced.
    return 0;
  }
}

/**
 * The instant a local day begins, as a UTC Date.
 *
 * Exactly, to the millisecond. This was a binary search once and it stopped
 * at minute precision, so every period began 56 seconds late — harmless until
 * something happens in that minute, and then silently absent from the report.
 *
 * The second reading is what handles a DST transition: the offset that applies
 * at the computed instant can differ from the one at the guess, and where it
 * does, the guess is corrected with it.
 */
function startOfLocalDay(day, tz) {
  const asUtc = new Date(`${day}T00:00:00Z`);
  const first = offsetAt(asUtc, tz);
  const t = asUtc.getTime() - first;
  const second = offsetAt(new Date(t), tz);
  return new Date(second === first ? t : asUtc.getTime() - second);
}

const DAY_MS = 86400e3;

/**
 * The three windows, each with the one before it for comparison.
 *
 * The week runs Monday to now, which is the week a business talks about. The
 * month is the calendar month. Year to date is January 1st to now, and its
 * comparison is the same stretch of last year rather than all of last year —
 * comparing eight months against twelve would show a fall every August.
 */
export function windowsFor(now = new Date(), tz = 'UTC') {
  const today = dayIn(now, tz);
  const [y, m] = today.split('-').map(Number);

  const parts = localParts(now, tz);
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sinceMonday = Math.max(0, WEEKDAYS.indexOf(parts.weekday));
  const weekStartDay = dayIn(new Date(startOfLocalDay(today, tz).getTime() - sinceMonday * DAY_MS + 3600e3), tz);

  const weekFrom = startOfLocalDay(weekStartDay, tz);
  const lastWeekFrom = new Date(weekFrom.getTime() - 7 * DAY_MS);

  const monthFrom = startOfLocalDay(`${today.slice(0, 7)}-01`, tz);
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const lastMonthFrom = startOfLocalDay(`${prevMonth}-01`, tz);

  const ytdFrom = startOfLocalDay(`${y}-01-01`, tz);
  const lastYtdFrom = startOfLocalDay(`${y - 1}-01-01`, tz);
  const lastYtdTo = new Date(now.getTime() - 365 * DAY_MS);

  return {
    week: {
      key: 'week', label: 'This week', since: `Since Monday, ${weekStartDay}`,
      from: weekFrom, to: now, previous: { from: lastWeekFrom, to: weekFrom }, previousLabel: 'last week',
    },
    month: {
      key: 'month', label: 'This month', since: `Since ${today.slice(0, 7)}-01`,
      from: monthFrom, to: now, previous: { from: lastMonthFrom, to: monthFrom }, previousLabel: 'last month',
    },
    ytd: {
      key: 'ytd', label: 'Year to date', since: `Since ${y}-01-01`,
      from: ytdFrom, to: now,
      previous: { from: lastYtdFrom, to: lastYtdTo }, previousLabel: 'the same point last year',
    },
  };
}

const inWindow = (at, from, to) => {
  if (!at) return false;
  const t = new Date(at).getTime();
  return t >= from.getTime() && t < to.getTime();
};

/**
 * One window, counted.
 *
 * Pure over the findings it is given, so the rules above can be argued about
 * in a test rather than against a customer's database.
 */
export function summarise(findings = [], win) {
  const by = new Map();
  const at = (name, severity) => {
    if (!by.has(name)) {
      by.set(name, {
        problem: name, severity: severity || 'medium',
        appeared: 0, resolved: 0, open: 0, carried: 0,
        /*
         * Of the ones that appeared in this window, how many are still true.
         *
         * Needed because `resolved` and `open` cannot be drawn as parts of
         * `appeared` — `resolved` counts resolutions that happened in the
         * window, which may belong to findings from months earlier, and
         * `open` counts everything true right now including what was carried
         * in. Stacking either inside the appeared bar would be a chart whose
         * segments do not add up to the bar they are in.
         *
         * This one does: appeared = (appeared and since fixed) + stillOpen.
         */
        stillOpen: 0,
        before: 0, firstAt: null, lastAt: null,
      });
    }
    return by.get(name);
  };

  for (const f of findings) {
    const name = f.agentName || 'Unnamed watcher';
    const row = at(name, f.severity);
    const first = f.firstSeenAt ? new Date(f.firstSeenAt) : null;

    if (inWindow(first, win.from, win.to)) {
      row.appeared += 1;
      if (f.state !== 'resolved') row.stillOpen += 1;
      if (!row.firstAt || first < row.firstAt) row.firstAt = first;
      if (!row.lastAt || first > row.lastAt) row.lastAt = first;
    }
    if (inWindow(f.resolvedAt, win.from, win.to)) row.resolved += 1;
    if (f.state !== 'resolved') row.open += 1;

    /*
     * Already open when the period began. Counted separately because "3 new
     * this week" beside "14 carried in" is a different business than "3 new"
     * on its own — and the carried ones are the older problem.
     */
    if (first && first < win.from && f.state !== 'resolved') row.carried += 1;
    if (inWindow(first, win.previous.from, win.previous.to)) row.before += 1;
  }

  const all = [...by.values()];

  /*
   * Shown: the problems this period has something to say about.
   *
   * A problem that appeared last month, was fixed, and has not come back has
   * nothing to report THIS month, and listing it with five zeros would bury
   * the rows that matter.
   */
  const rows = all
    .filter((r) => r.appeared || r.resolved || r.open || r.carried)
    .sort((a, b) => b.appeared - a.appeared || b.open - a.open || a.problem.localeCompare(b.problem));

  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  const appeared = sum('appeared');

  /*
   * But the comparison is counted over ALL of them, not the shown ones.
   *
   * Measured on a real application and wrong the first time: October reported
   * "3 last month" when September had eleven. The eight that were fixed in
   * September had nothing to say about October, so they were filtered out of
   * the table — and the filtered table was also what the comparison was
   * summed from. A quiet month therefore looked like an improvement on a
   * month that was quietly worse, which is the one direction a report of this
   * kind must never be wrong in.
   */
  const before = all.reduce((n, r) => n + r.before, 0);

  return {
    period: win.key,
    label: win.label,
    since: win.since,
    from: win.from,
    to: win.to,
    previousLabel: win.previousLabel,
    problems: rows,
    totals: {
      appeared,
      resolved: sum('resolved'),
      open: sum('open'),
      carried: sum('carried'),
      kinds: rows.filter((r) => r.appeared).length,
      stillOpen: sum('stillOpen'),
      before,
      /*
       * The change, as a count and not as a percentage.
       *
       * A percentage on small numbers is theatre: two findings against one is
       * "up 100%", which sounds like a crisis and is two findings. The number
       * is given and the reader can divide.
       */
      change: appeared - before,
    },
  };
}

/** The timezone this application runs in, taken from where the owner set it. */
export async function appTimezone() {
  if (mongoose.connection.readyState !== 1) return 'UTC';
  const agents = await agentsCollection().find({}, { projection: { tz: 1 } }).toArray().catch(() => []);
  const count = new Map();
  for (const a of agents) {
    const tz = String(a.tz || 'UTC');
    count.set(tz, (count.get(tz) || 0) + 1);
  }
  let best = 'UTC';
  let most = 0;
  for (const [tz, n] of count) if (n > most) { best = tz; most = n; }
  return best;
}

/**
 * All three reports, from one read.
 *
 * One read rather than three: the windows overlap almost entirely, and a
 * customer's whole finding history is small — one row per problem that has
 * ever been true, not one per check.
 */
export async function reports(now = new Date()) {
  if (mongoose.connection.readyState !== 1) {
    return { timezone: 'UTC', generatedAt: now, reports: [], total: 0 };
  }
  const tz = await appTimezone();
  const wins = windowsFor(now, tz);

  const findings = await findingsCollection()
    .find({}, { projection: { agentName: 1, severity: 1, state: 1, firstSeenAt: 1, resolvedAt: 1 } })
    .toArray()
    .catch(() => []);

  return {
    timezone: tz,
    generatedAt: now,
    total: findings.length,
    reports: PERIODS.map((p) => summarise(findings, wins[p])),
  };
}
