/**
 * The history of what this application caught.
 *
 * ── Why counting is the whole problem ──────────────────────────────────────
 *
 * A finding is not an event. It becomes true, stays true while nobody fixes
 * it, and the watchers re-confirm it on every run — so the same unfixed
 * problem is seen daily for as long as it lasts. Any report that counts
 * sightings rather than occurrences says a single neglected problem is a
 * worsening trend, which is precisely backwards.
 *
 * So one problem is counted once, in the period it first appeared, and the
 * fact that it is STILL open is told separately, by `carried`. Those two
 * rules are the report, and everything below exists to hold them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { windowsFor, summarise } from '../eame-template/services/reportService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/* A Thursday afternoon in Bengaluru, so the local week is Mon 28th onwards. */
const NOW = new Date('2026-10-01T09:00:00Z');
const TZ = 'Asia/Calcutta';
const wins = windowsFor(NOW, TZ);

const f = (name, firstSeenAt, extra = {}) => ({
  agentName: name, severity: 'medium', state: 'open', firstSeenAt: new Date(firstSeenAt), ...extra,
});

describe('one problem is one occurrence', () => {
  it('counts it in the period it first appeared', () => {
    const r = summarise([f('No Show', '2026-09-29T06:00:00Z')], wins.week);
    expect(r.totals.appeared).toBe(1);
  });

  it('does not count it again for every day it stays true', () => {
    /*
     * The whole reason this file exists. A finding re-confirmed daily for a
     * fortnight is one row with a lastSeenAt that keeps moving — not fourteen
     * occurrences — and the report must read it that way.
     */
    const stillTrue = f('No Show', '2026-09-29T06:00:00Z', { lastSeenAt: new Date(NOW) });
    const r = summarise([stillTrue], wins.week);
    expect(r.totals.appeared).toBe(1);
    expect(r.problems[0].appeared).toBe(1);
  });

  it('does not count it in a later period, even though it is still open', () => {
    // It appeared in September. October did not acquire a new problem by
    // failing to fix September's.
    const old = f('No Show', '2026-09-29T06:00:00Z');
    expect(summarise([old], wins.month).totals.appeared).toBe(0);
  });

  it('says it is still there instead, which is the worse news', () => {
    const old = f('No Show', '2026-09-29T06:00:00Z');
    const r = summarise([old], wins.month);
    expect(r.totals.carried).toBe(1);
    expect(r.totals.open).toBe(1);
  });

  it('stops carrying it once it is resolved', () => {
    const fixed = f('No Show', '2026-09-29T06:00:00Z', { state: 'resolved', resolvedAt: new Date('2026-09-30T06:00:00Z') });
    const r = summarise([fixed], wins.month);
    expect(r.totals.carried).toBe(0);
    expect(r.totals.open).toBe(0);
  });
});

describe('what was fixed', () => {
  it('counts a resolution in the period it happened', () => {
    const fixed = f('Empty Slot', '2026-09-29T06:00:00Z', { state: 'resolved', resolvedAt: new Date('2026-09-30T10:00:00Z') });
    expect(summarise([fixed], wins.week).totals.resolved).toBe(1);
    // Resolved in September, so October reports nothing fixed.
    expect(summarise([fixed], wins.month).totals.resolved).toBe(0);
  });
});

/**
 * ── The comparison, and the way it was wrong ──────────────────────────────
 *
 * Measured on a real application. October reported "3 last month" when
 * September had eleven: the eight fixed in September had nothing to say about
 * October, so they were filtered out of the table — and the filtered table
 * was also what the comparison was summed from.
 *
 * A quiet month therefore looked like an improvement on a month that was
 * quietly worse. That is the one direction a report like this must never be
 * wrong in, because it is the direction nobody checks.
 */
describe('the comparison with the period before', () => {
  const septemberFixed = [
    f('Unstaffed Session', '2026-09-29T06:00:00Z', { state: 'resolved', resolvedAt: new Date('2026-09-29T10:00:00Z') }),
    f('Unstaffed Session', '2026-09-29T06:00:00Z', { state: 'resolved', resolvedAt: new Date('2026-09-29T10:00:00Z') }),
    f('Empty Slot', '2026-09-29T06:00:00Z', { state: 'resolved', resolvedAt: new Date('2026-09-29T10:00:00Z') }),
  ];

  it('counts every problem last month had, not only the ones still listed', () => {
    const r = summarise(septemberFixed, wins.month);
    expect(r.totals.appeared).toBe(0);
    expect(r.totals.before).toBe(3);
    expect(r.totals.change).toBe(-3);
  });

  it('leaves them out of the table, which is a different question', () => {
    // Nothing to report this month, so listing them with five zeros would
    // bury the rows that do have something to say.
    expect(summarise(septemberFixed, wins.month).problems).toEqual([]);
  });

  it('is a count and not a percentage', () => {
    // Two against one is "up 100%", which sounds like a crisis and is two
    // findings. The number is given and the reader can divide.
    const r = summarise([f('No Show', '2026-09-29T06:00:00Z')], wins.week);
    expect(typeof r.totals.change).toBe('number');
    expect(JSON.stringify(r.totals)).not.toMatch(/percent|pct|%/i);
  });
});

