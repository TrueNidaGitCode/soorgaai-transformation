/**
 * The Data page -- the owner's, for connecting where their records live.
 *
 * One card per source, in the order this industry works (from
 * data/sources.json, which Eame wrote from the industry's knowledge): for
 * an academy, DOCUMENTS and WHATSAPP BUSINESS; for a software team, Jira
 * and Confluence. Everything a source does happens inside its card:
 *
 *   - DOCUMENTS: the whole folder at once. Every spreadsheet in it is read
 *     here, in the browser, with the progress shown as it goes; each sheet
 *     is matched to the dataset it fits by its columns, the owner confirms
 *     the matching, and the rows land. Uploading the same folder again is a
 *     sync: rows are matched by the dataset's key, new ones added, changed
 *     ones updated, and a row a sheet no longer has is kept and counted,
 *     never deleted. A form's responses sheet is one more document. The
 *     card then shows what it brought in.
 *   - WHATSAPP BUSINESS: the owner's own Meta app, connected once; replies
 *     and messages arrive as they are sent, and the card shows the number,
 *     the last message and the sync controls. A group cannot be read by the
 *     Business API, so an exported chat can be imported from the same card.
 *   - A LIVE SOURCE (Jira, Confluence): connected to this application
 *     directly, credentials kept encrypted in its own database.
 *
 * What each dataset holds is on the tabs to the left, drawn by the shell.
 * Nothing goes to Svarg. Reached from the sidebar once the front door has
 * been passed, and unlocked with the owner key from the Svarg go-live
 * screen.
 *
 * Fixed runtime, like index.html: the same for every application, so it is
 * tested once. It drives only ids of its own (#dt-*) and one link in the
 * sidebar.
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var page = document.getElementById('ch-data');
  var app = document.getElementById('ch-app');
  if (!page || !app) return;

  var els = {
    gate: document.getElementById('dt-gate'),
    room: document.getElementById('dt-room'),
    keyForm: document.getElementById('dt-key-form'),
    keyInput: document.getElementById('dt-key'),
    keyNote: document.getElementById('dt-key-note'),
    sources: document.getElementById('dt-sources'),
    note: document.getElementById('dt-note'),
    back: document.getElementById('dt-back'),
    lock: document.getElementById('dt-lock'),
  };

  var ownerToken = '';
  try { ownerToken = localStorage.getItem('ownerToken') || ''; } catch (e) { /* fine */ }

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function say(el, text, bad) { if (!el) return; el.textContent = text || ''; el.hidden = !text; el.classList.toggle('dt-note--bad', !!bad); }
  function ago(d) {
    if (!d) return '';
    var ms = Date.now() - new Date(d).getTime();
    if (ms < 60e3) return 'just now';
    if (ms < 3600e3) return Math.round(ms / 60e3) + ' min ago';
    if (ms < 86400e3) return Math.round(ms / 3600e3) + ' h ago';
    if (ms < 7 * 86400e3) return Math.round(ms / 86400e3) + ' d ago';
    try { return new Date(d).toLocaleDateString(); } catch (e) { return ''; }
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /*
   * The shell owns which panel is on screen. This used to hide #ch-app to
   * show itself, which took the sidebar with it -- so Data looked like a
   * different application rather than a page of this one.
   */
  function show(which) {
    if (typeof window.svargShowPanel === 'function') {
      window.svargShowPanel(which === 'data' ? 'data' : 'ask');
    } else {
      app.hidden = which === 'data';   // an older shell without the switcher
      page.hidden = which !== 'data';
    }
    // Try the door with whatever the reader already has; only ask for a
    // key if the application actually refuses.
    if (which === 'data') { if (ownerToken) enter(); else openOrAsk(); }
  }

  /*
   * ── Ask the application, rather than demanding a key first ────────────────
   *
   * This page used to open on a password box. Everyone met it, including the
   * person who had just signed in AS the owner — and the API never wanted the
   * key from them: requireWriter passes anybody whose session already says
   * owner. The gate asked for something the server did not require, so the
   * usual route to your own data was to go and find a secret you were shown
   * once, weeks ago.
   *
   * So the page tries the door. One ordinary request with the session already
   * in hand: if the application lets it through, the room opens. The key stays
   * for the case it was built for — somebody with no session, or an owner
   * whose email no longer reaches them — reached by a link rather than a wall.
   *
   * Asking the server rather than reading `role` out of the token on this side
   * keeps one authority for who may write. A second copy of that rule in the
   * browser is a second thing to keep true.
   */
  async function openOrAsk() {
    try {
      const r = await fetch(API + '/api/data/datasets', {
        headers: { Authorization: 'Bearer ' + sessionToken() },
      });
      if (r.ok) { await enter(); return; }
    } catch (e) { /* offline or refused — fall through to the key */ }
    gate();
  }

  /** The ordinary sign-in session, which is what most people arrive with. */
  function sessionToken() {
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  function gate() {
    els.gate.hidden = false;
    els.room.hidden = true;
    if (els.lock) els.lock.hidden = true;
    fetch(API + '/api/data/owner-status').then(function (r) { return r.ok ? r.json() : { configured: false }; })
      .then(function (d) {
        say(els.keyNote, d.configured ? '' : 'No owner key is set on this application, so nothing can be imported yet. If it runs on Svarg, the key is on the go-live screen; if you host it yourself, set APP_OWNER_KEY.', !d.configured);
      }).catch(function () {});
  }

  async function enter() {
    els.gate.hidden = true;
    els.room.hidden = false;
    if (els.lock) els.lock.hidden = false;
    await refresh();
  }

  /*
   * The owner key when one was used, otherwise the ordinary session.
   *
   * Both are accepted by the server — requireWriter passes a session that
   * already says owner — so the page should use whichever the reader actually
   * arrived with rather than insisting on the rarer one.
   */
  async function ownerFetch(path, opts) {
    var o = opts || {};
    o.headers = Object.assign({}, o.headers || {},
      { Authorization: 'Bearer ' + (ownerToken || sessionToken()) });
    var r = await fetch(API + path, o);
    if (r.status === 401 || r.status === 403) {
      // Only a key can be forgotten here. Clearing a perfectly good sign-in
      // because one request was refused would log somebody out of the whole
      // application from the Data page.
      var hadKey = !!ownerToken;
      ownerToken = '';
      try { localStorage.removeItem('ownerToken'); } catch (e) { /* fine */ }
      gate();
      say(els.keyNote, hadKey
        ? 'Your owner session has ended. Enter the key again.'
        : 'Only the owner can change this application’s data. Enter the owner key, or ask whoever set it up to add you.', true);
      throw new Error('owner session ended');
    }
    return r;
  }
  async function ownerJson(path, method, body) {
    var r = await ownerFetch(path, { method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || 'That did not work.');
    return d;
  }

  // ── The key ───────────────────────────────────────────────────────────────

  els.keyForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    say(els.keyNote, '');
    var key = (els.keyInput.value || '').trim();
    if (!key) return;
    try {
      // The signed-in session goes along, so the person holding the key
      // becomes the owner on their account too (the chat can then write).
      var headers = { 'Content-Type': 'application/json' };
      var session = ''; try { session = localStorage.getItem('token') || ''; } catch (err) { /* fine */ }
      if (session) headers.Authorization = 'Bearer ' + session;
      var r = await fetch(API + '/api/data/owner-session', { method: 'POST', headers: headers, body: JSON.stringify({ key: key }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { say(els.keyNote, d.error || 'That did not work.', true); return; }
      ownerToken = d.token;
      try { localStorage.setItem('ownerToken', ownerToken); } catch (err) { /* fine */ }
      els.keyInput.value = '';
      enter();
      if (d.promoted) setTimeout(function () { say(els.note, 'Your account is now the owner of this application: the chat can add records for you.'); }, 300);
    } catch (err) {
      say(els.keyNote, 'Could not reach the server.', true);
    }
  });

  if (els.lock) els.lock.addEventListener('click', function () {
    ownerToken = '';
    try { localStorage.removeItem('ownerToken'); } catch (e) { /* fine */ }
    gate();
  });

  // ── State ─────────────────────────────────────────────────────────────────

  var datasets = [];
  var sources = [];      // where the data lives, in the industry's order
  var kinds = [];        // connector kinds this application shipped with
  var connectors = [];   // what is connected, across datasets
  var imports = [];
  var open = {};         // kind -> the flow open inside that card, if any

  var SOURCE_LABEL = { own: 'a file', folder: 'your documents', whatsapp: 'WhatsApp export', 'whatsapp-business': 'WhatsApp Business', chat: 'the chat', jira: 'Jira', confluence: 'Confluence', github: 'GitHub', sample: 'sample' };
  function sourceLabel(s) { return SOURCE_LABEL[s] || s || 'a file'; }

  async function refresh() {
    // The application's shell keeps the counts beside the datasets; tell it.
    try { document.dispatchEvent(new CustomEvent('ch-data-changed')); } catch (e) { /* fine */ }
    try {
      var d = await ownerJson('/api/data/datasets');
      datasets = d.datasets || [];
      imports = d.imports || [];
      try { sources = (await ownerJson('/api/data/sources')).sources || []; } catch (err) { sources = []; }
      try {
        var c = await ownerJson('/api/connectors');
        kinds = c.kinds || [];
        connectors = c.connectors || [];
      } catch (err) { kinds = []; connectors = []; }
      renderSources();
    } catch (err) { /* the gate said why */ }
  }

  // ── The cards ─────────────────────────────────────────────────────────────

  var ICON = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/><path d="M9 10a1 1 0 0 1 1-1h.5l1 2-.8.8a5 5 0 0 0 2.5 2.5l.8-.8 2 1v.5a1 1 0 0 1-1 1A6 6 0 0 1 9 10z"/></svg>',
    live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
    database: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/></svg>',
  };

  var DEFAULT_FOLDER = { kind: 'folder', label: 'Documents', providers: ['upload'], note: 'Upload the folder your records are kept in; each sheet is matched to what the application expects.' };

  function importsOf(source) { return imports.filter(function (e) { return e.source === source; }); }

  /**
   * The cards to draw: the industry's sources, with a form and the odd
   * file folded into Documents -- a form's responses sheet is one more
   * document in the folder. A connector that shipped without being named
   * (the WhatsApp Business module behind the WhatsApp card) is not a card
   * of its own.
   */
  function cards() {
    var list = sources.length ? sources.slice() : [DEFAULT_FOLDER];
    var folded = list.some(function (s) { return s.kind === 'form' || s.kind === 'file'; });
    list = list.filter(function (s) { return s.kind !== 'form' && s.kind !== 'file'; });
    if (folded && !list.some(function (s) { return s.kind === 'folder'; })) list.unshift(DEFAULT_FOLDER);
    return list;
  }

  function renderSources() {
    els.sources.innerHTML = cards().map(renderCard).join('');
    if (!datasets.length) say(els.note, 'This application lists no datasets to bring records onto. It was built without sample data, so its seed script says what file it expects.', true);
  }

  /** Everything one card shows: title, the line under it, status, the way in, and what it holds once connected. */
  function describe(s) {
    var d = { kind: s.kind, icon: ICON.live, title: s.label, note: s.note || '', on: false, status: 'Not connected', go: '', goAction: '', alt: '', held: '' };
    if (s.kind === 'folder') {
      var f = importsOf('folder');
      d.icon = ICON.folder; d.title = 'Documents';
      d.note = 'Upload the folder your records are kept in. Every spreadsheet in it is read here, in your browser.';
      if (f.length) {
        var files = {}; f.forEach(function (e) { (e.origin || '').split(', ').forEach(function (n) { if (n) files[n] = 1; }); });
        d.on = true; d.status = plural(Object.keys(files).length, 'sheet') + ' read · ' + ago(f[0].at);
        d.held = heldFromFolder(f);
      }
      d.go = f.length ? 'Upload the folder again' : 'Connect documents'; d.goAction = 'folder';
      d.alt = '<label>Add one file<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-onefile="1"></label>';
    } else if (s.kind === 'whatsapp') {
      var biz = kinds.find(function (x) { return x.kind === 'whatsapp-business'; });
      var mine = connectors.filter(function (c) { return c.kind === 'whatsapp-business'; });
      var w = importsOf('whatsapp');
      var providers = s.providers || ['export'];
      d.icon = ICON.whatsapp; d.title = biz ? 'WhatsApp Business' : 'WhatsApp';
      d.note = biz ? 'Connect your WhatsApp Business account. Replies arrive here as they are sent.' : 'Export a chat from WhatsApp and import it here.';
      if (mine.length) { d.on = true; d.status = 'Connected' + (mine[0].lastSyncAt ? ' · last message ' + ago(mine[0].lastSyncAt) : ' · waiting for the first message'); d.held = '<ul class="dt-src__list">' + mine.map(renderConnector).join('') + '</ul>'; }
      else if (w.length) { d.on = true; d.status = plural(w[0].rows, 'row') + ' from an export · ' + ago(w[0].at); }
      if (biz && providers.indexOf('business-account') !== -1) {
        d.go = mine.length ? 'Connect another number' : 'Connect WhatsApp Business'; d.goAction = 'whatsapp-business';
        if (providers.indexOf('export') !== -1) d.alt = '<button type="button" data-open="whatsapp">Import an exported chat</button>';
      } else {
        d.go = w.length ? 'Import another export' : 'Import an exported chat'; d.goAction = 'whatsapp';
      }
    } else if (s.kind === 'database') {
      var db = kinds.find(function (x) { return x.kind === 'database'; });
      var dbc = connectors.filter(function (c) { return c.kind === 'database'; });
      d.icon = ICON.database; d.title = 'Connect your database';
      d.note = 'Read straight from the database your own software writes to. PostgreSQL and MySQL, read-only.';
      if (!db) d.status = 'Not available on this application';
      else if (dbc.length) { d.on = true; d.status = plural(dbc.length, 'connection') + (dbc[0].lastSyncAt ? ' · last synced ' + ago(dbc[0].lastSyncAt) : ' · not synced yet'); d.held = '<ul class="dt-src__list">' + dbc.map(renderConnector).join('') + '</ul>'; }
      if (db) { d.go = dbc.length ? 'Connect another' : 'Connect'; d.goAction = 'database'; }
    } else {
      // A live source: connected once per dataset it feeds.
      var k = kinds.find(function (x) { return x.kind === s.kind; });
      var conns = connectors.filter(function (c) { return c.kind === s.kind; });
      if (k) d.note = k.help || d.note;
      if (!k) d.status = 'Not available on this application';
      else if (conns.length) { d.on = true; d.status = plural(conns.length, 'connection') + (conns[0].lastSyncAt ? ' · last synced ' + ago(conns[0].lastSyncAt) : ' · not synced yet'); d.held = '<ul class="dt-src__list">' + conns.map(renderConnector).join('') + '</ul>'; }
      if (k) { d.go = conns.length ? 'Connect another' : 'Connect ' + s.label; d.goAction = s.kind; }
    }
    return d;
  }

  /** What the last upload of the folder brought in, sheet by sheet. */
  function heldFromFolder(f) {
    var latest = new Date(f[0].at).getTime();
    var batch = f.filter(function (e) { return latest - new Date(e.at).getTime() < 5 * 60e3; });
    return '<div class="dt-done"><p class="dt-done__line">' + ICON.tick + ' ' + plural(batch.length, 'dataset') + ' updated ' + esc(ago(f[0].at)) + '</p>'
      + '<ul class="dt-done__list">' + batch.map(function (e) {
        var what = [];
        if (e.added) what.push('+' + e.added);
        if (e.updated) what.push(e.updated + ' changed');
        if (e.missing) what.push('<em>' + e.missing + ' gone from the sheet, kept</em>');
        return '<li><span><b>' + esc(e.origin || sourceLabel(e.source)) + '</b> &rarr; ' + esc(e.datasetName) + '</span><span>' + (what.length ? what.join(', ') : plural(e.rows, 'row')) + '</span></li>';
      }).join('') + '</ul></div>';
  }

  /**
   * A card at rest is one row: what the source is, one line about it, and
   * the way in. What it can bring is the answer to a question nobody has
   * asked yet -- it waits inside the flow the button opens, along with the
   * fields and the matching. Everything the card holds once it is
   * connected still shows, because by then it is about the reader's own
   * records rather than about a decision they have not made.
   */
  function renderCard(s) {
    var d = describe(s);
    var isOpen = !!open[s.kind];
    var body = isOpen ? open[s.kind].html : d.held;
    var go = !isOpen && d.goAction
      ? '<button type="button" class="dt-card__go' + (d.on ? ' dt-card__go--quiet' : '') + '" data-open="' + esc(d.goAction) + '">' + esc(d.go) + ' <span aria-hidden="true">&rarr;</span></button>'
      : '';
    var alt = !isOpen && d.alt ? '<p class="dt-card__alt">' + d.alt + '</p>' : '';
    return '<article class="dt-card' + (d.on ? ' dt-card--on' : '') + (isOpen ? ' dt-card--open' : '') + '" data-card="' + esc(s.kind) + '">'
      + '<div class="dt-card__head"><span class="dt-card__icon" aria-hidden="true">' + d.icon + '</span>'
      + '<div class="dt-card__text"><h3 class="dt-card__title">' + esc(d.title) + '</h3><p class="dt-card__note">' + esc(d.note) + '</p>'
      + (d.on && !isOpen ? '<p class="dt-card__label">' + esc(d.status) + '</p>' : '')
      + (!d.goAction ? '<p class="dt-card__label">' + esc(d.status) + '</p>' : '') + '</div>'
      + '<div class="dt-card__act">' + go + alt + '</div></div>'
      + (body ? '<div class="dt-card__body" data-body>' + body + '</div>' : '<div class="dt-card__body" data-body hidden></div>')
      + '</article>';
  }

  function renderConnector(c) {
    var meta;
    if (c.status === 'error') meta = '<span class="dt-conn__meta dt-conn__meta--bad">' + esc(c.lastError || 'The last sync failed.') + '</span>';
    else if (c.status === 'syncing') meta = '<span class="dt-conn__meta">Syncing…</span>';
    else if (c.lastSyncAt) meta = '<span class="dt-conn__meta"><b>' + c.lastRows + ' rows</b> into ' + esc(c.datasetName) + ' · ' + esc(ago(c.lastSyncAt)) + '</span>';
    else meta = '<span class="dt-conn__meta">Into ' + esc(c.datasetName) + ' · nothing has arrived yet</span>';
    var sched = ['manual', 'hourly', 'daily'].map(function (s) {
      return '<option value="' + s + '"' + (c.schedule === s ? ' selected' : '') + '>' + (s === 'manual' ? 'On demand' : s === 'hourly' ? 'Every hour' : 'Every day') + '</option>';
    }).join('');
    return '<li class="dt-conn" data-conn="' + esc(c.id) + '">'
      + '<span class="dt-conn__kind">' + esc(c.label) + '</span>' + meta
      + '<span class="dt-conn__acts">'
      + '<select data-schedule="' + esc(c.id) + '" title="How often to sync">' + sched + '</select>'
      + '<button type="button" class="dt-mini" data-sync="' + esc(c.id) + '">Sync now</button>'
      + '<button type="button" class="dt-mini" data-remove="' + esc(c.id) + '">Remove</button>'
      + '</span></li>';
  }

  // ── A flow inside a card ──────────────────────────────────────────────────

  /** The card a flow belongs to: WhatsApp's two ways in share one card. */
  function cardKind(kindName) { return kindName === 'whatsapp-business' ? 'whatsapp' : kindName; }
  function bodyOf(kind) { return page.querySelector('[data-card="' + kind + '"] [data-body]'); }

  function openFlow(kind, html, state) {
    open[kind] = Object.assign({ html: html }, state || {});
    var card = page.querySelector('[data-card="' + kind + '"]');
    if (!card) { renderSources(); card = page.querySelector('[data-card="' + kind + '"]'); }
    if (!card) { delete open[kind]; return; }
    card.classList.add('dt-card--open');
    var act = card.querySelector('.dt-card__act'); if (act) act.innerHTML = '';
    var status = card.querySelector('.dt-card__label'); if (status) status.remove();
    var b = bodyOf(kind); b.hidden = false; b.innerHTML = html;
    say(els.note, '');
  }
  function closeFlow(kind) { delete open[kind]; renderSources(); }
  function flowErr(kind, text) {
    var b = bodyOf(kind); if (!b) { say(els.note, text, true); return; }
    var p = b.querySelector('.dt-card__err');
    if (!p) { p = document.createElement('p'); p.className = 'dt-card__err'; b.appendChild(p); }
    p.textContent = text;
  }
  function progress(kind, done, total, what) {
    var b = bodyOf(kind); if (!b) return;
    var pct = total ? Math.round(100 * done / total) : 0;
    b.innerHTML = '<div class="dt-prog"><div class="dt-prog__row"><b>' + esc(what) + '</b><span>' + done + ' of ' + total + '</span></div><div class="dt-prog__bar"><div class="dt-prog__fill" style="width:' + pct + '%"></div></div></div>';
  }

  // ── Reading files ─────────────────────────────────────────────────────────

  function parseCsv(text) {
    var rows = [], row = [], cur = '', q = false;
    var s = String(text || '').replace(/\r\n?/g, '\n');
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (q) {
        if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',' || ch === '\t') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }

  var SHEET = /\.(csv|tsv|txt|xlsx|xls)$/i;

  /** Every sheet in a file, as { name, grid }: one for a CSV, one per tab for a workbook. */
  async function readSheets(file) {
    var name = file.name.toLowerCase();
    if (/\.xlsx?$/.test(name)) {
      if (!window.XLSX) throw new Error('Excel files need the spreadsheet reader, which did not load. Save the sheet as CSV and try that.');
      var buf = await file.arrayBuffer();
      var wb = window.XLSX.read(buf, { type: 'array' });
      var out = [];
      wb.SheetNames.forEach(function (sn) {
        var grid = window.XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' });
        grid = grid.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
        if (grid.length >= 2) out.push({ name: wb.SheetNames.length > 1 ? file.name + ' / ' + sn : file.name, grid: grid });
      });
      return out;
    }
    var g = parseCsv(await file.text());
    return g.length >= 2 ? [{ name: file.name, grid: g }] : [];
  }

  async function readFile(file) {
    var sheets = await readSheets(file);
    if (!sheets.length) throw new Error('That file has a header and no rows.');
    return sheets[0].grid;
  }

  // ── Reading a WhatsApp chat export ────────────────────────────────────────

  // One line per message, in either shape WhatsApp exports:
  //   12/03/2026, 18:04 - Name: message          (Android)
  //   [12/03/2026, 18:04:33] Name: message       (iPhone)
  // A line that does not start this way continues the previous message.
  var LINE = /^\[?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?)\]?\s*(?:-|–)?\s*(.*)$/;

  function parseWhatsApp(text) {
    var msgs = [];
    String(text || '').replace(/‎|‏/g, '').split(/\r?\n/).forEach(function (line) {
      var m = LINE.exec(line);
      if (m) {
        var rest = m[3];
        var c = rest.indexOf(': ');
        if (c > 0 && c < 60) msgs.push({ date: m[1], time: m[2].trim(), sender: rest.slice(0, c).trim(), message: rest.slice(c + 2) });
        // A system line ("X added Y", "Messages are encrypted") has no sender and is skipped.
      } else if (msgs.length && line.trim()) {
        msgs[msgs.length - 1].message += '\n' + line;
      }
    });
    return msgs;
  }

  // The reply shapes that mean absent or present. Absent first: "not coming"
  // contains "coming". Anything long, or a question, is not a reply at all.
  var ABSENT = /\b(not coming|can'?t|cannot|won'?t|unable|absent|skip|leave|sick|unwell|not available|will miss|missing|no)\b|❌|🙅|👎/i;
  var PRESENT = /\b(yes|yep|yeah|present|coming|attending|will come|will be there|i'?m in|count me in|ok|okay|sure|confirmed|available|done)\b|👍|✅|🙋/i;

  function classifyReply(text) {
    var t = String(text || '').trim();
    if (!t || t.length > 80 || /\?/.test(t)) return '';
    if (/yes\s*(\/|or)\s*no/i.test(t)) return '';
    if (ABSENT.test(t)) return 'absent';
    if (PRESENT.test(t)) return 'present';
    return '';
  }

  function whatsAppGrid(text, mode) {
    var msgs = parseWhatsApp(text);
    if (!msgs.length) throw new Error('That does not look like a WhatsApp chat export. Export the chat without media and choose the .txt file.');
    if (mode === 'attendance') {
      var rows = [], skipped = 0;
      msgs.forEach(function (m) {
        var status = classifyReply(m.message);
        if (!status) { skipped++; return; }
        rows.push([m.date, m.time, m.sender, m.message.replace(/\n/g, ' '), status]);
      });
      if (!rows.length) throw new Error('None of the ' + msgs.length + ' messages read as a yes or a no.');
      return { header: ['date', 'time', 'name', 'reply', 'status'], body: rows, note: rows.length + ' replies read as present or absent; ' + skipped + ' other messages skipped.' };
    }
    return { header: ['date', 'time', 'sender', 'message'], body: msgs.map(function (m) { return [m.date, m.time, m.sender, m.message.replace(/\n/g, ' ')]; }), note: msgs.length + ' messages read.' };
  }

  // ── Matching columns ──────────────────────────────────────────────────────

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  /** Best guess: same name, then one containing the other. */
  function guessMapping(targets, sourceCols) {
    var used = {};
    return targets.map(function (t) {
      var nt = norm(t);
      var exact = sourceCols.findIndex(function (s, i) { return !used[i] && norm(s) === nt; });
      var idx = exact;
      if (idx < 0) idx = sourceCols.findIndex(function (s, i) { var ns = norm(s); return !used[i] && ns && (ns.indexOf(nt) !== -1 || nt.indexOf(ns) !== -1); });
      if (idx >= 0) used[idx] = true;
      return idx;
    });
  }

  /** How well a sheet's header fits a dataset: matched columns, and the share of the dataset that is. */
  function fit(d, header) {
    var g = guessMapping(d.columns, header);
    var matched = g.filter(function (i) { return i >= 0; }).length;
    // Same name, not merely one inside the other: 'Phone' inside
    // 'sender_phone_masked' is a coincidence, 'Trainee ID' is a match.
    var exact = g.filter(function (i, ti) { return i >= 0 && norm(header[i]) === norm(d.columns[ti]); }).length;
    return { mapping: g, matched: matched, exact: exact, share: d.columns.length ? matched / d.columns.length : 0 };
  }

  /** The dataset a sheet fits best, or -1 when none fits well enough to be a guess. */
  function bestDataset(header) {
    var best = -1, bestScore = 0;
    datasets.forEach(function (d, i) {
      var f = fit(d, header);
      // Two columns with the same name, or half the dataset's columns matched
      // somehow: enough to propose, never enough to skip the owner's look. A
      // sheet that merely shares a word or two ('Phone', 'Name') is not used.
      var ok = f.exact >= 2 || f.share >= 0.5;
      var score = f.share + f.matched / 100;
      if (ok && score > bestScore) { best = i; bestScore = score; }
    });
    return best;
  }

  function datasetOptions(selected) {
    return datasets.map(function (d, i) { return '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('');
  }

  // ── A file onto one dataset ───────────────────────────────────────────────

  function showMapping(kind, i, grid, source, lead, origin, complete) {
    var d = datasets[i];
    var header = grid.header, body = grid.body;
    var guess = guessMapping(d.columns, header);
    openFlow(kind, '<p class="dt-panel__head">' + esc(lead || '') + ' Match your columns to the ones <strong>' + esc(d.name) + '</strong> expects.</p>'
      + '<table class="dt-map__table"><thead><tr><th>Expected</th><th>Your column</th><th>First value</th></tr></thead><tbody>'
      + d.columns.map(function (c, ti) {
        return '<tr><td><code>' + esc(c) + '</code>' + (d.key && d.key.split(' + ').indexOf(c) !== -1 ? ' <span class="dt-key">key</span>' : '') + '</td><td><select data-target="' + ti + '">'
          + '<option value="-1">— leave empty —</option>'
          + header.map(function (h, si) { return '<option value="' + si + '"' + (guess[ti] === si ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('')
          + '</select></td><td class="dt-map__sample" data-sample="' + ti + '">' + esc(guess[ti] >= 0 ? body[0][guess[ti]] : '') + '</td></tr>';
      }).join('')
      + '</tbody></table>'
      + '<div class="dt-map__actions"><button type="button" class="dt-btn" data-go="' + i + '">Bring in ' + body.length + ' rows</button>'
      + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>',
      { grid: { header: header, body: body, source: source || 'own', origin: origin || '', complete: complete !== false } });
    bodyOf(kind).querySelectorAll('select[data-target]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var si = Number(sel.value);
        var cell = bodyOf(kind).querySelector('[data-sample="' + sel.dataset.target + '"]');
        if (cell) cell.textContent = si >= 0 ? (body[0][si] || '') : '';
      });
    });
  }

  /** One file with no dataset named yet: ask which, then match. */
  async function oneFile(file) {
    try {
      var grid = await readFile(file);
      var header = grid[0].map(function (h) { return String(h).trim(); });
      var best = bestDataset(header);
      openFlow('folder', '<p class="dt-panel__head"><strong>' + esc(file.name) + '</strong>: ' + (grid.length - 1) + ' rows. Which dataset is it?</p>'
        + '<div class="dt-map__actions"><select class="dt-select" data-pick-dataset="1">' + datasetOptions(best >= 0 ? best : 0) + '</select>'
        + '<button type="button" class="dt-btn" data-pick-go="1">Match the columns</button><button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>',
        { pending: { grid: grid, header: header, origin: file.name } });
    } catch (err) { flowErr('folder', err.message); }
  }

  // ── The folder ────────────────────────────────────────────────────────────

  /** The way in: choose the folder. */
  function openFolder() {
    openFlow('folder', '<div class="dt-drop"><span class="dt-drop__icon" aria-hidden="true">' + ICON.upload + '</span>'
      + '<p class="dt-drop__text">Choose the folder your records are kept in</p>'
      + '<p class="dt-drop__hint">Every spreadsheet in it is read here, in your browser. You check where each one goes before anything lands.</p>'
      + '<label class="dt-card__go">Choose the folder<input type="file" webkitdirectory directory multiple data-folder="1"></label></div>'
      + '<p class="dt-card__alt"><label>Add one file instead<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-onefile="1"></label> · <button type="button" data-cancel="1">Cancel</button></p>');
  }

  /**
   * Every spreadsheet in the folder, read here with the progress shown and
   * matched to a dataset by its columns; the owner confirms in the card.
   * Two sheets that fit the same dataset (a fee sheet per year) land
   * together as one; a sheet that fits nothing is listed as not used, and
   * a file that is not a spreadsheet is named so the owner knows it was
   * seen.
   */
  async function folder(files) {
    var all = Array.prototype.slice.call(files).filter(function (f) { return !/(^|\/)[.~$]/.test(f.webkitRelativePath || f.name); }); // hidden and lock files
    var sheets = [], others = [], failed = [];
    open.folder = open.folder || { html: '' };
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      progress('folder', i, all.length, 'Reading ' + f.name);
      if (!SHEET.test(f.name)) { others.push(f.name); continue; }
      try { (await readSheets(f)).forEach(function (s) { sheets.push(s); }); }
      catch (err) { failed.push(f.name + ' (' + err.message + ')'); }
      await new Promise(function (r) { setTimeout(r, 0); }); // let the bar move
    }
    progress('folder', all.length, all.length, 'Read');
    if (!sheets.length) { openFolder(); flowErr('folder', all.length ? 'No spreadsheet with rows was found in that folder (' + all.length + ' files looked at).' : 'That folder is empty.'); return; }
    var rows = sheets.map(function (s) {
      var header = s.grid[0].map(function (h) { return String(h).trim(); });
      return { name: s.name, header: header, body: s.grid.slice(1), dataset: bestDataset(header) };
    });
    openFlow('folder', '<p class="dt-panel__head"><strong>' + plural(sheets.length, 'sheet') + '</strong> read' + (others.length ? ', ' + plural(others.length, 'other file') + ' not used' : '') + '. Check where each one goes.</p>'
      + '<div class="dt-tablewrap"><table class="dt-map__table dt-folder"><thead><tr><th>Sheet</th><th>Rows</th><th>Goes to</th><th>Columns matched</th></tr></thead><tbody>'
      + rows.map(function (r, ri) {
        return '<tr data-sheet="' + ri + '"><td class="dt-folder__name" title="' + esc(r.header.join(', ')) + '">' + esc(r.name) + '</td><td>' + r.body.length + '</td>'
          + '<td><select class="dt-select" data-sheet-dataset="' + ri + '"><option value="-1"' + (r.dataset < 0 ? ' selected' : '') + '>— not used —</option>' + datasetOptions(r.dataset) + '</select></td>'
          + '<td class="dt-folder__fit" data-fit="' + ri + '">' + fitText(r) + '</td></tr>';
      }).join('')
      + '</tbody></table></div>'
      + (others.length ? '<p class="dt-panel__aside">Not spreadsheets, so not used: ' + esc(others.slice(0, 8).join(', ')) + (others.length > 8 ? ' and ' + (others.length - 8) + ' more' : '') + '.</p>' : '')
      + (failed.length ? '<p class="dt-panel__aside dt-note--bad">Could not read: ' + esc(failed.join('; ')) + '</p>' : '')
      + '<div class="dt-map__actions"><button type="button" class="dt-btn" data-folder-go="1">Bring in ' + plural(rows.filter(function (r) { return r.dataset >= 0; }).length, 'sheet') + '</button>'
      + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>',
      { sheets: rows });
  }

  function fitText(r) {
    if (r.dataset < 0) return '<span class="dt-faint">—</span>';
    var d = datasets[r.dataset];
    var f = fit(d, r.header);
    var keyCols = (d.key || '').split(' + ').filter(Boolean);
    var keyOk = keyCols.every(function (k) { return f.mapping[d.columns.indexOf(k)] >= 0; });
    return f.matched + ' of ' + d.columns.length + (keyCols.length ? (keyOk ? ' · key found' : ' · <em class="dt-table__missing">no ' + esc(d.key) + '</em>') : '');
  }

  async function folderGo(btn) {
    var rows = (open.folder && open.folder.sheets) || [];
    var groups = {};
    rows.forEach(function (r) {
      if (r.dataset < 0) return;
      var d = datasets[r.dataset];
      var f = fit(d, r.header);
      var g = groups[r.dataset] || (groups[r.dataset] = { dataset: d, rows: [], origin: [] });
      r.body.forEach(function (row) { g.rows.push(f.mapping.map(function (si) { return si >= 0 ? String(row[si] == null ? '' : row[si]) : ''; })); });
      g.origin.push(r.name);
    });
    var keys = Object.keys(groups);
    if (!keys.length) { flowErr('folder', 'Nothing is marked to go anywhere.'); return; }
    btn.disabled = true;
    var lines = [], bad = [];
    for (var i = 0; i < keys.length; i++) {
      var g = groups[keys[i]];
      progress('folder', i, keys.length, 'Bringing in ' + g.dataset.name);
      try {
        var res = await ownerJson('/api/data/import', 'POST', { datasetName: g.dataset.name, rows: g.rows, source: 'folder', origin: g.origin.join(', '), mode: 'merge', complete: true });
        lines.push(g.dataset.name + ': ' + summary(res));
      } catch (err) { bad.push(g.dataset.name + ': ' + err.message); }
    }
    progress('folder', keys.length, keys.length, 'Done');
    delete open.folder;
    await refresh();
    if (bad.length) say(els.note, bad.join('; '), true);
    else say(els.note, lines.join(' · ') + '. Upload the folder again whenever the sheets change; only what changed moves.');
  }

  function summary(res) {
    var parts = [];
    if (res.added) parts.push(res.added + ' added');
    if (res.updated) parts.push(res.updated + ' changed');
    if (res.unchanged) parts.push(res.unchanged + ' unchanged');
    if (res.missing) parts.push(res.missing + ' no longer in the sheet (kept)');
    if (res.moved && res.moved.length) parts.push(res.moved.map(function (m) { return m.rows + ' from ' + sourceLabel(m.from) + ' now from here'; }).join(', '));
    return parts.length ? parts.join(', ') : plural(res.rows, 'row');
  }

  // ── Events ────────────────────────────────────────────────────────────────

  page.addEventListener('change', async function (e) {
    var t = e.target;
    if (t.matches('[data-folder]') && t.files && t.files.length) { var fl = Array.prototype.slice.call(t.files); t.value = ''; await folder(fl); return; }
    if (t.matches('[data-onefile]') && t.files && t.files[0]) { var one = t.files[0]; t.value = ''; await oneFile(one); return; }

    var wa = t.closest('[data-wa-file]');
    if (wa && wa.files && wa.files[0]) {
      var b = bodyOf('whatsapp');
      var mode = (b.querySelector('input[name="wa-mode"]:checked') || {}).value || 'messages';
      var wi = Number((b.querySelector('[data-wa-dataset]') || {}).value || 0);
      var wf = wa.files[0]; wa.value = '';
      try {
        var wgrid = whatsAppGrid(await wf.text(), mode);
        // An export is a slice of the group at one moment, never the whole of
        // what WhatsApp holds: nothing is marked missing because of it.
        showMapping('whatsapp', wi, wgrid, 'whatsapp', wgrid.note, wf.name, false);
      } catch (err) { flowErr('whatsapp', err.message); }
      return;
    }

    var sd = t.closest('[data-sheet-dataset]');
    if (sd) {
      var ri = Number(sd.dataset.sheetDataset);
      var r = open.folder.sheets[ri]; r.dataset = Number(sd.value);
      var fb = bodyOf('folder');
      fb.querySelector('[data-fit="' + ri + '"]').innerHTML = fitText(r);
      var goBtn = fb.querySelector('[data-folder-go]');
      if (goBtn) goBtn.textContent = 'Bring in ' + plural(open.folder.sheets.filter(function (x) { return x.dataset >= 0; }).length, 'sheet');
      return;
    }

    var sched = t.closest('[data-schedule]');
    if (sched) {
      try { await ownerJson('/api/connectors/' + sched.dataset.schedule, 'PATCH', { schedule: sched.value }); }
      catch (err) { say(els.note, err.message, true); }
    }
  });

  page.addEventListener('click', async function (e) {
    var t = e.target;
    var card = t.closest('[data-card]');
    var kind = card ? card.dataset.card : '';

    if (t.closest('[data-cancel]')) { closeFlow(kind); return; }

    var openBtn = t.closest('[data-open]');
    if (openBtn) { openSource(openBtn.dataset.open); return; }

    var pick = t.closest('[data-pick-go]');
    if (pick) {
      var p = open.folder && open.folder.pending; if (!p) return;
      var di = Number((bodyOf('folder').querySelector('[data-pick-dataset]') || {}).value || 0);
      showMapping('folder', di, { header: p.header, body: p.grid.slice(1) }, 'own', (p.grid.length - 1) + ' rows read from ' + p.origin + '.', p.origin, true);
      return;
    }

    var fg = t.closest('[data-folder-go]');
    if (fg) { await folderGo(fg); return; }

    var connect = t.closest('[data-connect]');
    if (connect) { await submitConnector(connect, kind); return; }

    var sync = t.closest('[data-sync]');
    if (sync) {
      sync.disabled = true; sync.textContent = 'Syncing…';
      try {
        var r = await ownerJson('/api/connectors/' + sync.dataset.sync + '/sync', 'POST');
        var row = connectors.find(function (c) { return c.id === sync.dataset.sync; });
        await refresh();
        say(els.note, r.rows ? r.rows + ' rows synced into ' + (row ? row.datasetName : 'the dataset') + '. The answers use them from now on.' : (r.message || 'Nothing to sync.'));
      } catch (err) { await refresh(); say(els.note, err.message, true); }
      return;
    }

    var remove = t.closest('[data-remove]');
    if (remove) {
      if (!confirm('Remove this source? Its credentials are forgotten; the rows it brought stay.')) return;
      try { await ownerJson('/api/connectors/' + remove.dataset.remove, 'DELETE'); await refresh(); }
      catch (err) { say(els.note, err.message, true); }
      return;
    }

    var go = t.closest('[data-go]');
    if (!go || !kind) return;
    var i = Number(go.dataset.go);
    var d = datasets[i];
    var grid = open[kind] && open[kind].grid;
    if (!grid) return;
    var mapping = Array.prototype.map.call(bodyOf(kind).querySelectorAll('select[data-target]'), function (s) { return Number(s.value); });
    if (mapping.every(function (si) { return si < 0; })) { flowErr(kind, 'Match at least one column.'); return; }
    var rows = grid.body.map(function (r) { return mapping.map(function (si) { return si >= 0 ? String(r[si] == null ? '' : r[si]) : ''; }); });
    go.disabled = true; go.textContent = 'Bringing in…';
    try {
      var res = await ownerJson('/api/data/import', 'POST', { datasetName: d.name, rows: rows, source: grid.source, origin: grid.origin, mode: 'merge', complete: grid.complete });
      delete open[kind];
      await refresh();
      say(els.note, d.name + ': ' + summary(res) + '. The answers use your data from now on.');
    } catch (err) {
      flowErr(kind, err.message);
      go.disabled = false; go.textContent = 'Bring in ' + rows.length + ' rows';
    }
  });

  // ── Opening a source ──────────────────────────────────────────────────────

  function openSource(kindName) {
    if (kindName === 'folder') { openFolder(); return; }
    if (kindName === 'whatsapp') {
      var guess = datasets.findIndex(function (d) { return /attend/i.test(d.name); });
      openFlow('whatsapp', '<p class="dt-panel__head">An exported chat</p>'
        + '<p class="dt-form__help">In WhatsApp, open the group → its name → Export chat → Without media, and choose the .txt file here. It is read in your browser; only the rows you map are sent to this application.</p>'
        + '<div class="dt-wa__mode">'
        + '<label><input type="radio" name="wa-mode" value="attendance"' + (guess >= 0 ? ' checked' : '') + '> Attendance replies (yes / no, per person, per day)</label>'
        + '<label><input type="radio" name="wa-mode" value="messages"' + (guess < 0 ? ' checked' : '') + '> Every message</label>'
        + '</div>'
        + '<div class="dt-map__actions"><label class="dt-form__field dt-form__field--inline">Into <select class="dt-select" data-wa-dataset="1">' + datasetOptions(guess >= 0 ? guess : 0) + '</select></label>'
        + '<label class="dt-btn dt-btn--file">Choose the export<input type="file" accept=".txt,text/plain" data-wa-file="1"></label>'
        + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>');
      return;
    }
    var k = kinds.find(function (x) { return x.kind === kindName; });
    if (!k) return;
    var kind = cardKind(kindName);
    var guessDs = datasets.findIndex(function (d) { return new RegExp(kindName.split('-')[0], 'i').test(d.name) || /attend/i.test(d.name) && kindName === 'whatsapp-business' || (k.provides || []).some(function (p) { return new RegExp(p, 'i').test(d.name); }); });
    var setupHtml = kindName === 'whatsapp-business'
      ? '<div class="dt-setup" id="dt-wa-setup"><p class="dt-setup__head">In the Meta app, WhatsApp → Configuration → Webhook:</p><dl class="dt-setup__lines"><dt>Callback URL</dt><dd><code id="dt-wa-url">…</code></dd><dt>Verify token</dt><dd><code id="dt-wa-verify">…</code></dd><dt>Subscribe to</dt><dd><code>messages</code></dd></dl></div>'
      : '';
    if (kindName === 'whatsapp-business') {
      ownerJson('/api/whatsapp/setup').then(function (st) {
        var u = document.getElementById('dt-wa-url'), v = document.getElementById('dt-wa-verify');
        if (u) u.textContent = st.webhookUrl; if (v) v.textContent = st.verifyToken;
      }).catch(function () {});
    }
    var brings = (k.provides || []).length
      ? '<p class="dt-form__brings"><b>It brings</b> ' + esc((k.provides || []).slice(0, 8).join(', ')) + '</p>'
      : '';
    openFlow(kind, '<p class="dt-panel__head">Connect ' + esc(k.label) + '</p>'
      + '<p class="dt-form__help">' + esc(k.help) + ' The credentials are kept encrypted in this application’s own database and never sent to Svarg.</p>'
      + brings
      + setupHtml
      + '<div class="dt-form__grid">'
      + '<label class="dt-form__field">Into which dataset<select class="dt-select" name="__dataset">' + datasetOptions(guessDs >= 0 ? guessDs : 0) + '</select></label>'
      + k.fields.map(function (f) {
        var input = f.options
          ? '<select name="' + esc(f.name) + '">' + f.options.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') + '</select>'
          : '<input type="' + (f.secret ? 'password' : 'text') + '" name="' + esc(f.name) + '" placeholder="' + esc(f.placeholder || '') + '" autocomplete="off">';
        return '<label class="dt-form__field">' + esc(f.label)
          + (f.required === false ? '<span class="dt-form__opt">optional</span>' : '')
          + input
          + (f.hint ? '<em class="dt-form__note">' + esc(f.hint) + '</em>' : '')
          + '</label>';
      }).join('') + '</div>'
      + '<div class="dt-map__actions"><button type="button" class="dt-btn" data-connect="1" data-kind="' + esc(k.kind) + '">Test and connect</button>'
      + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>');
  }

  async function submitConnector(btn, kind) {
    var b = bodyOf(kind);
    var config = {}; var di = 0;
    b.querySelectorAll('[name]').forEach(function (el) { if (el.name === '__dataset') di = Number(el.value); else config[el.name] = el.value; });
    btn.disabled = true; btn.textContent = 'Testing…';
    var old = b.querySelector('.dt-card__err'); if (old) old.remove();
    try {
      var r = await ownerJson('/api/connectors', 'POST', { kind: btn.dataset.kind, datasetName: datasets[di].name, config: config });
      delete open[kind];
      await refresh();
      say(els.note, r.connector.label + ' connected to ' + datasets[di].name + (kind === 'whatsapp' ? '. Messages land here as they are sent.' : '. Press Sync now to bring its rows in, or set a schedule.'));
    } catch (err) {
      flowErr(kind, err.message);
      btn.disabled = false; btn.textContent = 'Test and connect';
    }
  }

  // ── Getting here and back ─────────────────────────────────────────────────

  // Delegated: the shell redraws the sidebar the link sits in once it
  // knows what the application holds, and a listener on the old element
  // would go with it.
  document.addEventListener('click', function (e) { var l = e.target.closest('#ch-data-link'); if (!l) return; e.preventDefault(); show('data'); });
  els.back.addEventListener('click', function (e) { e.preventDefault(); show('app'); });
  if (window.location.hash === '#data') {
    // A link from the Svarg go-live screen: straight to the room, through
    // the door if the door has not been passed yet.
    try { sessionStorage.setItem('ch-entered', '1'); } catch (e) { /* fine */ }
    var home = document.getElementById('ch-home'), greet = document.getElementById('ch-greet');
    if (home) home.hidden = true;
    if (greet) greet.hidden = true;
    show('data');
  }
})();
