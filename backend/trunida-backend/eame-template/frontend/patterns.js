/**
 * Learned churn patterns — the two places a person meets them.
 *
 * On the Agents page: what the application learned from the customers who
 * left, each pattern with its own numbers, and (for the owner) the choice to
 * watch for it or dismiss it. Nothing learned ever alerts until the owner
 * says so.
 *
 * On the Data page: what "a lost customer" means here, as one sentence, and
 * (for the owner) the two numbers that change it.
 *
 * Fixed runtime, like agents.js and data.js: the same in every application.
 * It inserts its own two panels (#pt-*) and touches nothing else.
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var agents = document.getElementById('ch-agents');
  var data = document.getElementById('ch-data');
  if (!agents && !data) return;

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
    return fetch(API + '/api/patterns' + (path || ''), o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error(body.error || ('Request failed (' + r.status + ')'));
        return body;
      });
    });
  }

  // ── The panels, created once ───────────────────────────────────────────
  var learned = null;
  if (agents) {
    learned = document.createElement('section');
    learned.className = 'pt';
    learned.id = 'pt-learned';
    learned.setAttribute('aria-label', 'Patterns learned from customers who left');
    var map = document.getElementById('ag-map');
    if (map && map.parentNode) map.parentNode.insertBefore(learned, map);
    else agents.appendChild(learned);
  }
  var lost = null;
  if (data) {
    lost = document.createElement('section');
    lost.className = 'pt pt--lost';
    lost.id = 'pt-lost';
    lost.setAttribute('aria-label', 'When a customer counts as lost');
    var room = document.getElementById('dt-room');
    if (room) room.appendChild(lost); else data.appendChild(lost);
  }

  var state = null;

  function statusLine(s) {
    if (!s || !s.learnedAt) return 'Not learned yet. The first look happens a few minutes after this application starts.';
    var from = 'Learned from ' + s.churned + ' customer' + (s.churned === 1 ? '' : 's') + ' who left and ' + s.stayed + ' who stayed';
    var sample = s.simulated ? ' — in the sample data this application shipped with, not yet yours' : '';
    if (!s.enough) {
      return 'Still learning: ' + s.churned + ' customer' + (s.churned === 1 ? ' has' : 's have') + ' left so far, and patterns need at least ' +
        (s.minChurned || 20) + sample + '. Until then the standard agents keep watching.';
    }
    return from + sample + '.';
  }

  function badge(p) {
    if (p.state === 'approved') return '<span class="pt-badge pt-badge--on">Watching</span>';
    if (p.state === 'fading') return '<span class="pt-badge pt-badge--fade">Fading — weaker than when you chose it</span>';
    return '<span class="pt-badge">Suggested</span>';
  }

  function renderLearned() {
    if (!learned || !state) return;
    var ps = state.patterns || [];
    var manage = !!state.canManage;
    var items = ps.map(function (p) {
      var actions = '';
      if (manage && p.state === 'candidate') {
        actions = '<div class="pt-card__actions">' +
          '<button type="button" class="pt-go" data-approve="' + esc(p.id) + '">Watch for it</button>' +
          '<button type="button" class="pt-no" data-dismiss="' + esc(p.id) + '">Dismiss</button></div>';
      }
      var sigs = (p.signals || []).map(function (s) { return '<li>' + esc(s.label) + '</li>'; }).join('');
      return '<article class="pt-card">' +
        '<div class="pt-card__top">' + badge(p) + (p.simulated ? '<span class="pt-badge pt-badge--sample">Sample data</span>' : '') + '</div>' +
        '<ul class="pt-card__signals">' + sigs + '</ul>' +
        '<p class="pt-card__why">' + esc(p.sentence) + '</p>' +
        (p.openNow != null ? '<p class="pt-card__now">' + (p.openNow ? p.openNow + ' customer' + (p.openNow === 1 ? ' shows' : 's show') + ' it now, on the findings board.' : 'Nobody shows it right now.') + '</p>' : '') +
        actions + '</article>';
    }).join('');

    learned.innerHTML =
      '<header class="pt__head">' +
        '<p class="pt__eyebrow">Learned from your customers</p>' +
        '<h2 class="pt__title">Patterns that came before customers <em>left</em></h2>' +
        '<p class="pt__lede">' + esc(statusLine(state.status)) + '</p>' +
        '<p class="pt__fine">A pattern is what came before leaving in your own records, not a certainty about anyone. Nothing here sends an alert until it is chosen.</p>' +
      '</header>' +
      (ps.length ? '<div class="pt-cards">' + items + '</div>' : '') +
      (manage ? '<p class="pt__more"><button type="button" class="pt-link" data-learn="1">Look again now</button></p>' : '') +
      '<p class="pt-note" id="pt-note" hidden></p>';
  }

  function renderLost() {
    if (!lost || !state) return;
    var d = state.definition || {};
    var manage = !!state.canManage;
    var form = manage
      ? '<form class="pt-form" id="pt-def-form">' +
          '<label class="pt-form__row"><span>No activity for</span>' +
            '<input type="number" min="7" max="1095" id="pt-days" class="pt-input" value="' + esc(d.inactiveDays || '') + '" placeholder="' + esc(d.inactiveDays ? '' : 'auto') + '"> <span>days</span></label>' +
          '<label class="pt-form__row pt-form__row--wide"><span>or a last record that says</span>' +
            '<input type="text" id="pt-words" class="pt-input pt-input--wide" value="' + esc((d.statusWords || []).join(', ')) + '"></label>' +
          '<div class="pt-form__actions"><button type="submit" class="pt-go">Save and learn again</button>' +
          '<span class="pt-fine">Leave the days empty to use three times each customer&rsquo;s own usual gap.</span></div>' +
        '</form>'
      : '';
    var who = d.source === 'owner' ? 'Set by you.' : d.source === 'svarg' ? 'Proposed by Svarg for ' + esc(d.label || 'your kind of business') + '.' : 'The general default.';
    lost.innerHTML =
      '<header class="pt__head">' +
        '<p class="pt__eyebrow">How this application learns</p>' +
        '<h2 class="pt__title">When a customer counts as <em>lost</em></h2>' +
        '<p class="pt__lede">' + esc(d.sentence || '') + '</p>' +
        '<p class="pt__fine">' + who + ' Patterns are learned from the customers this calls lost, so change it if it does not match how your business works.</p>' +
      '</header>' + form + '<p class="pt-note" id="pt-def-note" hidden></p>';
  }

  function note(id, text, bad) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.className = 'pt-note' + (bad ? ' pt-note--bad' : '');
  }

  function load() {
    if (!token()) return;
    api('').then(function (body) {
      state = body;
      renderLearned();
      renderLost();
    }).catch(function () { /* signed out, or the route is not there yet */ });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-approve]');
    var d = e.target.closest && e.target.closest('[data-dismiss]');
    var l = e.target.closest && e.target.closest('[data-learn]');
    if (!a && !d && !l) return;
    e.preventDefault();
    var btn = a || d || l;
    btn.disabled = true;
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (err) { tz = ''; }
    var p = a ? api('/' + encodeURIComponent(a.getAttribute('data-approve')) + '/approve', { method: 'POST', body: JSON.stringify({ tz: tz }) })
      : d ? api('/' + encodeURIComponent(d.getAttribute('data-dismiss')) + '/dismiss', { method: 'POST' })
      : api('/learn', { method: 'POST' });
    p.then(function () { load(); })
      .catch(function (err) { btn.disabled = false; note('pt-note', err.message, true); });
  });

  document.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'pt-def-form') return;
    e.preventDefault();
    var days = document.getElementById('pt-days').value;
    var words = document.getElementById('pt-words').value;
    note('pt-def-note', 'Saving and learning again…');
    api('/definition', { method: 'PUT', body: JSON.stringify({ inactiveDays: days === '' ? null : Number(days), statusWords: words }) })
      .then(function () { load(); })
      .catch(function (err) { note('pt-def-note', err.message, true); });
  });

  // Each page is a section shown and hidden by the shell; read again when one opens.
  [agents, data].forEach(function (sec) {
    if (!sec || !window.MutationObserver) return;
    new MutationObserver(function () { if (!sec.hidden) load(); })
      .observe(sec, { attributes: true, attributeFilter: ['hidden'] });
  });
  load();
})();
