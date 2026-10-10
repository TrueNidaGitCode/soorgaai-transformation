/**
 * What leaves this application -- the owner's view of services/egressLog.js.
 *
 * Three tabs, one per destination: what was shared with Svarg, what was
 * shared with AI, and what went to the business's own systems. Each says
 * what the destination is, counts what went there, and lists every request,
 * which opens to show exactly what it carried. The chain is checked on every
 * visit and said at the top, and the whole log can be exported for an
 * auditor who wants to check it themselves.
 *
 * A self-contained panel, like People: it shows itself only to the owner
 * (everyone else gets 403 from /api/egress and never sees the link), and an
 * error here cannot take the rest of the page with it.
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var ORDER = ['svarg', 'ai', 'own'];

  var panel = null;
  var data = null;
  var tab = 'svarg';
  var days = 30;
  var entries = [];
  var more = false;
  var open = {};

  function token() {
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function get(path) {
    return fetch(API + '/api/egress' + path, { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) {
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { var e = new Error(b.error || 'That did not work.'); e.status = r.status; throw e; });
        return r.json();
      });
  }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }
  function size(n) {
    if (!n) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function when(d) {
    if (!d) return '—';
    var t = new Date(d);
    return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', '
      + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function plural(n, one, many) { return n.toLocaleString() + ' ' + (n === 1 ? one : many); }

  function build() {
    panel = el(
      '<section class="eg" id="ch-egress" hidden aria-label="What leaves this application">'
      + '<header class="eg__head">'
      +   '<p class="eg__eyebrow">Privacy</p>'
      +   '<h1 class="eg__title">What leaves <em>this application</em></h1>'
      +   '<p class="eg__lede">Every request this application sends out is recorded as it leaves: when, where it went, which part of the application sent it, and exactly what it carried. Passwords and keys are masked. Nothing reaches the network without being written here first.</p>'
      +   '<p class="eg__chain" id="eg-chain"></p>'
      + '</header>'
      + '<div class="eg__bar">'
      +   '<div class="eg__tabs" id="eg-tabs" role="tablist" aria-label="Where it went"></div>'
      +   '<div class="eg__tools">'
      +     '<select class="eg__days" id="eg-days" aria-label="Period">'
      +       '<option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option>'
      +     '</select>'
      +     '<button type="button" class="eg__btn" data-export="csv">Export CSV</button>'
      +     '<button type="button" class="eg__btn" data-export="json">Export JSON</button>'
      +   '</div>'
      + '</div>'
      + '<div class="eg__body" id="eg-body"></div>'
      + '</section>');
    var main = document.querySelector('.ch-main') || document.body;
    var foot = main.querySelector('.ch-foot');
    if (foot) main.insertBefore(panel, foot); else main.appendChild(panel);

    panel.querySelector('#eg-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      tab = b.dataset.tab;
      open = {};
      renderTabs();
      loadEntries(false);
    });
    panel.querySelector('#eg-days').addEventListener('change', function (e) {
      days = Number(e.target.value) || 30;
      refresh();
    });
    panel.querySelector('.eg__tools').addEventListener('click', function (e) {
      var b = e.target.closest('[data-export]');
      if (b) download(b.dataset.export, b);
    });
    panel.querySelector('#eg-body').addEventListener('click', function (e) {
      var row = e.target.closest('[data-seq]');
      if (row) { toggle(Number(row.dataset.seq)); return; }
      if (e.target.closest('#eg-more')) loadEntries(true);
    });
  }

  function renderChain() {
    var c = data && data.chain;
    var p = panel.querySelector('#eg-chain');
    if (!c) { p.textContent = ''; return; }
    if (!c.entries) {
      p.className = 'eg__chain';
      p.textContent = 'Nothing has left this application since the log began.';
      return;
    }
    p.className = 'eg__chain ' + (c.ok ? 'eg__chain--ok' : 'eg__chain--bad');
    p.innerHTML = c.ok
      ? '<b>Log intact.</b> ' + esc(plural(c.entries, 'entry', 'entries')) + ' kept, each sealed with the fingerprint of the one before it, so an entry changed or removed would show here. Bodies are kept ' + esc(data.keeps.bodyDays) + ' days, entries ' + esc(data.keeps.entryDays) + '.'
      : '<b>The log does not check out.</b> ' + esc(c.reason);
  }

  function renderTabs() {
    var cats = data ? data.categories : {};
    panel.querySelector('#eg-tabs').innerHTML = ORDER.map(function (k) {
      var c = cats[k] || { label: k, count: 0 };
      return '<button type="button" role="tab" class="eg-tab' + (k === tab ? ' eg-tab--on' : '') + '" data-tab="' + k + '" aria-selected="' + (k === tab) + '">'
        + esc(c.label) + ' <span>' + Number(c.count || 0).toLocaleString() + '</span></button>';
    }).join('');
  }

  function renderBody() {
    var c = (data && data.categories[tab]) || { destinations: [], count: 0 };
    var body = panel.querySelector('#eg-body');
    var dest = c.destinations.length
      ? '<table class="eg-table"><thead><tr><th>What</th><th>Where</th><th>Requests</th><th>Data sent</th><th>Last</th></tr></thead><tbody>'
        + c.destinations.map(function (d) {
          return '<tr><td>' + esc(d.purpose) + '</td><td class="eg-host">' + esc(d.host) + '</td><td>' + Number(d.count).toLocaleString()
            + (d.failed ? ' <em class="eg-failed">' + d.failed + ' failed</em>' : '') + '</td><td>' + size(d.bytes) + '</td><td>' + when(d.last) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="eg-empty">Nothing went here in the ' + (days === 7 ? 'last 7 days' : 'last ' + days + ' days') + '.</p>';

    var list = entries.length
      ? '<h3 class="eg-h">Every request, newest first</h3><ol class="eg-list">' + entries.map(row).join('') + '</ol>'
        + (more ? '<button type="button" class="eg__btn eg-more" id="eg-more">Show older</button>' : '')
      : '';

    body.innerHTML = '<p class="eg-meaning">' + esc(c.meaning || '') + '</p>' + dest + list;
  }

  function row(e) {
    var bad = !e.status || e.status >= 400;
    var detail = open[e.seq];
    return '<li class="eg-row' + (detail ? ' eg-row--open' : '') + '">'
      + '<button type="button" class="eg-row__head" data-seq="' + e.seq + '" aria-expanded="' + (!!detail) + '">'
      +   '<span class="eg-row__when">' + when(e.at) + '</span>'
      +   '<span class="eg-row__what">' + esc(e.purpose) + (e.model ? ' <em>' + esc(e.model) + '</em>' : '') + '</span>'
      +   '<span class="eg-row__who">' + esc(e.sender) + '</span>'
      +   '<span class="eg-row__size">' + size(e.requestBytes) + '</span>'
      +   '<span class="eg-row__status' + (bad ? ' eg-row__status--bad' : '') + '">' + (e.status ? e.status : 'failed') + '</span>'
      + '</button>'
      + (detail ? details(detail) : '')
      + '</li>';
  }

  function details(d) {
    if (d === 'loading') return '<div class="eg-detail"><p class="eg-dim">Opening…</p></div>';
    var headers = Object.keys(d.headers || {}).map(function (k) { return esc(k) + ': ' + esc(d.headers[k]); }).join('\n');
    var body = d.body
      ? '<pre class="eg-pre">' + esc(d.body) + '</pre>' + (d.truncated ? '<p class="eg-dim">The body was longer than 64 KB; the first 64 KB are shown. Its fingerprint below is of all of it.</p>' : '')
      : '<p class="eg-dim">' + (d.bodyPruned ? 'The body was kept for 30 days and has been removed; its fingerprint is below.'
        : d.requestBytes ? 'Not text (' + esc(d.bodyKind) + ', ' + size(d.requestBytes) + '), so only its size and fingerprint are kept.'
        : 'No body: nothing was sent but the address.') + '</p>';
    return '<div class="eg-detail">'
      + '<dl class="eg-dl">'
      +   '<dt>Sent to</dt><dd><code>' + esc(d.method) + ' ' + esc(d.url) + '</code></dd>'
      +   '<dt>Sent by</dt><dd>' + esc(d.sender) + '</dd>'
      +   (d.model ? '<dt>Model</dt><dd>' + esc(d.model) + '</dd>' : '')
      +   '<dt>Answer</dt><dd>' + (d.status ? 'HTTP ' + esc(d.status) : 'none') + (d.error ? ' — ' + esc(d.error) : '') + ' · ' + esc(d.durationMs) + ' ms</dd>'
      +   (d.unrecordedBefore ? '<dt>Gap</dt><dd class="eg-bad">' + esc(d.unrecordedBefore) + ' request(s) before this one could not be recorded.</dd>' : '')
      + '</dl>'
      + '<p class="eg-label">Headers</p><pre class="eg-pre eg-pre--small">' + (headers || '(none)') + '</pre>'
      + '<p class="eg-label">What it carried</p>' + body
      + '<p class="eg-hash">Entry ' + esc(d.seq) + ' · body fingerprint ' + esc(d.bodySha256 || '—') + '<br>seal ' + esc(d.hash) + '<br>follows ' + esc(d.prevHash) + '</p>'
      + '</div>';
  }

  function toggle(seq) {
    if (open[seq]) { delete open[seq]; renderBody(); return; }
    open[seq] = 'loading';
    renderBody();
    get('/entry/' + seq).then(function (r) { open[seq] = r.entry; renderBody(); })
      .catch(function (err) { open[seq] = { seq: seq, method: '', url: '', error: err.message }; renderBody(); });
  }

  function loadEntries(older) {
    var before = older && entries.length ? '&before=' + entries[entries.length - 1].seq : '';
    return get('?category=' + tab + '&days=' + days + '&limit=50' + before).then(function (r) {
      entries = older ? entries.concat(r.entries) : r.entries;
      more = r.more;
      renderBody();
    }).catch(function (err) {
      panel.querySelector('#eg-body').innerHTML = '<p class="eg-bad">' + esc(err.message) + '</p>';
    });
  }

  function refresh() {
    return get('/summary?days=' + days).then(function (s) {
      data = s;
      renderChain();
      renderTabs();
      return loadEntries(false);
    });
  }

  function download(format, btn) {
    var was = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing…';
    fetch(API + '/api/egress/export?format=' + format + '&days=' + days, { headers: { Authorization: 'Bearer ' + token() } })
      .then(function (r) { if (!r.ok) throw new Error('The export did not work.'); return r.blob(); })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'what-left-this-application-' + new Date().toISOString().slice(0, 10) + '.' + format;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      })
      .catch(function (err) { alert(err.message); })
      .then(function () { btn.disabled = false; btn.textContent = was; });
  }

  function show() {
    if (typeof window.svargShowPanel === 'function') window.svargShowPanel('egress');
    else { var app = document.getElementById('ch-app'); if (app) app.hidden = true; }
    panel.hidden = false;
    refresh().catch(function (err) {
      panel.querySelector('#eg-body').innerHTML = '<p class="eg-bad">' + esc(err.message) + '</p>';
    });
  }

  /** A way in, for the owner only, beside the other entries in the sidebar. */
  function addNavItem() {
    var nav = document.querySelector('.ch-side__nav') || document.querySelector('.ch-side');
    if (!nav || document.getElementById('ch-egress-link')) return;
    var link = el('<a href="#privacy" class="ch-side__item" id="ch-egress-link" data-side="egress">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">'
      + '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>'
      + '<span>Privacy</span></a>');
    link.addEventListener('click', function (e) { e.preventDefault(); show(); });
    nav.appendChild(link);
  }

  function start() {
    if (!token()) return;
    // Only the owner gets an answer; anyone else is refused and sees nothing.
    get('?limit=1&days=1').then(function () {
      build();
      addNavItem();
      if (window.location.hash === '#privacy') show();
    }).catch(function () { /* not the owner, or not reachable */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 400); });
  else setTimeout(start, 400);
})();
