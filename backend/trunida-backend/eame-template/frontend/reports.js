/**
 * What went wrong, over a week, a month, and the year so far.
 *
 * ── Why this screen exists beside the board ───────────────────────────────
 *
 * The board answers "what needs attention now", and by design it forgets. A
 * problem found and fixed in March leaves no mark on it. So an owner can run
 * this application for six months and still not be able to say what it caught
 * — which is the question they ask when deciding whether it was worth it.
 *
 * Everything here is the same findings, counted. Nothing new is computed in
 * the browser: the server decides what an occurrence is, because a second
 * opinion about a number is a number nobody can defend.
 */
(function reports() {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var page = document.getElementById('ch-reports');
  if (!page) return;

  var body = document.getElementById('rp-body');
  var tabs = document.getElementById('rp-tabs');
  var note = document.getElementById('rp-note');

  /** Which period is on screen. The week first: it is the one acted on. */
  var period = 'week';
  var board = null;

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function token() {
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  function api(path) {
    return fetch(API + '/api/reports' + path, {
      headers: { Authorization: 'Bearer ' + token() },
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) throw new Error(b.error || 'That did not work.');
        return b;
      });
    });
  }

  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };

  /**
   * The change, said in words rather than as an arrow.
   *
   * An arrow needs a legend: is down good? Here it always is — fewer problems
   * appeared — but that is only obvious once somebody says it, so it is said.
   */
  function trend(t, previousLabel) {
    if (!t.before && !t.appeared) return '';
    if (t.change === 0) return 'The same as ' + esc(previousLabel) + '.';
    var worse = t.change > 0;
    return '<span class="rp-trend rp-trend--' + (worse ? 'up' : 'down') + '">'
      + (worse ? '+' : '') + t.change + '</span> against ' + esc(previousLabel)
      + ' (' + t.before + ').';
  }

  /**
   * The headline, which has to survive being read on its own.
   *
   * "12 problems" means nothing without saying 12 of what, over what, and
   * whether that is a lot. So the sentence carries the count, the kinds, and
   * the comparison, and the three tiles under it break it apart.
   */
  function headline(r) {
    var t = r.totals;
    if (!t.appeared && !t.open && !t.carried) {
      return '<p class="rp-head__line">Nothing was found in this period, and nothing is open.</p>'
        + '<p class="rp-head__sub">' + esc(r.since) + '.</p>';
    }
    var kinds = t.kinds
      ? ' across ' + plural(t.kinds, 'kind of problem', 'kinds of problem')
      : '';
    return '<p class="rp-head__line">'
      + '<strong>' + plural(t.appeared, 'new problem', 'new problems') + '</strong>'
      + kinds + '. ' + trend(t, r.previousLabel) + '</p>'
      + '<p class="rp-head__sub">' + esc(r.since) + '.</p>';
  }

  function tiles(r) {
    var t = r.totals;
    var one = function (k, v, n) {
      return '<div class="rp-tile"><span class="rp-tile__k">' + k + '</span>'
        + '<strong class="rp-tile__v">' + v + '</strong>'
        + (n ? '<span class="rp-tile__n">' + n + '</span>' : '') + '</div>';
    };
    return '<div class="rp-tiles">'
      + one('Appeared', t.appeared, 'first seen in this period')
      + one('Resolved', t.resolved, 'stopped being true')
      + one('Still open', t.open, 'true right now')
      /*
       * Carried in is the uncomfortable number and it is shown last, where a
       * reader lands after the three that flatter. An old problem nobody has
       * dealt with is a worse story than a new one.
       */
      + one('Carried in', t.carried, 'already open when this period began')
      + '</div>';
  }

  function table(r) {
    if (!r.problems.length) {
      return '<p class="rp-empty">No problems have been recorded in this period.</p>';
    }
    var rows = r.problems.map(function (p) {
      return '<tr>'
        + '<td class="rp-what"><span class="rp-sev rp-sev--' + esc(p.severity) + '"></span>'
        + esc(p.problem) + '</td>'
        + '<td class="rp-n"><strong>' + p.appeared + '</strong></td>'
        + '<td class="rp-n">' + p.resolved + '</td>'
        + '<td class="rp-n">' + p.open + '</td>'
        + '<td class="rp-n rp-n--soft">' + (p.carried || '') + '</td>'
        + '</tr>';
    }).join('');

    return '<table class="rp-table">'
      + '<thead><tr>'
      + '<th scope="col">Problem</th>'
      + '<th scope="col" class="rp-n">Appeared</th>'
      + '<th scope="col" class="rp-n">Resolved</th>'
      + '<th scope="col" class="rp-n">Open</th>'
      + '<th scope="col" class="rp-n">Carried in</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function draw() {
    if (!board) return;
    var r = null;
    for (var i = 0; i < board.reports.length; i += 1) {
      if (board.reports[i].period === period) r = board.reports[i];
    }
    if (!r) { body.innerHTML = '<p class="rp-empty">Nothing to show.</p>'; return; }

    tabs.innerHTML = board.reports.map(function (x) {
      return '<button type="button" class="rp-tab' + (x.period === period ? ' rp-tab--on' : '')
        + '" data-period="' + esc(x.period) + '" aria-selected="' + (x.period === period) + '">'
        + esc(x.label) + '<span>' + x.totals.appeared + '</span></button>';
    }).join('');

    body.innerHTML = '<div class="rp-head">' + headline(r) + '</div>' + tiles(r) + table(r);

    /*
     * The counting rule, written where the numbers are.
     *
     * Without it "Appeared" is ambiguous — a reader could reasonably take it
     * as how many times the watchers saw the problem, which would be a much
     * larger and much less useful number.
     */
    note.innerHTML = 'A problem is counted once, in the period it first appeared &mdash; '
      + 'not again each day it stays true. Times are '
      + esc(board.timezone || 'UTC') + '.';
  }

  /**
   * Fetch, and redraw.
   *
   * The placeholder is shown only when there is nothing on screen yet.
   * Re-opening the screen — or opening it twice quickly, which the shell makes
   * easy — otherwise replaced a drawn report with "Reading the history…" and
   * then drew the same numbers again, so the screen flickered for no reason
   * and briefly showed less than it already knew.
   */
  function load() {
    if (!board) body.innerHTML = '<p class="rp-empty">Reading the history&hellip;</p>';
    api('/').then(function (b) {
      board = b;
      draw();
    }).catch(function (err) {
      // An error must not wipe a report that is already readable.
      if (!board) body.innerHTML = '<p class="rp-empty rp-empty--bad">' + esc(err.message) + '</p>';
    });
  }

  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-period]');
    if (!b) return;
    period = b.dataset.period;
    draw();
  });

  window.addEventListener('svarg:reports-open', function () {
    page.hidden = false;
    load();
  });

  // The shell may have opened this screen while this deferred script was
  // still parsing, in which case the event above has already been and gone.
  if (!page.hidden) load();
}());