describe('the periods are the ones a business uses', () => {
  it('starts the week on Monday, locally', () => {
    // 2026-10-01 is a Thursday in Bengaluru; the week began Monday the 28th.
    expect(wins.week.since).toContain('2026-09-28');
  });

  it('is a local week, not a UTC one', () => {
    /*
     * A week that ends at 05:30 on Monday morning is not a week anybody runs
     * a business by. Monday 00:00 IST is Sunday 18:30 UTC.
     */
    expect(wins.week.from.toISOString()).toBe('2026-09-27T18:30:00.000Z');
  });

  it('starts the month on the first and the year on the first of January', () => {
    expect(wins.month.from.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(wins.ytd.from.toISOString()).toBe('2025-12-31T18:30:00.000Z');
  });

  it('compares year to date against the same point last year', () => {
    // Eight months against twelve would show a fall every August.
    expect(wins.ytd.previous.to.getTime()).toBeLessThan(NOW.getTime());
    expect(wins.ytd.previousLabel).toContain('same point last year');
  });

  it('survives a timezone nobody has heard of', () => {
    const w = windowsFor(NOW, 'Mars/Olympus');
    expect(w.week.from instanceof Date).toBe(true);
    expect(Number.isNaN(w.week.from.getTime())).toBe(false);
  });
});

describe('an application that has found nothing', () => {
  it('says so rather than showing an empty table of zeros', () => {
    const r = summarise([], wins.week);
    expect(r.problems).toEqual([]);
    expect(r.totals.appeared).toBe(0);
    expect(r.totals.open).toBe(0);
    expect(r.totals.change).toBe(0);
  });
});

describe('how it is reached, and who may read it', () => {
  const routes = read('../eame-template/routes/reportsRoutes.js');
  const ui = read('../eame-template/frontend/reports.js');
  const html = read('../eame-template/frontend/index.html');

  it('is readable by anyone signed in, not only the owner', () => {
    /*
     * The same argument the findings list already settled: the people who
     * would act on a problem are not the person who owns the application, and
     * a history only the owner can read is a history nobody reads.
     */
    expect(routes).toContain("router.get('/', protect, reportsHandler)");
    expect(routes).not.toContain('ownerOnly');
  });

  it('is on the sidebar and switches like every other panel', () => {
    expect(html).toContain('data-side="reports"');
    expect(html).toContain("reports: 'ch-reports'");
    expect(html).toContain("'ch-reports'");
    expect(html).toContain("svarg:reports-open");
    expect(html).toContain('src="reports.js"');
  });

  it('computes nothing in the browser', () => {
    // A second opinion about a number is a number nobody can defend.
    expect(ui).not.toMatch(/firstSeenAt|resolvedAt/);
  });

  it('says what it counted, where the numbers are', () => {
    // Without it, "Appeared" could be read as how many times the watchers saw
    // the problem — a much larger and much less useful number.
    expect(ui).toContain('counted once, in the period it first appeared');
  });
});

describe('it reaches a customer at all', () => {
  const spec = read('../services/eameSpec.js');
  const builder = read('../services/eameProjectBuilder.js');

  it('is listed in both registries, or it ships to nobody', () => {
    for (const p of [
      'services/reportService.js',
      'controllers/reportsController.js',
      'routes/reportsRoutes.js',
      'frontend/reports.js',
    ]) {
      expect(spec, `${p} missing from FIXED_PATHS`).toContain(p);
      expect(builder, `${p} missing from the source map`).toContain(p);
    }
  });
});

/**
 * The bar has to add up.
 *
 * A stacked bar whose segments do not sum to the bar they sit in is a lie
 * drawn to scale, and it is the easy mistake here: `resolved` counts
 * resolutions that happened in the window — which may belong to findings from
 * months earlier — and `open` counts everything true right now, including what
 * was carried in. Neither is a part of `appeared`.
 *
 * `stillOpen` is the one that is: of the findings that appeared in THIS
 * window, how many are still true. So appeared = dealt with + stillOpen, and
 * the chart may split the bar on it.
 */
describe('splitting the bar', () => {
  it('counts only what appeared in the window and is still true', () => {
    const rows = [
      f('No Show', '2026-09-29T06:00:00Z'),
      f('No Show', '2026-09-29T07:00:00Z', { state: 'resolved', resolvedAt: new Date('2026-09-30T06:00:00Z') }),
    ];
    const r = summarise(rows, wins.week);
    expect(r.problems[0].appeared).toBe(2);
    expect(r.problems[0].stillOpen).toBe(1);
  });

  it('never exceeds the bar it is drawn inside', () => {
    const rows = [
      f('A', '2026-09-29T06:00:00Z'),
      f('A', '2026-09-29T06:00:00Z'),
      // Appeared before the window and still open: it is carried, not part of
      // this period's bar.
      f('A', '2026-08-01T06:00:00Z'),
    ];
    const r = summarise(rows, wins.week);
    const p = r.problems[0];
    expect(p.appeared).toBe(2);
    expect(p.stillOpen).toBe(2);
    expect(p.stillOpen).toBeLessThanOrEqual(p.appeared);
    expect(p.carried).toBe(1);
    // open counts everything true now, which is MORE than the bar — which is
    // exactly why it may not be used to split it.
    expect(p.open).toBe(3);
  });

  it('is excluded from a bar whose problem appeared earlier', () => {
    const old = f('A', '2026-08-01T06:00:00Z');
    const r = summarise([old], wins.week);
    expect(r.problems[0].appeared).toBe(0);
    expect(r.problems[0].stillOpen).toBe(0);
  });

  it('totals the same way', () => {
    const rows = [
      f('A', '2026-09-29T06:00:00Z'),
      f('B', '2026-09-29T06:00:00Z', { state: 'resolved', resolvedAt: new Date('2026-09-30T06:00:00Z') }),
    ];
    const t = summarise(rows, wins.week).totals;
    expect(t.appeared).toBe(2);
    expect(t.stillOpen).toBe(1);
  });
});

describe('the chart', () => {
  const ui = read('../eame-template/frontend/reports.js');
  const css = read('../eame-template/frontend/app.css');

  it('is sized as a share of the widest bar, so it fits whatever screen it is on', () => {
    expect(ui).toContain('var share = max ? (total / max) * 100 : 0;');
    // Plain substrings rather than a pattern: the line being checked is itself
    // full of quotes and plus signs, and every attempt to escape it as a regex
    // produced an assertion that matched nothing and said so unhelpfully.
    expect(ui).toContain('class="rp-bar" style="width:');
    expect(ui).toContain('+ share +');
  });

  it('splits the bar on stillOpen and nothing else', () => {
    // resolved and open are not parts of appeared; using either would draw
    // segments that overflow or underfill their own bar.
    expect(ui).toContain("p.stillOpen");
    expect(ui).not.toMatch(/openPart[^;]*p\.(open|resolved)\b/);
  });

  it('survives a server that does not send stillOpen yet', () => {
    // During a rolling deploy a page can be newer than the API answering it,
    // and an unguarded undefined drew every bar empty.
    expect(ui).toContain("p[metric]) || 0;");
  });

  it('charts what is open when nothing new appeared, rather than a row of nothing', () => {
    expect(ui).toContain("var metric = r.totals.appeared ? 'appeared' : 'open';");
    expect(ui).toContain('Nothing new appeared, so this is what is still open from before.');
  });

  it('says which shade is which, because a colour needs a legend', () => {
    expect(ui).toContain('still open');
    expect(ui).toContain('dealt with');
    expect(css).toContain('.rp-key__sw--open');
    expect(css).toContain('.rp-key__sw--done');
  });

  it('left no table behind', () => {
    expect(ui).not.toContain('<table');
    expect(css).not.toContain('.rp-table');
  });
});

describe('it is laid out like the rest of the application', () => {
  const css = read('../eame-template/frontend/app.css');
  const block = (sel) => {
    const at = css.indexOf(sel + ' {');
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it('fills the screen, as the board does', () => {
    /*
     * It shipped as a centred 1000px column copied from the Watchers page,
     * which put it in the middle of the screen beside a Home page that fills
     * it. Two screens about the same findings, aligned differently, reads as a
     * mistake before anybody works out which one it is.
     */
    expect(block('.rp')).toContain('max-width: none');
    expect(block('.rp')).not.toContain('margin: 0 auto');
  });

  it('uses the same gutter as the board', () => {
    const gutter = 'padding: 34px clamp(16px, 4vw, 48px) 72px;';
    expect(block('.rp')).toContain(gutter);
    expect(block('.fn')).toContain(gutter);
  });
});
