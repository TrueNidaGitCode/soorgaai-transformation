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
    eyebrow: document.getElementById('fn-eyebrow'),
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

  function card(f) {
    var ev = f.evidence || {};
    // The evidence line names the source, because "why should I believe this"
    // starts with "where did it come from".
    var from = ev.dataset ? '<p class="fn__from">Evidence <b>' + esc(ev.dataset) + '</b></p>' : '';
    var sample = ev.simulated
      ? '<p class="fn__sim">Built on the sample data this application shipped with, not your own records.</p>'
      : '';
    return '<article class="fn__card fn__card--' + esc(f.severity) + '" data-finding="' + esc(f.id) + '">'
      + '<p class="fn__sev">' + esc(LABEL[f.severity] || 'Medium') + '</p>'
      + '<h3 class="fn__cardtitle">' + esc(f.title) + '</h3>'
      + '<p class="fn__watcher">' + esc(f.watcher || 'A watcher') + ' &middot; first seen ' + esc(ago(f.since)) + '</p>'
      + from + sample
      + '<p class="fn__cta"><button type="button" class="fn__btn" data-open="' + esc(f.id) + '">View the evidence</button></p>'
      + '</article>';
  }

  function render(body) {
    var open = body.open || [];
    var counts = body.counts || {};

    el.list.innerHTML = open.map(card).join('');
    el.list.hidden = open.length === 0;
    el.empty.hidden = open.length > 0;

    if (open.length) {
      var bits = [];
      if (counts.high) bits.push(counts.high + ' high');
      if (counts.medium) bits.push(counts.medium + ' medium');
      if (counts.low) bits.push(counts.low + ' low');
      el.title.textContent = open.length === 1
        ? '1 thing needs your attention'
        : open.length + ' things need your attention';
      el.sub.textContent = bits.join(' · ');
    } else {
      el.title.textContent = 'What needs your attention';
      el.sub.textContent = '';
      /*
       * An empty board means one of three quite different things, and saying
       * the wrong one is how a working product looks broken.
       */
      if (!body.watching) {
        el.emptyTitle.textContent = 'Nothing is being watched yet.';
        el.emptyNote.textContent = 'Open Watchers to choose what this application should keep an eye on.';
      } else if (!body.everRan) {
        el.emptyTitle.textContent = 'Svarg is watching.';
        el.emptyNote.textContent = body.nextDueAt
          ? body.watching + (body.watching === 1 ? ' watcher is active. Its first check is at ' : ' watchers are active. The first check is at ') + clockTime(body.nextDueAt) + '.'
          : body.watching + ' watchers are active. The first check runs shortly.';
      } else {
        el.emptyTitle.textContent = 'Nothing needs your attention.';
        el.emptyNote.textContent = body.watching + (body.watching === 1 ? ' watcher has' : ' watchers have') + ' checked and found nothing wrong.';
      }
    }

    el.eyebrow.textContent = body.watching
      ? 'Svarg is watching · ' + body.watching + (body.watching === 1 ? ' watcher' : ' watchers')
      : 'Svarg is watching';

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
        el.list.hidden = true;
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

  window.addEventListener('svarg:findings-open', function () {
    detail.hidden = true;
    page.hidden = false;
    tellTime();
    load();
  });
}());
