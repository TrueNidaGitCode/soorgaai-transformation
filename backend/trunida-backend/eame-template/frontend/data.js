/**
 * The Data page -- the owner's, for bringing their own records in.
 *
 * The application was built on the SHAPE of its data: for each dataset, the
 * columns a sample file has. This page lets the owner replace that sample
 * with their own, column by column, without anything leaving their
 * application:
 *
 *   - a file (CSV, Excel) or a WhatsApp chat export, parsed here in the
 *     browser, matched onto the dataset's columns, and sent as rows to this
 *     application's own server, which writes them into the database that is
 *     theirs;
 *   - a live source (Jira, Confluence, GitHub) connected to this application
 *     directly, whose credentials are kept encrypted in that same database
 *     and whose rows are pulled on demand or on a schedule.
 *
 * Nothing goes to Svarg. Reached from the chat header once the front door
 * has been passed, and unlocked with the owner key from the Svarg go-live
 * screen. The public session that opens the chat can see the door and not
 * the room.
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
  function when(d) { try { return new Date(d).toLocaleString(); } catch (e) { return ''; } }

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

  // ── The datasets and their sources ────────────────────────────────────────

  var datasets = [];
  var kinds = [];        // what can be connected: { kind, label, help, fields, provides }
  var connectors = [];   // what is connected, across datasets

  var SOURCE_LABEL = { own: 'your file', whatsapp: 'WhatsApp export', jira: 'Jira', confluence: 'Confluence', github: 'GitHub', sample: 'sample' };
  function sourceLabel(s) { return SOURCE_LABEL[s] || s || 'your file'; }

  async function refresh() {
    try {
      var d = await ownerJson('/api/data/datasets');
      datasets = d.datasets || [];
      try {
        var c = await ownerJson('/api/connectors');
        kinds = c.kinds || [];
        connectors = c.connectors || [];
      } catch (err) { kinds = []; connectors = []; }
      renderDatasets();
      renderLog(d.imports || []);
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
      var kinds = Object.keys(s.sends || {});
      list.innerHTML = kinds.map(function (k) { return '<li><code>' + esc(k) + '</code><span>' + esc(s.sends[k]) + '</span></li>'; }).join('');
      var kept = s.kept || {};
      note.textContent = (s.configured ? 'The whole list; nothing else leaves this application.' : 'Reporting to Svarg is off on this application: nothing leaves it.')
        + ' Kept here: ' + (kept.conversations || 0) + ' conversations and ' + (kept.feedback || 0) + ' votes.';
    } catch (err) { list.innerHTML = ''; }
  }

  function renderDatasets() {
    if (!datasets.length) {
      els.list.innerHTML = '<p class="dt-empty">This application lists no datasets to import onto. It was built without sample data, so its seed script says what file it expects.</p>';
      return;
    }
    els.list.innerHTML = datasets.map(function (d, i) {
      var own = d.own;
      var state = own ? own.rows + ' rows from ' + sourceLabel(own.source) : d.sampleRows + ' sample rows';
      return '<section class="dt-set" data-i="' + i + '">'
        + '<header class="dt-set__head">'
        + '  <div><h3 class="dt-set__title">' + esc(d.name) + '</h3>'
        + '  <p class="dt-set__cols">' + d.columns.map(function (c) { return '<code>' + esc(c) + '</code>'; }).join(' ') + '</p></div>'
        + '  <span class="dt-set__state ' + (own ? 'dt-set__state--own' : '') + '">' + esc(state) + '</span>'
        + '</header>'
        + '<div class="dt-set__body">'
        + '  <label class="dt-file">Import a file'
        + '    <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-import="' + i + '">'
        + '  </label>'
        + '  <span class="dt-set__hint">CSV or Excel. Parsed here, in your browser; the rows go to this application and nowhere else.</span>'
        + '  <div class="dt-map" data-map="' + i + '" hidden></div>'
        + renderSources(d, i)
        + '  <p class="dt-note" data-note="' + i + '" hidden></p>'
        + '</div></section>';
    }).join('');
  }

  function renderSources(d, i) {
    var mine = connectors.filter(function (c) { return c.datasetName === d.name; });
    var chips = kinds.map(function (k) {
      return '<button type="button" class="dt-chip" data-add="' + esc(k.kind) + '" data-set="' + i + '">' + esc(k.label) + '</button>';
    }).join('') + '<button type="button" class="dt-chip" data-add="whatsapp" data-set="' + i + '">WhatsApp export</button>';
    return '<div class="dt-src">'
      + '<div class="dt-src__head"><p class="dt-src__title">Sources</p><div class="dt-src__add">' + chips + '</div></div>'
      + (mine.length ? '<ul class="dt-src__list">' + mine.map(renderConnector).join('') + '</ul>' : '')
      + '<div class="dt-form" data-form="' + i + '" hidden></div>'
      + '</div>';
  }

  function renderConnector(c) {
    var meta;
    if (c.status === 'error') meta = '<span class="dt-conn__meta dt-conn__meta--bad">' + esc(c.lastError || 'The last sync failed.') + '</span>';
    else if (c.status === 'syncing') meta = '<span class="dt-conn__meta">Syncing…</span>';
    else if (c.lastSyncAt) meta = '<span class="dt-conn__meta"><b>' + c.lastRows + ' rows</b> · last synced ' + esc(when(c.lastSyncAt)) + '</span>';
    else meta = '<span class="dt-conn__meta">Connected, not synced yet</span>';
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

  function renderLog(entries) {
    if (!entries.length) { els.log.innerHTML = '<p class="dt-empty">Nothing imported yet.</p>'; return; }
    els.log.innerHTML = entries.map(function (e) {
      return '<li><span>' + esc(e.datasetName) + '</span><span>' + esc(sourceLabel(e.source)) + '</span><span>' + e.rows + ' rows</span><span>' + esc(when(e.at)) + '</span></li>';
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

  // ── Reading a WhatsApp chat export ────────────────────────────────────────

  // One line per message, in either shape WhatsApp exports:
  //   12/03/2026, 18:04 - Name: message          (Android)
  //   [12/03/2026, 18:04:33] Name: message       (iPhone)
  // A line with no timestamp continues the message before it. A timestamped
  // line with no "Name:" is a system notice (someone joined, encryption) and
  // is skipped.
  var LINE = /^\[?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?)\]?\s*(?:-|–)?\s*(.*)$/;

  function parseWhatsApp(text) {
    var out = [];
    var lines = String(text || '').replace(/‎|‏|‪|‬/g, '').replace(/\r\n?/g, '\n').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = LINE.exec(lines[i]);
      if (!m) {
        if (out.length && lines[i].trim()) out[out.length - 1].message += '\n' + lines[i].trim();
        continue;
      }
      var rest = m[3];
      var colon = rest.indexOf(': ');
      if (colon < 1) continue; // a system notice
      out.push({ date: m[1], time: m[2].trim(), sender: rest.slice(0, colon).trim(), message: rest.slice(colon + 2).trim() });
    }
    return out;
  }

  // A reply in an attendance thread, read the way a coach reads it. "Not
  // coming" is checked before "coming"; anything that says neither is left
  // unclassified and the owner sees how many were.
  var ABSENT = /\b(not coming|can'?t|cannot|won'?t|unable|absent|skip|leave|sick|unwell|not available|will miss|missing|no)\b|❌|🙅|👎/i;
  var PRESENT = /\b(yes|yep|yeah|present|coming|attending|will come|will be there|i'?m in|count me in|ok|okay|sure|confirmed|available|done)\b|👍|✅|🙋/i;

  function classifyReply(text) {
    var t = String(text || '').trim();
    // A reply is short. An announcement ("Tomorrow 6am, reply yes/no") is long,
    // asks a question, or says both words at once -- and is not a reply.
    if (!t || t.length > 80 || t.indexOf('?') !== -1 || /yes\s*(\/|or)\s*no/i.test(t)) return '';
    // Absent first: "not coming" contains "coming".
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

  // ── Mapping columns and importing ─────────────────────────────────────────

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

  /** Show the column-matching table for a grid read from a file or an export. */
  function showMapping(i, grid, source, lead) {
    var d = datasets[i];
    var map = els.list.querySelector('[data-map="' + i + '"]');
    var header = grid.header, body = grid.body;
    var guess = guessMapping(d.columns, header);
    map.hidden = false;
    map.innerHTML = '<p class="dt-map__head">' + esc(lead || '') + ' Match your columns to the ones this application expects.</p>'
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
    map._grid = { header: header, body: body, source: source || 'own' };
    map.querySelectorAll('select[data-target]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var si = Number(sel.value);
        var cell = map.querySelector('[data-sample="' + sel.dataset.target + '"]');
        if (cell) cell.textContent = si >= 0 ? (body[0][si] || '') : '';
      });
    });
  }

  els.list.addEventListener('change', async function (e) {
    var input = e.target.closest('[data-import]');
    if (input && input.files && input.files[0]) {
      var i = Number(input.dataset.import);
      var note = els.list.querySelector('[data-note="' + i + '"]');
      say(note, '');
      try {
        var grid = await readFile(input.files[0]);
        if (grid.length < 2) throw new Error('That file has a header and no rows.');
        var header = grid[0].map(function (h) { return String(h).trim(); });
        showMapping(i, { header: header, body: grid.slice(1) }, 'own', (grid.length - 1) + ' rows read.');
      } catch (err) {
        say(note, err.message, true);
      } finally {
        input.value = '';
      }
      return;
    }

    var wa = e.target.closest('[data-wa-file]');
    if (wa && wa.files && wa.files[0]) {
      var wi = Number(wa.dataset.waFile);
      var wnote = els.list.querySelector('[data-note="' + wi + '"]');
      var form = els.list.querySelector('[data-form="' + wi + '"]');
      var mode = (form.querySelector('input[name="wa-mode"]:checked') || {}).value || 'messages';
      say(wnote, '');
      try {
        var wgrid = whatsAppGrid(await wa.files[0].text(), mode);
        form.hidden = true; form.innerHTML = '';
        showMapping(wi, wgrid, 'whatsapp', wgrid.note);
      } catch (err) {
        say(wnote, err.message, true);
      } finally {
        wa.value = '';
      }
      return;
    }

    var sched = e.target.closest('[data-schedule]');
    if (sched) {
      try { await ownerJson('/api/connectors/' + sched.dataset.schedule, 'PATCH', { schedule: sched.value }); }
      catch (err) { alert(err.message); }
    }
  });

  els.list.addEventListener('click', async function (e) {
    var cancel = e.target.closest('[data-cancel]');
    if (cancel) { var m = els.list.querySelector('[data-map="' + cancel.dataset.cancel + '"]'); m.hidden = true; m.innerHTML = ''; return; }

    var add = e.target.closest('[data-add]');
    if (add) { openForm(Number(add.dataset.set), add.dataset.add); return; }

    var closeForm = e.target.closest('[data-form-cancel]');
    if (closeForm) { var f = els.list.querySelector('[data-form="' + closeForm.dataset.formCancel + '"]'); f.hidden = true; f.innerHTML = ''; return; }

    var connect = e.target.closest('[data-connect]');
    if (connect) { await submitConnector(Number(connect.dataset.connect), connect); return; }

    var sync = e.target.closest('[data-sync]');
    if (sync) {
      sync.disabled = true; sync.textContent = 'Syncing…';
      try {
        var r = await ownerJson('/api/connectors/' + sync.dataset.sync + '/sync', 'POST');
        await refresh();
        var row = connectors.find(function (c) { return c.id === sync.dataset.sync; });
        var di = row ? datasets.findIndex(function (d) { return d.name === row.datasetName; }) : -1;
        if (di >= 0) say(els.list.querySelector('[data-note="' + di + '"]'), r.rows ? r.rows + ' rows synced into ' + row.datasetName + '. The answers use them from now on.' : (r.message || 'Nothing to sync.'));
      } catch (err) {
        await refresh();
        alert(err.message);
      }
      return;
    }

    var remove = e.target.closest('[data-remove]');
    if (remove) {
      if (!confirm('Remove this source? Its credentials are forgotten; the rows it brought stay.')) return;
      try { await ownerJson('/api/connectors/' + remove.dataset.remove, 'DELETE'); await refresh(); }
      catch (err) { alert(err.message); }
      return;
    }

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
      var res = await ownerJson('/api/data/import', 'POST', { datasetName: d.name, rows: rows, source: grid.source });
      map.hidden = true; map.innerHTML = '';
      say(note, res.rows + ' rows imported into ' + d.name + '. The answers use your data from now on.');
      await refresh();
    } catch (err) {
      say(note, err.message, true);
      go.disabled = false; go.textContent = 'Import ' + rows.length + ' rows';
    }
  });

  // ── Connecting a source ───────────────────────────────────────────────────

  function openForm(i, kindName) {
    var form = els.list.querySelector('[data-form="' + i + '"]');
    var note = els.list.querySelector('[data-note="' + i + '"]');
    say(note, '');
    form.hidden = false;
    if (kindName === 'whatsapp') {
      form.innerHTML = '<p class="dt-form__head">WhatsApp chat export</p>'
        + '<p class="dt-form__help">In WhatsApp, open the group → its name → Export chat → Without media, and choose the .txt file here. It is read in your browser; only the rows you map are sent to this application.</p>'
        + '<div class="dt-wa__mode">'
        + '<label><input type="radio" name="wa-mode" value="messages" checked> Every message</label>'
        + '<label><input type="radio" name="wa-mode" value="attendance"> Attendance replies (yes / no, per person, per day)</label>'
        + '</div>'
        + '<div class="dt-form__actions"><label class="dt-file">Choose the export<input type="file" accept=".txt,text/plain" data-wa-file="' + i + '"></label>'
        + '<button type="button" class="dt-btn dt-btn--quiet" data-form-cancel="' + i + '">Cancel</button></div>';
      return;
    }
    var k = kinds.find(function (x) { return x.kind === kindName; });
    if (!k) return;
    form.innerHTML = '<p class="dt-form__head">Connect ' + esc(k.label) + '</p>'
      + '<p class="dt-form__help">' + esc(k.help) + ' The credentials are kept encrypted in this application’s own database and never sent to Svarg.</p>'
      + '<div class="dt-form__grid">' + k.fields.map(function (f) {
        var input = f.options
          ? '<select name="' + esc(f.name) + '">' + f.options.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') + '</select>'
          : '<input type="' + (f.secret ? 'password' : 'text') + '" name="' + esc(f.name) + '" placeholder="' + esc(f.placeholder || '') + '" autocomplete="off">';
        return '<label class="dt-form__field">' + esc(f.label) + input + '</label>';
      }).join('') + '</div>'
      + '<div class="dt-form__actions"><button type="button" class="dt-btn" data-connect="' + i + '" data-kind="' + esc(k.kind) + '">Test and connect</button>'
      + '<button type="button" class="dt-btn dt-btn--quiet" data-form-cancel="' + i + '">Cancel</button>'
      + '<p class="dt-note" data-form-note="' + i + '" hidden></p></div>';
  }

  async function submitConnector(i, btn) {
    var form = els.list.querySelector('[data-form="' + i + '"]');
    var fnote = form.querySelector('[data-form-note]');
    var config = {};
    form.querySelectorAll('[name]').forEach(function (el) { if (el.name !== 'wa-mode') config[el.name] = el.value; });
    btn.disabled = true; btn.textContent = 'Testing…';
    say(fnote, '');
    try {
      var r = await ownerJson('/api/connectors', 'POST', { kind: btn.dataset.kind, datasetName: datasets[i].name, config: config });
      await refresh();
      say(els.list.querySelector('[data-note="' + i + '"]'), r.connector.label + ' connected. Press Sync now to bring its rows in, or set a schedule.');
    } catch (err) {
      say(fnote, err.message, true);
      btn.disabled = false; btn.textContent = 'Test and connect';
    }
  }

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
