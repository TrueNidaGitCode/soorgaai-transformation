/**
 * The Data page -- the owner's, for connecting where their records live.
 *
 * The page opens on SOURCES, in the order this industry works (from
 * data/sources.json, which Eame wrote from the industry's knowledge): a
 * folder of spreadsheets, WhatsApp, a form, or Jira, Confluence and GitHub
 * for a team that runs on those. Each is one card with one way in:
 *
 *   - a FOLDER: the whole folder at once. Every spreadsheet in it is read
 *     here, in the browser, matched to the dataset it fits by its columns,
 *     and the owner confirms the matching on one screen. Uploading the same
 *     folder again is a sync: rows are matched by the dataset's key, new
 *     ones added, changed ones updated, and a row a sheet no longer has is
 *     kept and counted, never deleted.
 *   - a FILE, onto one dataset, column by column -- for the odd file that
 *     belongs nowhere else.
 *   - a WHATSAPP chat export, parsed here into messages or attendance
 *     replies.
 *   - a LIVE SOURCE (Jira, Confluence, GitHub) connected to this application
 *     directly, credentials kept encrypted in its own database, rows pulled
 *     on demand or on a schedule.
 *
 * Under the sources, the record of what arrived: one row per dataset, its
 * key, what it holds and from where. Nothing goes to Svarg. Reached from the
 * chat header once the front door has been passed, and unlocked with the
 * owner key from the Svarg go-live screen.
 *
 * Fixed runtime, like index.html: the same for every application, so it is
 * tested once. It drives only ids of its own (#dt-*) and one link in the
 * chat header.
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
    also: document.getElementById('dt-also'),
    panel: document.getElementById('dt-panel'),
    note: document.getElementById('dt-note'),
    table: document.getElementById('dt-datasets'),
    log: document.getElementById('dt-log'),
    open: document.getElementById('ch-data-link'),
    back: document.getElementById('dt-back'),
    lock: document.getElementById('dt-lock'),
  };

  var ownerToken = '';
  try { ownerToken = localStorage.getItem('ownerToken') || ''; } catch (e) { /* fine */ }

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function say(el, text, bad) { if (!el) return; el.textContent = text || ''; el.hidden = !text; el.classList.toggle('dt-note--bad', !!bad); }
  function when(d) { try { return new Date(d).toLocaleString(); } catch (e) { return ''; } }
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

  function show(which) {
    app.hidden = which === 'data';
    page.hidden = which !== 'data';
    if (which === 'data') { if (ownerToken) enter(); else gate(); }
  }

  function gate() {
    els.gate.hidden = false;
    els.room.hidden = true;
    fetch(API + '/api/data/owner-status').then(function (r) { return r.ok ? r.json() : { configured: false }; })
      .then(function (d) {
        say(els.keyNote, d.configured ? '' : 'No owner key is set on this application, so nothing can be imported yet. If it runs on Svarg, the key is on the go-live screen; if you host it yourself, set APP_OWNER_KEY.', !d.configured);
      }).catch(function () {});
  }

  async function enter() {
    els.gate.hidden = true;
    els.room.hidden = false;
    await refresh();
  }

  async function ownerFetch(path, opts) {
    var o = opts || {};
    o.headers = Object.assign({}, o.headers || {}, { Authorization: 'Bearer ' + ownerToken });
    var r = await fetch(API + path, o);
    if (r.status === 401 || r.status === 403) {
      ownerToken = '';
      try { localStorage.removeItem('ownerToken'); } catch (e) { /* fine */ }
      gate();
      say(els.keyNote, 'Your owner session has ended. Enter the key again.', true);
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

  els.lock.addEventListener('click', function () {
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

  var SOURCE_LABEL = { own: 'a file', folder: 'your folder', whatsapp: 'WhatsApp export', 'whatsapp-business': 'WhatsApp Business', chat: 'the chat', jira: 'Jira', confluence: 'Confluence', github: 'GitHub', sample: 'sample' };
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
      renderTable();
      renderLog();
      renderSignals();
    } catch (err) { /* the gate said why */ }
  }

  // ── What Svarg is told ────────────────────────────────────────────────────

  async function renderSignals() {
    var list = document.getElementById('dt-signals-list');
    var note = document.getElementById('dt-signals-note');
    if (!list) return;
    try {
      var s = await ownerJson('/api/signals');
      var names = Object.keys(s.sends || {});
      list.innerHTML = names.map(function (k) { return '<li><code>' + esc(k) + '</code><span>' + esc(s.sends[k]) + '</span></li>'; }).join('');
      var kept = s.kept || {};
      note.textContent = (s.configured ? 'The whole list; nothing else leaves this application.' : 'Reporting to Svarg is off on this application: nothing leaves it.')
        + ' Kept here: ' + (kept.conversations || 0) + ' conversations and ' + (kept.feedback || 0) + ' votes.';
    } catch (err) { list.innerHTML = ''; }
  }

  // ── Where your data lives ─────────────────────────────────────────────────

  var ICON = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/><path d="M9 10a1 1 0 0 1 1-1h.5l1 2-.8.8a5 5 0 0 0 2.5 2.5l.8-.8 2 1v.5a1 1 0 0 1-1 1A6 6 0 0 1 9 10z"/></svg>',
    form: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  };

  function lastImport(source) {
    return imports.find(function (e) { return e.source === source; }) || null;
  }
  function importsOf(source) {
    return imports.filter(function (e) { return e.source === source; });
  }

  function renderSources() {
    var list = sources.length ? sources.slice() : [{ kind: 'folder', label: 'Your folder of spreadsheets', providers: ['upload'], note: 'Upload the folder your records are kept in; each sheet is matched to what the application expects.' }];
    // A connector this application shipped with is a source too, even if the
    // industry did not list it first.
    kinds.forEach(function (k) { if (!list.some(function (s) { return s.kind === k.kind || (s.kind === 'whatsapp' && k.kind === 'whatsapp-business'); })) list.push({ kind: k.kind, label: k.label, providers: ['live'], note: k.help, also: true }); });
    var main = list.filter(function (s) { return !s.also; });
    var also = list.filter(function (s) { return s.also; });
    els.sources.innerHTML = main.map(renderSource).join('');
    els.also.hidden = !also.length;
    els.also.innerHTML = also.length ? '<span class="dt-also__label">Also</span>' + also.map(function (s) { return '<button type="button" class="dt-chip" data-open="' + esc(s.kind) + '">' + esc(s.label) + '</button>'; }).join('') : '';
    if (!datasets.length) say(els.note, 'This application lists no datasets to bring records onto. It was built without sample data, so its seed script says what file it expects.', true);
  }

  function renderSource(s) {
    var status = '', action = '', tone = '';
    var mine = connectors.filter(function (c) { return c.kind === s.kind; });
    // A card's kind and a connection's kind differ for WhatsApp: the card is
    // the source, the connection is the business account.
    if (s.kind === 'folder') {
      var f = importsOf('folder');
      if (f.length) {
        var files = {}; f.forEach(function (e) { (e.origin || '').split(', ').forEach(function (n) { if (n) files[n] = 1; }); });
        status = plural(Object.keys(files).length, 'file') + ' read · last ' + ago(f[0].at); tone = 'on';
      } else status = 'Not read yet';
      action = '<label class="dt-btn dt-btn--file">Upload the folder<input type="file" webkitdirectory directory multiple data-folder="1"></label>'
        + '<label class="dt-btn dt-btn--quiet dt-btn--file">Add a file<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-onefile="1"></label>';
    } else if (s.kind === 'whatsapp') {
      var w = lastImport('whatsapp');
      var biz = kinds.find(function (x) { return x.kind === 'whatsapp-business'; });
      mine = connectors.filter(function (c) { return c.kind === 'whatsapp-business'; });
      if (mine.length) { status = 'Business number connected' + (mine[0].lastSyncAt ? ' · last message landed ' + ago(mine[0].lastSyncAt) : ' · waiting for the first message'); tone = 'on'; }
      else { status = w ? plural(w.rows, 'row') + ' from an export · last ' + ago(w.at) : 'Not connected'; tone = w ? 'on' : ''; }
      var providers = s.providers || ['export'];
      action = (biz && providers.indexOf('business-account') !== -1 ? '<button type="button" class="dt-btn" data-open="whatsapp-business">' + (mine.length ? 'Connect another number' : 'Connect a business account') + '</button>' : '')
        + (providers.indexOf('export') !== -1 ? '<button type="button" class="dt-btn' + (biz ? ' dt-btn--quiet' : '') + '" data-open="whatsapp">Import an exported chat</button>' : '')
        + (!biz && providers.indexOf('business-account') !== -1 ? '<span class="dt-card__soon" title="A WhatsApp Business number, so replies arrive here as they are sent. Not shipped with this application.">Business account · not on this application</span>' : '');
    } else if (s.kind === 'form') {
      status = 'Its responses sheet goes in your folder';
      action = '<label class="dt-btn dt-btn--quiet dt-btn--file">Upload the responses sheet<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-onefile="1"></label>';
    } else if (s.kind === 'file') {
      var o = lastImport('own');
      status = o ? plural(o.rows, 'row') + ' · last ' + ago(o.at) : 'Nothing yet';
      action = '<label class="dt-btn dt-btn--quiet dt-btn--file">Add a file<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-onefile="1"></label>';
    } else {
      // A live source: connected once per dataset it feeds.
      var k = kinds.find(function (x) { return x.kind === s.kind; });
      if (!k) { status = 'Not available on this application'; }
      else if (mine.length) { status = plural(mine.length, 'connection') + (mine[0].lastSyncAt ? ' · last synced ' + ago(mine[0].lastSyncAt) : ' · not synced yet'); tone = 'on'; }
      else status = 'Not connected';
      action = k ? '<button type="button" class="dt-btn" data-open="' + esc(s.kind) + '">' + (mine.length ? 'Connect another' : 'Connect') + '</button>' : '';
    }
    var icon = ICON[s.kind] || ICON.live;
    return '<article class="dt-card dt-card--' + esc(s.kind) + '" data-card="' + esc(s.kind) + '">'
      + '<div class="dt-card__head"><span class="dt-card__icon" aria-hidden="true">' + icon + '</span><div><h3 class="dt-card__title">' + esc(s.label) + '</h3>'
      + '<p class="dt-card__status' + (tone ? ' dt-card__status--on' : '') + '">' + esc(status) + '</p></div></div>'
      + (s.note ? '<p class="dt-card__note">' + esc(s.note) + '</p>' : '')
      + (s.holds && s.holds.length ? '<p class="dt-card__holds">Usually holds: ' + esc(s.holds.join(', ')) + '</p>' : '')
      + (mine.length ? '<ul class="dt-src__list">' + mine.map(renderConnector).join('') + '</ul>' : '')
      + '<div class="dt-card__actions">' + action + '</div>'
      + '</article>';
  }

  function renderConnector(c) {
    var meta;
    if (c.status === 'error') meta = '<span class="dt-conn__meta dt-conn__meta--bad">' + esc(c.lastError || 'The last sync failed.') + '</span>';
    else if (c.status === 'syncing') meta = '<span class="dt-conn__meta">Syncing…</span>';
    else if (c.lastSyncAt) meta = '<span class="dt-conn__meta"><b>' + c.lastRows + ' rows</b> into ' + esc(c.datasetName) + ' · ' + esc(ago(c.lastSyncAt)) + '</span>';
    else meta = '<span class="dt-conn__meta">Into ' + esc(c.datasetName) + ' · not synced yet</span>';
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

  // ── What the application holds ────────────────────────────────────────────

  function renderTable() {
    if (!datasets.length) { els.table.innerHTML = ''; return; }
    els.table.innerHTML = '<thead><tr><th>Dataset</th><th>Key</th><th>Holds</th><th>From</th><th>Last change</th><th></th></tr></thead><tbody>'
      + datasets.map(function (d, i) {
        var own = d.held > 0 || !!d.own;
        var from = own ? Object.keys(d.bySource || {}).map(function (s) { return sourceLabel(s) + ' ' + d.bySource[s]; }).join(' · ') : 'sample data';
        var holds = own ? plural(d.held || (d.own ? d.own.rows : 0), 'row') + (d.missing ? ' <em class="dt-table__missing" title="Rows a sheet no longer has: kept, never deleted">' + d.missing + ' gone from the sheet</em>' : '') : plural(d.sampleRows || 0, 'sample row');
        return '<tr>'
          + '<td><strong>' + esc(d.name) + '</strong><span class="dt-table__cols" title="' + esc(d.columns.join(', ')) + '">' + plural(d.columns.length, 'column') + '</span></td>'
          + '<td><code>' + esc(d.key || '—') + '</code></td>'
          + '<td>' + holds + '</td>'
          + '<td>' + esc(from) + '</td>'
          + '<td>' + (d.lastChange ? esc(ago(d.lastChange)) : '—') + '</td>'
          + '<td class="dt-table__act"><span class="dt-pill' + (own ? ' dt-pill--on' : '') + '">' + (own ? 'your data' : 'sample') + '</span>'
          + '<label class="dt-mini dt-btn--file">Import a file<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-import="' + i + '"></label></td>'
          + '</tr>';
      }).join('') + '</tbody>';
  }

  function renderLog() {
    if (!imports.length) { els.log.innerHTML = '<p class="dt-empty">Nothing brought in yet.</p>'; return; }
    els.log.innerHTML = imports.slice(0, 30).map(function (e) {
      var what = [];
      if (e.added) what.push('+' + e.added);
      if (e.updated) what.push(e.updated + ' changed');
      if (e.missing) what.push(e.missing + ' gone');
      return '<li><span>' + esc(when(e.at)) + '</span><span>' + esc(sourceLabel(e.source)) + (e.origin ? ' · ' + esc(e.origin) : '') + '</span><span>&rarr; ' + esc(e.datasetName) + '</span><span>' + esc(what.length ? what.join(', ') : plural(e.rows, 'row')) + '</span></li>';
    }).join('');
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

  function openPanel(html) { els.panel.hidden = false; els.panel.innerHTML = html; say(els.note, ''); els.panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function closePanel() { els.panel.hidden = true; els.panel.innerHTML = ''; els.panel._grid = null; els.panel._sheets = null; }

  // ── A file onto one dataset ───────────────────────────────────────────────

  function showMapping(i, grid, source, lead, origin, complete) {
    var d = datasets[i];
    var header = grid.header, body = grid.body;
    var guess = guessMapping(d.columns, header);
    openPanel('<p class="dt-panel__head">' + esc(lead || '') + ' Match your columns to the ones <strong>' + esc(d.name) + '</strong> expects.</p>'
      + '<table class="dt-map__table"><thead><tr><th>Expected</th><th>Your column</th><th>First value</th></tr></thead><tbody>'
      + d.columns.map(function (c, ti) {
        return '<tr><td><code>' + esc(c) + '</code>' + (d.key && d.key.split(' + ').indexOf(c) !== -1 ? ' <span class="dt-key">key</span>' : '') + '</td><td><select data-target="' + ti + '">'
          + '<option value="-1">— leave empty —</option>'
          + header.map(function (h, si) { return '<option value="' + si + '"' + (guess[ti] === si ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('')
          + '</select></td><td class="dt-map__sample" data-sample="' + ti + '">' + esc(guess[ti] >= 0 ? body[0][guess[ti]] : '') + '</td></tr>';
      }).join('')
      + '</tbody></table>'
      + '<div class="dt-map__actions"><button type="button" class="dt-btn" data-go="' + i + '">Bring in ' + body.length + ' rows</button>'
      + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>');
    els.panel._grid = { header: header, body: body, source: source || 'own', origin: origin || '', complete: complete !== false };
    els.panel.querySelectorAll('select[data-target]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var si = Number(sel.value);
        var cell = els.panel.querySelector('[data-sample="' + sel.dataset.target + '"]');
        if (cell) cell.textContent = si >= 0 ? (body[0][si] || '') : '';
      });
    });
  }

  function datasetOptions(selected) {
    return datasets.map(function (d, i) { return '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('');
  }

  /** One file with no dataset named yet: ask which, then match. */
  async function oneFile(file) {
    try {
      var grid = await readFile(file);
      var header = grid[0].map(function (h) { return String(h).trim(); });
      var best = bestDataset(header);
      openPanel('<p class="dt-panel__head"><strong>' + esc(file.name) + '</strong>: ' + (grid.length - 1) + ' rows. Which dataset is it?</p>'
        + '<div class="dt-map__actions"><select class="dt-select" data-pick-dataset="1">' + datasetOptions(best >= 0 ? best : 0) + '</select>'
        + '<button type="button" class="dt-btn" data-pick-go="1">Match the columns</button><button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>');
      els.panel._pending = { grid: grid, header: header, origin: file.name };
    } catch (err) { say(els.note, err.message, true); }
  }

  // ── The folder ────────────────────────────────────────────────────────────

  /**
   * Every spreadsheet in the folder, read here and matched to a dataset by
   * its columns; the owner confirms on one screen. Two sheets that fit the
   * same dataset (a fee sheet per year) land together as one; a sheet that
   * fits nothing is listed as not used, and a file that is not a
   * spreadsheet is named so the owner knows it was seen.
   */
  async function folder(files) {
    var all = Array.prototype.slice.call(files);
    var sheets = [], others = [], failed = [];
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      if (/(^|\/)[.~$]/.test(f.webkitRelativePath || f.name)) continue; // hidden and lock files
      if (!SHEET.test(f.name)) { others.push(f.name); continue; }
      try { (await readSheets(f)).forEach(function (s) { sheets.push(s); }); }
      catch (err) { failed.push(f.name + ' (' + err.message + ')'); }
    }
    if (!sheets.length) { say(els.note, all.length ? 'No spreadsheet with rows was found in that folder (' + all.length + ' files looked at).' : 'That folder is empty.', true); return; }
    var rows = sheets.map(function (s) {
      var header = s.grid[0].map(function (h) { return String(h).trim(); });
      return { name: s.name, header: header, body: s.grid.slice(1), dataset: bestDataset(header) };
    });
    openPanel('<p class="dt-panel__head"><strong>' + plural(sheets.length, 'sheet') + '</strong> read from the folder' + (others.length ? ', ' + plural(others.length, 'other file') + ' not used' : '') + '. Check where each one goes.</p>'
      + '<table class="dt-map__table dt-folder"><thead><tr><th>Sheet</th><th>Rows</th><th>Goes to</th><th>Columns matched</th></tr></thead><tbody>'
      + rows.map(function (r, ri) {
        return '<tr data-sheet="' + ri + '"><td class="dt-folder__name" title="' + esc(r.header.join(', ')) + '">' + esc(r.name) + '</td><td>' + r.body.length + '</td>'
          + '<td><select class="dt-select" data-sheet-dataset="' + ri + '"><option value="-1"' + (r.dataset < 0 ? ' selected' : '') + '>— not used —</option>' + datasetOptions(r.dataset) + '</select></td>'
          + '<td class="dt-folder__fit" data-fit="' + ri + '">' + fitText(r) + '</td></tr>';
      }).join('')
      + '</tbody></table>'
      + (others.length ? '<p class="dt-panel__aside">Not spreadsheets, so not used: ' + esc(others.slice(0, 8).join(', ')) + (others.length > 8 ? ' and ' + (others.length - 8) + ' more' : '') + '.</p>' : '')
      + (failed.length ? '<p class="dt-panel__aside dt-note--bad">Could not read: ' + esc(failed.join('; ')) + '</p>' : '')
      + '<div class="dt-map__actions"><button type="button" class="dt-btn" data-folder-go="1">Bring in ' + plural(rows.filter(function (r) { return r.dataset >= 0; }).length, 'sheet') + '</button>'
      + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>');
    els.panel._sheets = rows;
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
    var rows = els.panel._sheets || [];
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
    if (!keys.length) { say(els.note, 'Nothing is marked to go anywhere.', true); return; }
    btn.disabled = true; btn.textContent = 'Bringing in…';
    var lines = [], bad = [];
    for (var i = 0; i < keys.length; i++) {
      var g = groups[keys[i]];
      try {
        var res = await ownerJson('/api/data/import', 'POST', { datasetName: g.dataset.name, rows: g.rows, source: 'folder', origin: g.origin.join(', '), mode: 'merge', complete: true });
        lines.push(g.dataset.name + ': ' + summary(res));
      } catch (err) { bad.push(g.dataset.name + ': ' + err.message); }
    }
    closePanel();
    await refresh();
    say(els.note, lines.join(' · ') + (bad.length ? ' — ' + bad.join('; ') : '') + (lines.length ? '. Upload the folder again whenever the sheets change; only what changed moves.' : ''), !lines.length);
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
    if (t.matches('[data-folder]') && t.files && t.files.length) { await folder(t.files); t.value = ''; return; }
    if (t.matches('[data-onefile]') && t.files && t.files[0]) { await oneFile(t.files[0]); t.value = ''; return; }

    var input = t.closest('[data-import]');
    if (input && input.files && input.files[0]) {
      var i = Number(input.dataset.import);
      try {
        var grid = await readFile(input.files[0]);
        var header = grid[0].map(function (h) { return String(h).trim(); });
        showMapping(i, { header: header, body: grid.slice(1) }, 'own', (grid.length - 1) + ' rows read from ' + input.files[0].name + '.', input.files[0].name, true);
      } catch (err) { say(els.note, err.message, true); }
      finally { input.value = ''; }
      return;
    }

    var wa = t.closest('[data-wa-file]');
    if (wa && wa.files && wa.files[0]) {
      var mode = (els.panel.querySelector('input[name="wa-mode"]:checked') || {}).value || 'messages';
      var wi = Number((els.panel.querySelector('[data-wa-dataset]') || {}).value || 0);
      try {
        var wgrid = whatsAppGrid(await wa.files[0].text(), mode);
        // An export is a slice of the group at one moment, never the whole of
        // what WhatsApp holds: nothing is marked missing because of it.
        showMapping(wi, wgrid, 'whatsapp', wgrid.note, wa.files[0].name, false);
      } catch (err) { say(els.note, err.message, true); }
      finally { wa.value = ''; }
      return;
    }

    var sd = t.closest('[data-sheet-dataset]');
    if (sd) {
      var ri = Number(sd.dataset.sheetDataset);
      var r = els.panel._sheets[ri]; r.dataset = Number(sd.value);
      els.panel.querySelector('[data-fit="' + ri + '"]').innerHTML = fitText(r);
      var goBtn = els.panel.querySelector('[data-folder-go]');
      if (goBtn) goBtn.textContent = 'Bring in ' + plural(els.panel._sheets.filter(function (x) { return x.dataset >= 0; }).length, 'sheet');
      return;
    }

    var sched = t.closest('[data-schedule]');
    if (sched) {
      try { await ownerJson('/api/connectors/' + sched.dataset.schedule, 'PATCH', { schedule: sched.value }); }
      catch (err) { alert(err.message); }
    }
  });

  page.addEventListener('click', async function (e) {
    var t = e.target;
    if (t.closest('[data-cancel]')) { closePanel(); return; }

    var open = t.closest('[data-open]');
    if (open) { openSource(open.dataset.open); return; }

    var pick = t.closest('[data-pick-go]');
    if (pick) {
      var p = els.panel._pending; if (!p) return;
      var di = Number((els.panel.querySelector('[data-pick-dataset]') || {}).value || 0);
      showMapping(di, { header: p.header, body: p.grid.slice(1) }, 'own', (p.grid.length - 1) + ' rows read from ' + p.origin + '.', p.origin, true);
      return;
    }

    var fg = t.closest('[data-folder-go]');
    if (fg) { await folderGo(fg); return; }

    var connect = t.closest('[data-connect]');
    if (connect) { await submitConnector(connect); return; }

    var sync = t.closest('[data-sync]');
    if (sync) {
      sync.disabled = true; sync.textContent = 'Syncing…';
      try {
        var r = await ownerJson('/api/connectors/' + sync.dataset.sync + '/sync', 'POST');
        var row = connectors.find(function (c) { return c.id === sync.dataset.sync; });
        await refresh();
        say(els.note, r.rows ? r.rows + ' rows synced into ' + (row ? row.datasetName : 'the dataset') + '. The answers use them from now on.' : (r.message || 'Nothing to sync.'));
      } catch (err) { await refresh(); alert(err.message); }
      return;
    }

    var remove = t.closest('[data-remove]');
    if (remove) {
      if (!confirm('Remove this source? Its credentials are forgotten; the rows it brought stay.')) return;
      try { await ownerJson('/api/connectors/' + remove.dataset.remove, 'DELETE'); await refresh(); }
      catch (err) { alert(err.message); }
      return;
    }

    var go = t.closest('[data-go]');
    if (!go) return;
    var i = Number(go.dataset.go);
    var d = datasets[i];
    var grid = els.panel._grid;
    if (!grid) return;
    var mapping = Array.prototype.map.call(els.panel.querySelectorAll('select[data-target]'), function (s) { return Number(s.value); });
    if (mapping.every(function (si) { return si < 0; })) { say(els.note, 'Match at least one column.', true); return; }
    var rows = grid.body.map(function (r) { return mapping.map(function (si) { return si >= 0 ? String(r[si] == null ? '' : r[si]) : ''; }); });
    go.disabled = true; go.textContent = 'Bringing in…';
    try {
      var res = await ownerJson('/api/data/import', 'POST', { datasetName: d.name, rows: rows, source: grid.source, origin: grid.origin, mode: 'merge', complete: grid.complete });
      closePanel();
      await refresh();
      say(els.note, d.name + ': ' + summary(res) + '. The answers use your data from now on.');
    } catch (err) {
      say(els.note, err.message, true);
      go.disabled = false; go.textContent = 'Bring in ' + rows.length + ' rows';
    }
  });

  // ── Opening a source ──────────────────────────────────────────────────────

  function openSource(kindName) {
    if (kindName === 'whatsapp') {
      var guess = datasets.findIndex(function (d) { return /attend/i.test(d.name); });
      openPanel('<p class="dt-panel__head">WhatsApp chat export</p>'
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
    openPanel('<p class="dt-panel__head">Connect ' + esc(k.label) + '</p>'
      + '<p class="dt-form__help">' + esc(k.help) + ' The credentials are kept encrypted in this application’s own database and never sent to Svarg.</p>'
      + setupHtml
      + '<div class="dt-form__grid">'
      + '<label class="dt-form__field">Into which dataset<select class="dt-select" name="__dataset">' + datasetOptions(guessDs >= 0 ? guessDs : 0) + '</select></label>'
      + k.fields.map(function (f) {
        var input = f.options
          ? '<select name="' + esc(f.name) + '">' + f.options.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') + '</select>'
          : '<input type="' + (f.secret ? 'password' : 'text') + '" name="' + esc(f.name) + '" placeholder="' + esc(f.placeholder || '') + '" autocomplete="off">';
        return '<label class="dt-form__field">' + esc(f.label) + input + '</label>';
      }).join('') + '</div>'
      + '<div class="dt-map__actions"><button type="button" class="dt-btn" data-connect="1" data-kind="' + esc(k.kind) + '">Test and connect</button>'
      + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="1">Cancel</button></div>'
      + '<p class="dt-note" data-form-note="1" hidden></p>');
  }

  async function submitConnector(btn) {
    var fnote = els.panel.querySelector('[data-form-note]');
    var config = {}; var di = 0;
    els.panel.querySelectorAll('[name]').forEach(function (el) { if (el.name === '__dataset') di = Number(el.value); else config[el.name] = el.value; });
    btn.disabled = true; btn.textContent = 'Testing…';
    say(fnote, '');
    try {
      var r = await ownerJson('/api/connectors', 'POST', { kind: btn.dataset.kind, datasetName: datasets[di].name, config: config });
      closePanel();
      await refresh();
      say(els.note, r.connector.label + ' connected to ' + datasets[di].name + '. Press Sync now to bring its rows in, or set a schedule.');
    } catch (err) {
      say(fnote, err.message, true);
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
