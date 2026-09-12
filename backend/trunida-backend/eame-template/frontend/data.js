/**
 * The Data page -- the owner's, for bringing their own records in.
 *
 * The application was built on the SHAPE of its data: for each dataset, the
 * columns a sample file has. This page lets the owner replace that sample
 * with their own file, column by column, without the file ever leaving
 * their application: it is parsed here in the browser, matched onto the
 * dataset's columns, and sent as rows to this application's own server,
 * which writes them into the database that is theirs. Nothing goes to Svarg.
 *
 * Reached from the chat header once the front door has been passed, and
 * unlocked with the owner key from the Svarg go-live screen. The public
 * session that opens the chat can see the door and not the room.
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
    list: document.getElementById('dt-datasets'),
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

  // ── The key ───────────────────────────────────────────────────────────────

  els.keyForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    say(els.keyNote, '');
    var key = (els.keyInput.value || '').trim();
    if (!key) return;
    try {
      var r = await fetch(API + '/api/data/owner-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { say(els.keyNote, d.error || 'That did not work.', true); return; }
      ownerToken = d.token;
      try { localStorage.setItem('ownerToken', ownerToken); } catch (err) { /* fine */ }
      els.keyInput.value = '';
      enter();
    } catch (err) {
      say(els.keyNote, 'Could not reach the server.', true);
    }
  });

  els.lock.addEventListener('click', function () {
    ownerToken = '';
    try { localStorage.removeItem('ownerToken'); } catch (e) { /* fine */ }
    gate();
  });

  // ── The datasets ──────────────────────────────────────────────────────────

  var datasets = [];

  async function refresh() {
    try {
      var r = await ownerFetch('/api/data/datasets');
      var d = await r.json();
      datasets = d.datasets || [];
      renderDatasets();
      renderLog(d.imports || []);
    } catch (err) { /* the gate said why */ }
  }

  function renderDatasets() {
    if (!datasets.length) {
      els.list.innerHTML = '<p class="dt-empty">This application lists no datasets to import onto. It was built without sample data, so its seed script says what file it expects.</p>';
      return;
    }
    els.list.innerHTML = datasets.map(function (d, i) {
      var own = d.own;
      return '<section class="dt-set" data-i="' + i + '">'
        + '<header class="dt-set__head">'
        + '  <div><h3 class="dt-set__title">' + esc(d.name) + '</h3>'
        + '  <p class="dt-set__cols">' + d.columns.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</p></div>'
        + '  <span class="dt-set__state ' + (own ? 'dt-set__state--own' : '') + '">' + (own ? own.rows + ' of your rows' : d.sampleRows + ' sample rows') + '</span>'
        + '</header>'
        + '<div class="dt-set__body">'
        + '  <label class="dt-file">Import a file'
        + '    <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-import="' + i + '">'
        + '  </label>'
        + '  <span class="dt-set__hint">CSV or Excel. Parsed here, in your browser; the rows go to this application and nowhere else.</span>'
        + '  <div class="dt-map" data-map="' + i + '" hidden></div>'
        + '  <p class="dt-note" data-note="' + i + '" hidden></p>'
        + '</div></section>';
    }).join('');
  }

  function renderLog(entries) {
    if (!entries.length) { els.log.innerHTML = '<p class="dt-empty">Nothing imported yet.</p>'; return; }
    els.log.innerHTML = entries.map(function (e) {
      return '<li><span>' + esc(e.datasetName) + '</span><span>' + e.rows + ' rows</span><span>' + esc(new Date(e.at).toLocaleString()) + '</span></li>';
    }).join('');
  }

  // ── Reading a file ────────────────────────────────────────────────────────

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

  async function readFile(file) {
    var name = file.name.toLowerCase();
    if (/\.xlsx?$/.test(name)) {
      if (!window.XLSX) throw new Error('Excel files need the spreadsheet reader, which did not load. Save the sheet as CSV and import that.');
      var buf = await file.arrayBuffer();
      var wb = window.XLSX.read(buf, { type: 'array' });
      var sheet = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    }
    return parseCsv(await file.text());
  }

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  /** Best guess: same name, then one containing the other. */
  function guessMapping(targets, sources) {
    var used = {};
    return targets.map(function (t) {
      var nt = norm(t);
      var exact = sources.findIndex(function (s, i) { return !used[i] && norm(s) === nt; });
      var idx = exact;
      if (idx < 0) idx = sources.findIndex(function (s, i) { var ns = norm(s); return !used[i] && ns && (ns.indexOf(nt) !== -1 || nt.indexOf(ns) !== -1); });
      if (idx >= 0) used[idx] = true;
      return idx;
    });
  }

  els.list.addEventListener('change', async function (e) {
    var input = e.target.closest('[data-import]');
    if (!input || !input.files || !input.files[0]) return;
    var i = Number(input.dataset.import);
    var d = datasets[i];
    var note = els.list.querySelector('[data-note="' + i + '"]');
    var map = els.list.querySelector('[data-map="' + i + '"]');
    say(note, '');
    try {
      var grid = await readFile(input.files[0]);
      if (grid.length < 2) throw new Error('That file has a header and no rows.');
      var header = grid[0].map(function (h) { return String(h).trim(); });
      var body = grid.slice(1);
      var guess = guessMapping(d.columns, header);
      map.hidden = false;
      map.innerHTML = '<p class="dt-map__head">Match your columns to the ones this application expects. ' + body.length + ' rows read.</p>'
        + '<table class="dt-map__table"><thead><tr><th>Expected</th><th>Your column</th><th>First value</th></tr></thead><tbody>'
        + d.columns.map(function (c, ti) {
          return '<tr><td><code>' + esc(c) + '</code></td><td><select data-target="' + ti + '">'
            + '<option value="-1">— leave empty —</option>'
            + header.map(function (h, si) { return '<option value="' + si + '"' + (guess[ti] === si ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('')
            + '</select></td><td class="dt-map__sample" data-sample="' + ti + '">' + esc(guess[ti] >= 0 ? body[0][guess[ti]] : '') + '</td></tr>';
        }).join('')
        + '</tbody></table>'
        + '<div class="dt-map__actions"><button type="button" class="dt-btn" data-go="' + i + '">Import ' + body.length + ' rows</button>'
        + '<button type="button" class="dt-btn dt-btn--quiet" data-cancel="' + i + '">Cancel</button></div>';
      map._grid = { header: header, body: body };
      map.querySelectorAll('select[data-target]').forEach(function (sel) {
        sel.addEventListener('change', function () {
          var si = Number(sel.value);
          var cell = map.querySelector('[data-sample="' + sel.dataset.target + '"]');
          if (cell) cell.textContent = si >= 0 ? (body[0][si] || '') : '';
        });
      });
    } catch (err) {
      say(note, err.message, true);
    } finally {
      input.value = '';
    }
  });

  els.list.addEventListener('click', async function (e) {
    var cancel = e.target.closest('[data-cancel]');
    if (cancel) { var m = els.list.querySelector('[data-map="' + cancel.dataset.cancel + '"]'); m.hidden = true; m.innerHTML = ''; return; }
    var go = e.target.closest('[data-go]');
    if (!go) return;
    var i = Number(go.dataset.go);
    var d = datasets[i];
    var map = els.list.querySelector('[data-map="' + i + '"]');
    var note = els.list.querySelector('[data-note="' + i + '"]');
    var grid = map._grid;
    if (!grid) return;
    var mapping = Array.prototype.map.call(map.querySelectorAll('select[data-target]'), function (s) { return Number(s.value); });
    if (mapping.every(function (si) { return si < 0; })) { say(note, 'Match at least one column.', true); return; }
    var rows = grid.body.map(function (r) { return mapping.map(function (si) { return si >= 0 ? String(r[si] == null ? '' : r[si]) : ''; }); });
    go.disabled = true; go.textContent = 'Importing…';
    try {
      var r = await ownerFetch('/api/data/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetName: d.name, rows: rows }) });
      var res = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(res.error || 'The import failed.');
      map.hidden = true; map.innerHTML = '';
      say(note, res.rows + ' rows imported into ' + d.name + '. The answers use your data from now on.');
      await refresh();
    } catch (err) {
      say(note, err.message, true);
      go.disabled = false; go.textContent = 'Import ' + rows.length + ' rows';
    }
  });

  // ── Getting here and back ─────────────────────────────────────────────────

  els.open.addEventListener('click', function (e) { e.preventDefault(); show('data'); });
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
