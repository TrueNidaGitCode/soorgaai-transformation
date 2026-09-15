/**
 * Who can use this application — the owner's view of it.
 *
 * Deliberately a separate file with its own view, rather than more branches
 * inside the page's main script. That script is the page: sign-in, the
 * conversation, the Data page, all of it, and a syntax error anywhere in it
 * takes the whole application down with no sign from the server that anything
 * is wrong. This is a self-contained panel that can fail on its own.
 *
 * It shows itself only to the owner. Everyone else gets 403 from /api/access
 * and never learns the panel exists, which is also the point: a colleague can
 * use the application, only the person who created it decides who else may.
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';

  function token() {
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ask(path, opts) {
    var o = opts || {};
    o.headers = o.headers || {};
    o.headers.Authorization = 'Bearer ' + token();
    if (o.body) o.headers['Content-Type'] = 'application/json';
    return fetch(API + '/api/access' + (path || ''), o);
  }

  var panel = null;
  var state = null;

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function build() {
    panel = el(
      '<section class="ac" id="ch-access" hidden aria-label="People">'
      + '<header class="ac__head">'
      +   '<p class="ac__topline"><a href="#" class="ac__back" id="ac-back">&larr; Back to the chat</a></p>'
      +   '<p class="ac__eyebrow">People</p>'
      +   '<h1 class="ac__title">Who can use <em>this application</em></h1>'
      +   '<p class="ac__sub" id="ac-sub"></p>'
      + '</header>'
      + '<div class="ac__body">'
      +   '<form class="ac__add" id="ac-form">'
      +     '<input type="email" id="ac-email" class="ac__input" placeholder="name@example.com" aria-label="Email address to add" required>'
      +     '<button type="submit" class="ac__btn" id="ac-add">Give access</button>'
      +   '</form>'
      +   '<p class="ac__note" id="ac-note" hidden></p>'
      +   '<ul class="ac__list" id="ac-list"></ul>'
      + '</div>'
      + '</section>');
    document.body.appendChild(panel);

    panel.querySelector('#ac-back').addEventListener('click', function (e) {
      e.preventDefault();
      hide();
    });

    panel.querySelector('#ac-form').addEventListener('submit', function (e) {
      e.preventDefault();
      add();
    });

    panel.querySelector('#ac-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove]');
      if (b) remove(b.getAttribute('data-remove'));
    });
  }

  function say(text, bad) {
    var n = panel.querySelector('#ac-note');
    n.textContent = text || '';
    n.hidden = !text;
    n.className = 'ac__note' + (bad ? ' ac__note--bad' : '');
  }

  function render() {
    var sub = panel.querySelector('#ac-sub');
    var seats = state.seats;
    var plan = state.plan ? state.plan + ' plan' : 'this plan';
    sub.textContent = seats
      ? state.used + ' of ' + seats + (seats === 1 ? ' account' : ' accounts') + ' on the ' + plan + ' in use.'
      : state.used + (state.used === 1 ? ' person has' : ' people have') + ' access.';

    // When there is no room left, the door is the message rather than a
    // disabled button with no explanation beside it.
    var full = state.full;
    panel.querySelector('#ac-email').disabled = full;
    panel.querySelector('#ac-add').disabled = full;
    if (full) {
      say('All ' + (seats === 1 ? 'one account is' : seats + ' accounts are') + ' in use. '
        + 'The SvargAI team will get back to you about enabling a higher plan — or remove somebody below to free a seat.');
    }

    panel.querySelector('#ac-list').innerHTML = (state.people || []).map(function (p) {
      var who = p.name ? esc(p.name) + ' <span class="ac__email">' + esc(p.email) + '</span>' : esc(p.email);
      var tag = p.isOwner ? '<span class="ac__tag ac__tag--owner">Created this application</span>'
        : (!p.signedIn ? '<span class="ac__tag">Invited, not signed in yet</span>' : '');
      var btn = p.isOwner ? ''
        : '<button type="button" class="ac__remove" data-remove="' + esc(p.email) + '">Remove</button>';
      return '<li class="ac__person"><div class="ac__who">' + who + ' ' + tag + '</div>' + btn + '</li>';
    }).join('');
  }

  async function load() {
    var r = await ask('', { method: 'GET' });
    if (!r.ok) return null;                       // not the owner: the panel never appears
    state = await r.json();
    return state;
  }

  async function add() {
    var input = panel.querySelector('#ac-email');
    var email = (input.value || '').trim();
    if (!email) return;
    say('');
    try {
      var r = await ask('', { method: 'POST', body: JSON.stringify({ email: email }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { say(d.error || 'That person could not be added.', true); return; }
      input.value = '';
      await load();
      render();
      say(d.message || '');
    } catch (e) {
      say('That did not reach the application. Try again in a moment.', true);
    }
  }

  async function remove(email) {
    say('');
    try {
      var r = await ask('/' + encodeURIComponent(email), { method: 'DELETE' });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { say(d.error || 'That person could not be removed.', true); return; }
      await load();
      render();
      say(d.message || '');
    } catch (e) {
      say('That did not reach the application. Try again in a moment.', true);
    }
  }

  function show() {
    var app = document.getElementById('ch-app');
    var data = document.getElementById('ch-data');
    if (app) app.hidden = true;
    if (data) data.hidden = true;
    panel.hidden = false;
    load().then(function (s) { if (s) render(); });
  }

  function hide() {
    panel.hidden = true;
    var app = document.getElementById('ch-app');
    if (app) app.hidden = false;
  }

  /** A way in, beside Home and Data, for the one person who has this panel. */
  function addNavItem() {
    var nav = document.querySelector('.ch-side__nav') || document.querySelector('.ch-side');
    if (!nav || document.getElementById('ch-access-link')) return;
    var link = el('<a href="#people" class="ch-side__item" id="ch-access-link">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">'
      + '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>'
      + '<span>People</span></a>');
    link.addEventListener('click', function (e) { e.preventDefault(); show(); });
    nav.appendChild(link);
  }

  async function start() {
    if (!token()) return;
    var s = await load().catch(function () { return null; });
    if (!s) return;                               // not the owner, or not reachable
    build();
    addNavItem();
  }

  // After the page has settled, so the side navigation exists to be added to.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 400); });
  else setTimeout(start, 400);
})();
