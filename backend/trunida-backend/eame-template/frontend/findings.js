/**
 * What needs your attention — the first screen, and the whole of the product.
 *
 * ── What this replaced ─────────────────────────────────────────────────────
 *
 * The application opened on a compose box. That only works for somebody who
 * already suspects what is wrong: you had to know the question to get the
 * answer. Everything the watchers found sat behind the third item in the
 * sidebar, and nobody but the owner could see it at all.
 *
 * ── The rule this file follows ─────────────────────────────────────────────
 *
 * Nothing here is written by a model, and nothing here computes anything. Each
 * number on the screen was counted in code by the answer pipeline and stored
 * with the finding at the moment it was found; this file reads and renders.
 * Where a value is missing it says so rather than filling the gap.
 *
 * No chart, no score, no trend line. The question this page answers is "what
 * went wrong, or is starting to" — not "how are we doing".
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var page = document.getElementById('ch-findings');
  var detail = document.getElementById('ch-finding');
  if (!page || !detail) return;

  var el = {
    title: document.getElementById('fn-title'),
    sub: document.getElementById('fn-sub'),
    list: document.getElementById('fn-list'),
    empty: document.getElementById('fn-empty'),
    emptyTitle: document.getElementById('fn-empty-title'),
    emptyNote: document.getElementById('fn-empty-note'),
    resolved: document.getElementById('fn-resolved'),
    rhead: document.getElementById('fn-rhead'),
    rlist: document.getElementById('fn-rlist'),
    note: document.getElementById('fn-note'),
    cats: document.getElementById('fn-cats'),
    hero: document.getElementById('fn-hero'),
    greet: document.getElementById('fn-greet'),
    heroline: document.getElementById('fn-heroline'),
    herosub: document.getElementById('fn-herosub'),
    herometa: document.getElementById('fn-herometa'),
    health: document.getElementById('fn-health'),
    healthIcon: document.getElementById('fn-health-icon'),
    healthVerdict: document.getElementById('fn-health-verdict'),
    healthNote: document.getElementById('fn-health-note'),
    eg: document.getElementById('fn-eg'),
    eglist: document.getElementById('fn-eglist'),
  };

  var d = {
    back: document.getElementById('fd-back'),
    chip: document.getElementById('fd-chip'),
    title: document.getElementById('fd-title'),
    sub: document.getElementById('fd-sub'),
    rule: document.getElementById('fd-rule'),
    facts: document.getElementById('fd-facts'),
    rows: document.getElementById('fd-rows'),
    table: document.getElementById('fd-table'),
    rowsnote: document.getElementById('fd-rowsnote'),
    draft: document.getElementById('fd-draft'),
    ask: document.getElementById('fd-ask'),
    draftbox: document.getElementById('fd-draftbox'),
    drafttext: document.getElementById('fd-drafttext'),
    copy: document.getElementById('fd-copy'),
    note: document.getElementById('fd-note'),
  };

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function token() {
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  function api(path, opts) {
    var o = opts || {};
    o.headers = o.headers || {};
    o.headers.Authorization = 'Bearer ' + token();
    if (o.body) o.headers['Content-Type'] = 'application/json';
    return fetch(API + '/api/agents' + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error(body.error || 'That did not work.');
        return body;
      });
    });
  }

  /** "3 days ago" — the age of a problem is part of how bad it is. */
  function ago(iso) {
    if (!iso) return '';
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return days + ' days ago';
    if (days < 60) return Math.floor(days / 7) + ' weeks ago';
    return Math.floor(days / 30) + ' months ago';
  }

  function clockTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  var LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

  var LABEL_LONG = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };

  /*
   * ── The one answer, before the detail ──────────────────────────────────
   *
   * Six states, in this order, because the order is the whole correctness of
   * it. "Everything looks good" is only true when watchers ran and found
   * nothing — so a watcher that stopped itself, and an application whose
   * first check has not happened yet, are checked FIRST. Both would
   * otherwise render as all-clear, which is the one lie this screen must
   * never tell: somebody reads it and stops looking.
   */
  var SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/></svg>';
  var ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z"/><path d="M12 9v4M12 16.2h.01"/></svg>';
  var CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>';

  function health(body) {
    var open = (body.open || []).length;
    var counts = body.counts || {};

    if (body.degraded) {
      return {
        cls: 'is-bad', icon: ALERT, verdict: 'Needs a look',
        note: body.degraded === 1 ? '1 watcher has stopped itself' : body.degraded + ' watchers have stopped themselves',
        line: 'Some checks have stopped.',
        sub: 'They failed repeatedly and switched themselves off, so what they watched is not being watched. Open Watchers to start them again.',
      };
    }
    if (!body.watching) {
      return {
        cls: 'is-idle', icon: CLOCK, verdict: 'Not watching yet',
        note: 'Nothing is running',
        line: 'Nothing is being watched yet.',
        sub: 'Open Watchers to choose what this application should keep an eye on.',
      };
    }
    if (!body.everRan) {
      return {
        cls: 'is-idle', icon: CLOCK, verdict: 'Starting up',
        note: 'The first check has not run',
        line: 'Getting started.',
        sub: body.nextDueAt
          ? 'Nothing has been checked yet. The first check is at ' + clockTime(body.nextDueAt) + '.'
          : 'Nothing has been checked yet. The first check runs shortly.',
      };
    }
    if (counts.high) {
      return {
        cls: 'is-bad', icon: ALERT, verdict: 'Needs attention',
        note: counts.high === 1 ? '1 high priority item' : counts.high + ' high priority items',
        line: open === 1 ? '1 thing needs you today.' : open + ' things need you today.',
        sub: 'Svarg is monitoring your business, and some of what it found is worth doing first.',
      };
    }
    if (open) {
      return {
        cls: 'is-watch', icon: SHIELD, verdict: 'Worth a look',
        note: open === 1 ? '1 thing is open' : open + ' things are open',
        line: open === 1 ? '1 thing to look at.' : open + ' things to look at.',
        sub: 'Svarg is monitoring your business. Nothing urgent, but these are still open.',
      };
    }
    return {
      cls: 'is-good', icon: SHIELD, verdict: 'Healthy',
      note: 'No critical issues at the moment',
      line: 'Everything looks good!',
      sub: 'Svarg is monitoring your business. No immediate issues detected.',
    };
  }

  /** Morning, afternoon or evening — from the reader's own clock. */
  function partOfDay() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  /*
   * The name the shell already resolved from the session. Read rather than
   * fetched: this page has no business asking who somebody is a second time,
   * and an empty greeting is better than a wrong one.
   */
  function firstName() {
    var el = document.getElementById('ch-who-name');
    return (el && el.textContent || '').trim();
  }

  function drawHero(body) {
    if (!el.hero) return;
    var h = health(body);
    var name = firstName();
    var areas = (body.categories || []).length;

    el.greet.textContent = partOfDay() + (name ? ', ' + name : '') + ' 👋';
    el.heroline.textContent = h.line;
    el.herosub.textContent = h.sub;

    // What is doing the watching, stated in the customer's own units: areas
    // of their business, not a catalogue of machinery.
    var bits = [body.watching + (body.watching === 1 ? ' watcher active' : ' watchers active')];
    if (areas) bits.push(areas + (areas === 1 ? ' business area' : ' business areas'));
    el.herometa.textContent = bits.join(' · ');

    el.healthIcon.innerHTML = h.icon;
    el.healthVerdict.textContent = h.verdict;
    el.healthNote.textContent = h.note;
    el.health.className = 'fn__health ' + h.cls;
    el.hero.className = 'fn__hero ' + h.cls;
    el.hero.hidden = false;
  }

  /** Which category chip is selected. Empty means all of them. */
  var picked = '';

  /**
   * One finding as a row.
   *
   * A row rather than a card, because the point of this screen is to be read
   * down in one pass: category on the left so the eye can group, what happened
   * in the middle, how urgent and how long on the right. A wall of cards makes
   * five findings look like five separate things to deal with rather than one
   * morning's work.
   */
  function row(f) {
    var ev = f.evidence || {};
    var cat = f.category || f.watcher || '';
    var from = ev.dataset
      ? '<p class="fn__from">Evidence <b>' + esc(ev.dataset) + '</b></p>' : '';
    var sample = ev.simulated
      ? '<p class="fn__sim">Built on the sample data this application shipped with, not your own records.</p>'
      : '';
    return '<button type="button" class="fn__row fn__row--' + esc(f.severity) + '"'
      + ' data-open="' + esc(f.id) + '" data-cat="' + esc(cat) + '">'
      + '<span class="fn__rowcat">'
      +   '<span class="fn__dot" aria-hidden="true"></span>'
      +   '<span class="fn__catname">' + esc(cat) + '</span>'
      + '</span>'
      + '<span class="fn__rowbody">'
      +   '<span class="fn__rowtitle">' + esc(f.title) + '</span>'
      +   '<span class="fn__rowsub">' + esc(f.watcher || 'A watcher') + '</span>'
      +   from + sample
      + '</span>'
      + '<span class="fn__rowmeta">'
      +   '<span class="fn__pri fn__pri--' + esc(f.severity) + '">' + esc(LABEL_LONG[f.severity] || 'Medium priority') + '</span>'
      +   '<span class="fn__age">' + esc(ago(f.since)) + '</span>'
      + '</span>'
      + '<span class="fn__chev" aria-hidden="true">&rsaquo;</span>'
      + '</button>';
  }

  /**
   * One example, in the same shape as a real row so the reader learns the
   * shape -- and marked on its face so nobody can mistake it for one.
   *
   * It carries no person, no number and no date, because those are the parts
   * that would make a screenshot of this indistinguishable from a screenshot
   * of a real finding. What it does carry is true: a watcher this application
   * has, the question it actually asks, and the dataset it actually reads.
   * It is not a button, because there is nothing behind it to open.
   */
  function example(e) {
    return '<div class="fn__row fn__row--eg fn__row--' + esc(e.severity || 'medium') + '">'
      + '<span class="fn__rowcat">'
      +   '<span class="fn__dot" aria-hidden="true"></span>'
      +   '<span class="fn__catname">' + esc(e.category || '') + '</span>'
      + '</span>'
      + '<span class="fn__rowbody">'
      +   '<span class="fn__rowtitle">' + esc(e.says || '') + '</span>'
      +   '<span class="fn__rowsub">' + esc(e.watcher || '') + '</span>'
      +   (e.question ? '<p class="fn__from">Asks <b>' + esc(e.question) + '</b></p>' : '')
      + '</span>'
      + '<span class="fn__rowmeta"><span class="fn__egtag">Example</span></span>'
      + '</div>';
  }

  function drawExamples(list) {
    if (!el.eg || !el.eglist) return;
    var show = (list || []).length > 0;
    el.eg.hidden = !show;
    el.eglist.innerHTML = show ? list.map(example).join('') : '';
  }

  /**
   * The category chips.
   *
   * The words are the industry's own, read from its knowledge base at delivery
   * — Retention and Utilisation for a clinic, Schedule and Quality for an
   * engineering organisation. Only categories with something in them appear:
   * a chip leading to an empty screen is a wasted click, and what the
   * application is watching FOR belongs on the Watchers page.
   */
  function chips(cats, total) {
    if (!cats.length) { el.cats.hidden = true; return; }
    el.cats.hidden = false;
    el.cats.innerHTML =
      '<span class="fn__catslabel">' + cats.length + ' areas we&rsquo;re watching</span>'
      + '<button type="button" class="fn__chip' + (picked ? '' : ' is-on') + '" data-pick="">'
      + 'All <b>' + total + '</b></button>'
      + cats.map(function (c) {
        // A category at zero is shown, and shown as quiet rather than as
        // missing: the reader is being told it was checked, which is the
        // whole claim the product makes.
        return '<button type="button" class="fn__chip'
          + (picked === c.name ? ' is-on' : '') + (c.count ? '' : ' is-clear') + '"'
          + ' data-pick="' + esc(c.name) + '"' + (c.asks ? ' title="' + esc(c.asks) + '"' : '') + '>'
          + esc(c.name) + ' <b>' + c.count + '</b></button>';
      }).join('');
  }

  var _last = null;   // the last body, so a chip can re-filter without refetching

  function render(body) {
    _last = body;
    drawHero(body);
    var all = body.open || [];
    var counts = body.counts || {};
    var cats = body.categories || [];

    // A chip that no longer has anything under it stops being selected, rather
    // than leaving the reader on an empty screen after a finding resolves.
    if (picked && !cats.some(function (c) { return c.name === picked; })) picked = '';
    var open = picked ? all.filter(function (f) { return f.category === picked; }) : all;

    chips(cats, all.length);

    el.list.innerHTML = open.map(row).join('');
    el.list.hidden = open.length === 0;

    // Only ever on a board with nothing open, and never while a chip is
    // filtering -- an example under "Cash" would look like a Cash finding.
    drawExamples(all.length || picked ? [] : body.examples);

    /*
     * ── A quiet morning keeps the same screen ──────────────────────────────
     *
     * A board with nothing on it used to swap itself for a panel saying so.
     * That made a good day look like a broken application: the structure the
     * reader had learned — the count, the areas, the rows — disappeared, and
     * what replaced it was indistinguishable from a page that had failed to
     * load.
     *
     * So the shape never changes. The heading counts, the areas are all there
     * reading zero, and the line beneath says what the zero means. Five
     * categories at zero is a sentence: we watched all of these and they are
     * clear.
     */
    el.empty.hidden = true;

    var bits = [];
    if (counts.high) bits.push(counts.high + ' high');
    if (counts.medium) bits.push(counts.medium + ' medium');
    if (counts.low) bits.push(counts.low + ' low');

    /*
     * A heading for the list, not a second verdict.
     *
     * The count and what it means are said once, at the top, by the banner —
     * which distinguishes "checked and clear" from "nothing has run yet" and
     * from "checks have stopped", where this only ever knew the number. Two
     * headlines saying the same thing in different words is how a screen
     * stops being read.
     */
    el.title.textContent = 'What needs your attention';
    el.sub.textContent = all.length ? bits.join(' · ') : '';
    el.sub.hidden = !all.length;

    var res = body.resolved || [];
    el.resolved.hidden = res.length === 0;
    if (res.length) {
      el.rhead.textContent = res.length === 1
        ? '1 thing resolved itself'
        : res.length + ' things resolved themselves';
      el.rlist.innerHTML = res.map(function (f) {
        return '<li><b>' + esc(f.title) + '</b> <span>' + esc(f.watcher) + ' &middot; ' + esc(ago(f.resolvedAt)) + '</span></li>';
      }).join('');
    }

    // A degraded watcher is silence with a cause. Say it here, where somebody
    // is looking, rather than only on a screen they may never open.
    if (body.degraded) {
      el.note.hidden = false;
      el.note.textContent = body.degraded === 1
        ? '1 watcher stopped itself after repeated failures. Open Watchers to look at it.'
        : body.degraded + ' watchers stopped themselves after repeated failures. Open Watchers to look at them.';
    } else {
      el.note.hidden = true;
    }
  }

  function load() {
    return api('/findings')
      .then(render)
      .catch(function (err) {
        // No verdict when the findings could not be read: a banner saying
        // "everything looks good" over a failed request is the worst
        // possible combination on this screen.
        if (el.hero) el.hero.hidden = true;
        el.list.hidden = true;
        drawExamples([]);
        el.empty.hidden = false;
        el.emptyTitle.textContent = 'The findings could not be read.';
        el.emptyNote.textContent = err.message;
      });
  }

  // ── One finding, and why we believe it ────────────────────────────────────

  function facts(ev) {
    var rows = [];
    if (ev.dataset) rows.push(['Source', ev.dataset]);
    if (ev.columns && ev.columns.length) rows.push(['Fields read', ev.columns.join(', ')]);
    if (ev.window) rows.push(['Period', ev.window]);
    if (ev.records) rows.push(['Records considered', String(ev.records)]);
    if (ev.entities) rows.push(['Distinct subjects', String(ev.entities)]);
    if (ev.rows) rows.push(['Records for this one', String(ev.rows)]);
    return rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('');
  }

  function openFinding(id) {
    return api('/findings/' + encodeURIComponent(id)).then(function (body) {
      var f = body.finding || {};
      var ev = f.evidence || {};

      d.chip.textContent = (LABEL[f.severity] || 'Medium') + ' · ' + (f.watcher || 'A watcher');
      d.chip.className = 'fd__chip fd__chip--' + (f.severity || 'medium');
      d.title.textContent = f.title || f.key || 'A finding';
      d.sub.textContent = f.state === 'resolved'
        ? 'Resolved ' + ago(f.resolvedAt) + '. It was first seen ' + ago(f.since) + '.'
        : 'First seen ' + ago(f.since) + '. Last confirmed ' + ago(f.lastSeenAt) + '.';

      d.rule.textContent = ev.rule
        ? 'It was flagged because ' + ev.rule + '.'
        : 'The rule behind this finding was not recorded. Newer findings carry it.';
      d.facts.innerHTML = facts(ev);

      var lines = ev.lines || [];
      d.rows.hidden = lines.length === 0;
      if (lines.length) {
        var head = (ev.columns && ev.columns.length)
          ? '<thead><tr>' + ev.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead>'
          : '';
        d.table.innerHTML = head + '<tbody>' + lines.map(function (row) {
          return '<tr>' + (row || []).map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody>';
        // Saying how many are shown of how many there are keeps the sample
        // from reading as the whole of it.
        d.rowsnote.textContent = ev.rows && ev.rows > lines.length
          ? 'Showing ' + lines.length + ' of ' + ev.rows + ' records.'
          : '';
      }

      d.note.hidden = true;
      d.draftbox.hidden = true;
      d.drafttext.value = '';

      // Told only when somebody actually reads one: which watcher it came
      // from, never which finding.
      fetch(API + '/api/agents/findings/opened', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ watcherId: f.watcherId || '' }),
      }).catch(function () { /* telemetry must never disturb a reader */ });

      page.hidden = true;
      detail.hidden = false;
      detail.dataset.finding = f.id || '';
      detail.dataset.watcher = f.watcherId || '';
      window.scrollTo(0, 0);
    });
  }

  // ── Wiring ────────────────────────────────────────────────────────────────

  el.cats.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]');
    if (!b) return;
    // Re-filter what is already loaded rather than asking the server again:
    // the chips are a lens on one morning's findings, not a new question.
    picked = b.dataset.pick || '';
    if (_last) render(_last);
  });

  el.list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]');
    if (!b) return;
    openFinding(b.dataset.open).catch(function (err) {
      el.note.hidden = false;
      el.note.textContent = err.message;
    });
  });

  d.back.addEventListener('click', function (e) {
    e.preventDefault();
    detail.hidden = true;
    page.hidden = false;
    load();
  });

  d.ask.addEventListener('click', function () {
    /*
     * Investigation, with the finding already in the box.
     *
     * The question is seeded from what is on screen so the chat starts where
     * the reader is, rather than from an empty prompt that makes them retype
     * what they were just looking at.
     */
    var input = document.getElementById('ch-input');
    if (input) input.value = 'About "' + d.title.textContent + '": ';
    detail.hidden = true;
    if (typeof window.svargGoAsk === 'function') window.svargGoAsk();
    if (input) { input.focus(); input.selectionStart = input.value.length; }
  });

  d.draft.addEventListener('click', function () {
    d.draft.disabled = true;
    d.draft.textContent = 'Drafting…';
    api('/findings/' + encodeURIComponent(detail.dataset.finding) + '/draft', { method: 'POST', body: '{}' })
      .then(function (body) {
        d.drafttext.value = body.draft || '';
        d.draftbox.hidden = false;
      })
      .catch(function (err) { d.note.hidden = false; d.note.textContent = err.message; })
      .then(function () { d.draft.disabled = false; d.draft.textContent = 'Draft a follow-up'; });
  });

  d.copy.addEventListener('click', function () {
    d.drafttext.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(d.drafttext.value).catch(function () {});
    d.copy.textContent = 'Copied';
    setTimeout(function () { d.copy.textContent = 'Copy'; }, 1500);
  });

  /*
   * Tell the application what time it is where the owner is.
   *
   * Watchers that start themselves at delivery have no browser to ask and
   * default to UTC, so a 7am briefing fires at half past twelve in India. This
   * is the first moment the application can learn the real answer. Sent once
   * per session, ignored for anyone who is not the owner, and it only moves
   * watchers that have never run.
   */
  function tellTime() {
    try {
      if (sessionStorage.getItem('ch-tz-sent') === '1') return;
      sessionStorage.setItem('ch-tz-sent', '1');
    } catch (e) { /* private window: send it, it is idempotent */ }
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return; }
    if (!tz || tz === 'UTC') return;
    api('/timezone', { method: 'POST', body: JSON.stringify({ tz: tz }) })
      .then(function (r) { if (r && r.moved) load(); })
      .catch(function () { /* a colleague, not the owner. Nothing to say. */ });
  }

  /*
   * The health card opens Watchers.
   *
   * A card that states a verdict should be able to show its working, and in
   * every one of the six states the useful next screen is the same: what is
   * doing the watching. Stopped checks are there, so is the area nothing is
   * watching yet.
   */
  if (el.health) {
    el.health.addEventListener('click', function () {
      if (typeof window.svargShowPanel === 'function') window.svargShowPanel('agents');
      else window.location.hash = '#agents';
    });
  }
  window.addEventListener('svarg:findings-open', function () {
    detail.hidden = true;
    page.hidden = false;
    tellTime();
    load();
  });
}());
