/**
 * The Agents page — what this application is watching while nobody is looking.
 *
 * The chat is where an agent is created and explained; this is where its work
 * is read. At eight in the morning the owner wants to know what needs them
 * today, in about five seconds, and a chat transcript cannot do that — they
 * would be scrolling back through their own questions to find it.
 *
 * So: a map. The scheduler at the head, then one column per business category
 * the industry's knowledge base names — Retention, Utilisation, Growth, Cash
 * and Compliance for a clinic; Schedule, Quality, Cost, People, Customer and
 * Risk for an engineering organisation — and under each, every watcher that
 * belongs to it with its own state. The columns are read from
 * data/agents.json rather than written here, so publishing a new industry
 * changes this screen and no code changes with it.
 *
 * Grouped that way because it answers the question actually being asked. A
 * flat list of twenty-eight answers "what is switched on"; a column headed
 * Compliance with nothing under it answers "what is nobody watching", which
 * is the one an owner cannot work out for themselves.
 *
 * And the findings are the durable copy. An owner who missed the email, or
 * whose application cannot reach Svarg at all, still sees everything the
 * agents noticed, because a finding is recorded before anything is sent.
 *
 * Readable by anyone with a session; changeable only by the owner. A
 * colleague can already read every finding, and a page that would not show
 * them what produced one was answering the wrong question — it said "nothing
 * here can be watched until some records arrive", which was neither true nor
 * the real reason. An agent runs unattended and sends mail in the owner’s
 * name, so starting, pausing and removing stay theirs. The response says
 * which reader this is and the buttons are drawn from that, rather than from
 * a refusal the page has to provoke to discover.
 *
 * Fixed runtime, like data.js: the same for every application, so it is tested
 * once. It drives only ids of its own (#ag-*).
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var page = document.getElementById('ch-agents');
  if (!page) return;

  var els = {
    map: document.getElementById('ag-map'),
    detail: document.getElementById('ag-detail'),
    empty: document.getElementById('ag-empty'),
    note: document.getElementById('ag-note'),
    form: document.getElementById('ag-form'),
    name: document.getElementById('ag-name'),
    question: document.getElementById('ag-question'),
    schedule: document.getElementById('ag-schedule'),
    hour: document.getElementById('ag-hour'),
    back: document.getElementById('ag-back'),
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
    return fetch(API + '/api/agents' + (path || ''), o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error(body.error || ('Request failed (' + r.status + ')'));
        return body;
      });
    });
  }

  function say(text, bad) {
    if (!els.note) return;
    els.note.textContent = text || '';
    els.note.hidden = !text;
    els.note.className = 'ag-note' + (bad ? ' ag-note--bad' : '');
  }

  /** "every weekday at 7am", rather than a cron nobody should have to read. */
  function scheduleText(a) {
    var h = a.atHour === 0 ? '12am' : a.atHour < 12 ? a.atHour + 'am'
      : a.atHour === 12 ? '12pm' : (a.atHour - 12) + 'pm';
    if (a.schedule === 'hourly') return 'every hour';
    if (a.schedule === 'weekdays') return 'every weekday at ' + h;
    return 'every day at ' + h;
  }

  function when(iso) {
    if (!iso) return 'not yet';
    var d = new Date(iso);
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 60 * 24) return Math.round(mins / 60) + ' h ago';
    return Math.round(mins / 1440) + ' d ago';
  }

  /*
   * The map.
   *
   * Five states, and every one of them is read off a record rather than
   * inferred: a watcher is running, paused by the owner, stopped after
   * three failures, not started, or waiting on records it does not have.
   * There is deliberately no state meaning "checking right now" — a run
   * takes a moment and nothing records that it is in one, so a dot saying
   * so would be decoration.
   *
   * "Stopped" is said loudly, on the node and again at the head of the map.
   * Three consecutive failures is not a blip, and an owner who is not told
   * has a watcher that has silently stopped watching — which is worse than
   * one that never existed, because they believe it is covered.
   */
  var STATE = {
    running: { label: 'Running', cls: 'is-running' },
    paused: { label: 'Paused', cls: 'is-paused' },
    stopped: { label: 'Stopped', cls: 'is-stopped' },
    off: { label: 'Not running', cls: 'is-off' },
    blocked: { label: 'Needs records', cls: 'is-off' },
  };

  /* One per generic area, so a column of watchers is not a column of
     identical squares. The area is the catalogue's own, not a guess. */
  var AREA_ICON = {
    People: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="8" r="3.5"/></svg>',
    Money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M16 7.5A3.5 3.5 0 0 0 12.5 5h-1a3 3 0 0 0 0 6h1a3 3 0 0 1 0 6h-1A3.5 3.5 0 0 1 8 16.5"/></svg>',
    Customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/></svg>',
    Suppliers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5v6l-9 5-9-5z"/><path d="M3 9l9 5 9-5M12 14v6"/></svg>',
    Schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    Records: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    Compliance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/></svg>',
  };
  var FALLBACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4l2.5 2"/></svg>';

  function areaIcon(area) { return AREA_ICON[area] || FALLBACK_ICON; }

  /** One watcher, as a node in its column. */
  function node(c, picked) {
    var st = STATE[c.state] || STATE.off;
    return '<button type="button" class="ag-node' + (picked ? ' is-picked' : '') + '" data-watcher="' + esc(c.id) + '">'
      + '<span class="ag-node__icon" aria-hidden="true">' + areaIcon(c.area) + '</span>'
      + '<span class="ag-node__text">'
      + '<span class="ag-node__name">' + esc(c.name) + '</span>'
      + '<span class="ag-node__state ' + st.cls + '">' + esc(st.label)
      + (c.openCount ? ' &middot; ' + c.openCount + ' open' : '') + '</span>'
      + '</span>'
      + '</button>';
  }

  /** One business category, and everything that belongs to it. */
  function column(g, i, picked) {
    var running = g.items.filter(function (c) { return c.state === 'running'; }).length;
    return '<section class="ag-col" style="--ag-hue: ' + (i * 62 % 360) + '">'
      + '<header class="ag-col__head">'
      + '<span class="ag-col__icon" aria-hidden="true">' + areaIcon(g.icon) + '</span>'
      + '<span class="ag-col__text">'
      + '<span class="ag-col__name">' + esc(g.name) + '</span>'
      + '<span class="ag-col__count">' + running + ' of ' + g.items.length + ' running</span>'
      + '</span></header>'
      + '<div class="ag-col__body">'
      + (g.items.length
        ? g.items.map(function (c) { return node(c, c.id === picked); }).join('')
        : '<p class="ag-col__none">Nothing watches this yet.</p>')
      + '</div></section>';
  }

  /**
   * The columns.
   *
   * The industry's categories when it has them, in the order its table
   * names them and including any that nothing watches yet — a map that drew
   * only the occupied columns would say "this is all there is to watch".
   * An industry with no table falls back to the generic areas every watcher
   * already carries, so the map is never empty for want of a knowledge base.
   */
  function groups(cat, cats) {
    if (cats && cats.length) {
      return cats.map(function (c) {
        var items = cat.filter(function (x) { return x.category === c.name; });
        return { name: c.name, asks: c.asks, items: items, icon: items.length ? items[0].area : '' };
      });
    }
    var seen = [];
    cat.forEach(function (c) { if (seen.indexOf(c.area) === -1) seen.push(c.area); });
    return seen.map(function (a) {
      return { name: a, asks: '', icon: a, items: cat.filter(function (c) { return c.area === a; }) };
    });
  }

  /** The scheduler, at the head of the map. */
  function chief(cat) {
    var running = cat.filter(function (c) { return c.state === 'running'; }).length;
    var open = cat.reduce(function (n, c) { return n + (c.openCount || 0); }, 0);
    var stopped = cat.filter(function (c) { return c.state === 'stopped'; }).length;
    // What is running is always said; a watcher that stopped itself is said
    // as well, rather than instead — the owner needs both numbers to know
    // whether they are covered.
    var line = running
      ? running + ' of ' + cat.length + ' watching &middot; ' + open + ' open right now'
      : 'Nothing is being watched yet';
    if (stopped) line += ' &middot; ' + stopped + (stopped === 1 ? ' has' : ' have') + ' stopped after three failures';
    return '<div class="ag-chief' + (stopped ? ' is-bad' : running ? ' is-on' : '') + '">'
      + '<span class="ag-chief__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4.5V8M9.5 13.5h.01M14.5 13.5h.01M9.5 16.5h5"/><circle cx="12" cy="3.5" r="1.2"/></svg></span>'
      + '<h2 class="ag-chief__name">Chief of Agents</h2>'
      + '<p class="ag-chief__what">Runs each watcher on its own schedule and keeps what it found</p>'
      + '<p class="ag-chief__state">' + line + '</p>'
      + '</div>';
  }

  function drawMap(cat, cats, picked) {
    var gs = groups(cat, cats);
    els.map.innerHTML = chief(cat)
      + '<div class="ag-map__stem" aria-hidden="true"></div>'
      // The count goes to CSS, which needs it to stop the bus at the centre
      // of the first and last column rather than at the edge of the row.
      + '<div class="ag-map__cols" style="--ag-cols: ' + gs.length + '">'
      + gs.map(function (g, i) { return column(g, i, picked); }).join('') + '</div>';
    els.map.hidden = cat.length === 0;
    els.empty.hidden = cat.length > 0;
  }

  /**
   * One watcher, opened from the map.
   *
   * The same panel whether or not it is running, because the question
   * "what does this one do?" is the same question either way. What differs
   * is what can be done about it: start it, pause it, remove it, or -- when
   * the records it needs are not here -- say plainly which records those
   * are. A watcher the data cannot support is never hidden: that line is
   * what makes somebody connect a source.
   */
  function detail(c, a) {
    var st = STATE[c.state] || STATE.off;
    var open = (a && a.open) || [];
    var found = open.length
      ? '<ul class="ag-found">'
        + open.slice(0, 8).map(function (f) {
          return '<li>' + esc(f.key) + '<span class="ag-since">since ' + when(f.since) + '</span></li>';
        }).join('')
        + (open.length > 8 ? '<li class="ag-more">and ' + (open.length - 8) + ' more</li>' : '')
        + '</ul>'
      : '';

    /*
     * Resume, for a watcher that stopped itself.
     *
     * setAgentEnabled(id, true) clears the failure count and the last error
     * as well as re-enabling it, so enabling IS the repair — and offering
     * "Pause" to something that already stopped would be the one button
     * that cannot help. The intent rides on the element rather than being
     * read back off its label, which three labels would have broken.
     */
    var on = c.state === 'running';
    var acts = !view.canManage
      ? '<span class="ag-offer__need">' + (c.state === 'blocked'
          ? esc(c.missing || 'Needs records this application does not hold yet.')
          : 'Only the person who created this application can change what it watches.') + '</span>'
      : c.state === 'blocked'
      ? '<span class="ag-offer__need">' + esc(c.missing || 'Needs records this application does not hold yet.') + '</span>'
      : c.state === 'off'
        ? '<button type="button" class="ag-btn ag-btn--go" data-start="' + esc(c.id) + '">Start watching</button>'
        : '<button type="button" class="ag-btn' + (on ? '' : ' ag-btn--go') + '" data-toggle="' + esc(a.id) + '" data-enable="' + (on ? '0' : '1') + '">'
            + (on ? 'Pause' : c.state === 'stopped' ? 'Start it again' : 'Resume') + '</button>'
          + '<button type="button" class="ag-btn ag-btn--off" data-remove="' + esc(a.id) + '">Remove</button>';

    return '<article class="ag-detail__card' + (c.state === 'stopped' ? ' ag-card--bad' : '') + '">'
      + '<header class="ag-detail__head">'
      + '<span class="ag-node__icon" aria-hidden="true">' + areaIcon(c.area) + '</span>'
      + '<span class="ag-detail__title">'
      + '<h3>' + esc(c.name) + '</h3>'
      + '<span class="ag-detail__where">' + esc(c.category || c.area) + '</span>'
      + '</span>'
      + '<span class="ag-node__state ' + st.cls + '">' + esc(st.label) + '</span>'
      + '<button type="button" class="ag-detail__shut" data-shut="1" aria-label="Close">&times;</button>'
      + '</header>'
      + '<p class="ag-detail__says">' + esc(c.says) + '</p>'
      + (c.question ? '<p class="ag-q">' + esc(c.question) + '</p>' : '')
      + (a ? '<p class="ag-meta">' + esc(scheduleText(a)) + ' &middot; last run ' + when(a.lastRunAt) + '</p>' : '')
      + (a && a.lastError ? '<p class="ag-err">' + esc(a.lastError) + '</p>' : '')
      // "Nothing open" is the watcher working, not an empty state to tidy
      // away, so it is said rather than left blank.
      + (a ? (found || '<p class="ag-none">Nothing open.</p>') : '')
      + '<footer class="ag-card__acts">' + acts + '</footer>'
      + '</article>';
  }

  // What the map is drawn from, kept so a click can redraw without asking
  // the server again.
  var view = { catalogue: [], categories: [], agents: [], canManage: false };
  var picked = '';

  function drawDetail() {
    if (!els.detail) return;
    var c = view.catalogue.find(function (x) { return x.id === picked; });
    if (!c) { els.detail.hidden = true; els.detail.innerHTML = ''; return; }
    var a = view.agents.find(function (x) { return x.watcherId === c.id; })
      || view.agents.find(function (x) { return x.name === c.name; })
      || null;
    els.detail.innerHTML = detail(c, a);
    els.detail.hidden = false;
  }

  function load() {
    return api('').then(function (body) {
      view.agents = body.agents || [];
      view.catalogue = body.catalogue || [];
      view.categories = body.categories || [];
      view.canManage = !!body.canManage;
      // The form below the map writes, so it belongs to the owner too.
      if (els.form) els.form.hidden = !view.canManage;
      var aside = document.getElementById('ag-own');
      if (aside) aside.hidden = !view.canManage;
      if (picked && !view.catalogue.some(function (c) { return c.id === picked; })) picked = '';
      drawMap(view.catalogue, view.categories, picked);
      drawDetail();
    }).catch(function (err) {
      els.map.innerHTML = '';
      els.map.hidden = true;
      els.empty.hidden = false;
      els.empty.textContent = /(403|forbidden|only the person)/i.test(err.message)
        ? 'Only the person who created this application can see and change what it watches.'
        : 'What this application is watching could not be read. ' + err.message;
      say('');
    });
  }

  if (els.form) {
    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      say('');
      var body = {
        name: els.name.value.trim(),
        question: els.question.value.trim(),
        schedule: els.schedule.value,
        atHour: Number(els.hour.value),
        // The owner's own clock. A morning briefing has to arrive in their
        // morning, not the container's.
        tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC',
      };
      if (!body.name || !body.question) { say('It needs a name and something to watch.', true); return; }

      api('', { method: 'POST', body: JSON.stringify(body) })
        .then(function () {
          els.name.value = '';
          els.question.value = '';
          say('Watching. It will run ' + scheduleText({ schedule: body.schedule, atHour: body.atHour }) + '.');
          return load();
        })
        .catch(function (err) { say(err.message, true); });
    });
  }

  // Picking a node on the map opens it below, and picking it again shuts it.
  els.map.addEventListener('click', function (e) {
    var n = e.target.closest('[data-watcher]');
    if (!n) return;
    picked = picked === n.dataset.watcher ? '' : n.dataset.watcher;
    drawMap(view.catalogue, view.categories, picked);
    drawDetail();
    if (picked && els.detail) els.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  // Everything that can be done to a watcher happens in the panel the map
  // opened, so one listener covers all of it.
  els.detail.addEventListener('click', function (e) {
    var s = e.target.closest('[data-start]');
    var t = e.target.closest('[data-toggle]');
    var r = e.target.closest('[data-remove]');
    var x = e.target.closest('[data-shut]');

    if (x) { picked = ''; drawMap(view.catalogue, view.categories, picked); drawDetail(); return; }

    if (s) {
      s.disabled = true;
      s.textContent = 'Starting…';
      api('/start/' + s.dataset.start, {
        method: 'POST',
        body: JSON.stringify({ tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC' }),
      })
        .then(function () { say('Watching. It will tell you when something changes.'); return load(); })
        .catch(function (err) { say(err.message, true); s.disabled = false; s.textContent = 'Start watching'; });
      return;
    }

    if (t) {
      t.disabled = true;
      api('/' + t.dataset.toggle, { method: 'PATCH', body: JSON.stringify({ enabled: t.dataset.enable === '1' }) })
        .then(load).catch(function (err) { say(err.message, true); t.disabled = false; });
      return;
    }

    if (r) {
      // Removing an agent forgets what it found, so it is worth one question.
      if (!window.confirm('Stop watching, and forget what it found?')) return;
      r.disabled = true;
      api('/' + r.dataset.remove, { method: 'DELETE' })
        .then(function () { picked = ''; return load(); })
        .catch(function (err) { say(err.message, true); r.disabled = false; });
    }
  });

  if (els.back) {
    els.back.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof window.svargGoHome === 'function') window.svargGoHome();
      else { page.hidden = true; var app = document.getElementById('ch-app'); if (app) app.hidden = false; }
    });
  }

  /*
   * Opened from the sidebar.
   *
   * The link is an <a href="#agents">, but the shell calls preventDefault on
   * it so the hash never changes -- which meant the hashchange below never
   * fired and this page was drawn from its own markup, for ever: an empty
   * map and a line saying nothing could be watched. The shell announces the
   * open instead, the way it already did for the findings board.
   */
  window.addEventListener('svarg:agents-open', function () { say(''); load(); });
  window.addEventListener('hashchange', maybeOpen);
  maybeOpen();

  function maybeOpen() {
    if (window.location.hash !== '#agents') return;
    // The shell decides what is on screen; this only reads what is there.
    if (typeof window.svargShowPanel === 'function') window.svargShowPanel('agents');
    else { var app = document.getElementById('ch-app'); if (app) app.hidden = true; page.hidden = false; }
    say('');
    load();
  }
}());
