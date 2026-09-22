/**
 * The Agents page — what this application is watching while nobody is looking.
 *
 * The chat is where an agent is created and explained; this is where its work
 * is read. At eight in the morning the owner wants to know what needs them
 * today, in about five seconds, and a chat transcript cannot do that — they
 * would be scrolling back through their own questions to find it.
 *
 * So: one card per agent, in the same shape the Data page uses for a source —
 * name, schedule, when it last ran, what it is holding open, whether it is
 * healthy. And the findings are the durable copy. An owner who missed the
 * email, or whose application cannot reach Svarg at all, still sees everything
 * the agents noticed, because a finding is recorded before anything is sent.
 *
 * Owner only. A colleague with a session can use the application and read its
 * answers; an agent runs unattended and sends mail, so deciding what watches
 * belongs to the person whose application it is. The API enforces that — this
 * page only has to say so plainly when it is refused.
 *
 * Fixed runtime, like data.js: the same for every application, so it is tested
 * once. It drives only ids of its own (#ag-*).
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var page = document.getElementById('ch-agents');
  if (!page) return;

  var els = {
    list: document.getElementById('ag-list'),
    empty: document.getElementById('ag-empty'),
    note: document.getElementById('ag-note'),
    form: document.getElementById('ag-form'),
    name: document.getElementById('ag-name'),
    question: document.getElementById('ag-question'),
    schedule: document.getElementById('ag-schedule'),
    hour: document.getElementById('ag-hour'),
    offers: document.getElementById('ag-offers'),
    offersEmpty: document.getElementById('ag-offers-empty'),
    more: document.getElementById('ag-more'),
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
   * An agent that has stopped itself says so, loudly, and a healthy one is
   * quiet. Three consecutive failures is not a blip and an owner who is not
   * told has an agent that has silently stopped watching — which is worse than
   * one that never existed, because they believe it is covered.
   */
  function statusChip(a) {
    if (a.status === 'degraded') {
      return '<span class="ag-chip ag-chip--bad" title="' + esc(a.lastError || '') + '">stopped after 3 failures</span>';
    }
    if (!a.enabled || a.status === 'paused') return '<span class="ag-chip">paused</span>';
    return '';
  }

  function card(a) {
    var open = a.open || [];
    var found = open.length
      ? '<ul class="ag-found">'
        + open.slice(0, 8).map(function (f) {
          return '<li>' + esc(f.key) + '<span class="ag-since">since ' + when(f.since) + '</span></li>';
        }).join('')
        + (open.length > 8 ? '<li class="ag-more">and ' + (open.length - 8) + ' more</li>' : '')
        + '</ul>'
      // Not an empty state to be tidied away: "nothing open" is the agent
      // working, and the owner should be able to see that at a glance.
      : '<p class="ag-none">Nothing open.</p>';

    return '<article class="ag-card' + (a.status === 'degraded' ? ' ag-card--bad' : '') + '">'
      + '<header class="ag-card__head">'
      + '<h3>' + esc(a.name) + '</h3>'
      + statusChip(a)
      + '<span class="ag-count' + (open.length ? ' ag-count--on' : '') + '">' + open.length + '</span>'
      + '</header>'
      + '<p class="ag-q">' + esc(a.question) + '</p>'
      + '<p class="ag-meta">' + esc(scheduleText(a)) + ' &middot; last run ' + when(a.lastRunAt) + '</p>'
      + (a.lastError ? '<p class="ag-err">' + esc(a.lastError) + '</p>' : '')
      + found
      + '<footer class="ag-card__acts">'
      + '<button type="button" class="ag-btn" data-toggle="' + esc(a.id) + '">' + (a.enabled ? 'Pause' : 'Resume') + '</button>'
      + '<button type="button" class="ag-btn ag-btn--off" data-remove="' + esc(a.id) + '">Remove</button>'
      + '</footer>'
      + '</article>';
  }

  /*
   * A catalogue card.
   *
   * Three states, and the third is the one worth keeping. A watcher the data
   * cannot support is shown greyed with the records it would need, because
   * that line is what makes somebody connect a source — and a watcher hidden
   * would be undiscoverable, with nothing on any screen to ask about.
   */
  function offer(c) {
    var cls = 'ag-offer' + (c.running ? ' ag-offer--on' : c.ready ? '' : ' ag-offer--cold');
    var act = c.running
      ? '<span class="ag-offer__on">Watching</span>'
      : c.ready
        ? '<button type="button" class="ag-btn ag-btn--go" data-start="' + esc(c.id) + '">Start watching</button>'
        : '<span class="ag-offer__need">' + esc(c.missing) + '</span>';
    return '<article class="' + cls + '">'
      + '<header class="ag-offer__head">'
      + (c.startHere ? '<span class="ag-star" title="From what you described">start here</span>' : '')
      + '<h4>' + esc(c.name) + '</h4>'
      + '<span class="ag-offer__area">' + esc(c.area) + '</span>'
      + '</header>'
      + '<p class="ag-offer__says">' + esc(c.says) + '</p>'
      + (c.ready && !c.running ? '<p class="ag-offer__q">' + esc(c.question) + '</p>' : '')
      + '<footer>' + act + '</footer>'
      + '</article>';
  }

  var showAll = false;

  function load() {
    return api('').then(function (body) {
      var agents = body.agents || [];
      var cat = body.catalogue || [];

      els.list.innerHTML = agents.map(card).join('');
      els.empty.hidden = agents.length > 0;
      els.list.hidden = agents.length === 0;

      /*
       * Ready ones first, and the rest behind a link.
       *
       * Twenty-eight cards on first open is a wall. Four the owner could
       * start today, and a way to see everything else, is a product.
       */
      var live = cat.filter(function (c) { return !c.running && c.ready; });
      var cold = cat.filter(function (c) { return !c.running && !c.ready; });
      var shown = showAll ? live.concat(cold) : live;

      els.offers.innerHTML = shown.map(offer).join('');
      els.offers.hidden = shown.length === 0;
      els.more.hidden = cold.length === 0;
      els.more.textContent = showAll
        ? 'Show only what this application can watch now'
        : 'Show ' + cold.length + ' more that need other records';
      els.offersEmpty.hidden = shown.length > 0 || showAll;
    }).catch(function (err) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      say(err.message, true);
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

  els.offers.addEventListener('click', function (e) {
    var b = e.target.closest('[data-start]');
    if (!b) return;
    b.disabled = true;
    b.textContent = 'Starting…';
    api('/start/' + b.dataset.start, {
      method: 'POST',
      body: JSON.stringify({ tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC' }),
    })
      .then(function () { say('Watching. It will tell you when something changes.'); return load(); })
      .catch(function (err) { say(err.message, true); b.disabled = false; b.textContent = 'Start watching'; });
  });

  els.more.addEventListener('click', function (e) {
    e.preventDefault();
    showAll = !showAll;
    load();
  });

  els.list.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]');
    var r = e.target.closest('[data-remove]');
    if (t) {
      var on = t.textContent.trim() === 'Pause';
      t.disabled = true;
      api('/' + t.dataset.toggle, { method: 'PATCH', body: JSON.stringify({ enabled: !on }) })
        .then(load).catch(function (err) { say(err.message, true); t.disabled = false; });
      return;
    }
    if (r) {
      // Removing an agent forgets what it found, so it is worth one question.
      if (!window.confirm('Stop watching, and forget what it found?')) return;
      r.disabled = true;
      api('/' + r.dataset.remove, { method: 'DELETE' })
        .then(load).catch(function (err) { say(err.message, true); r.disabled = false; });
    }
  });

  if (els.back) {
    els.back.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof window.svargGoHome === 'function') window.svargGoHome();
      else { page.hidden = true; var app = document.getElementById('ch-app'); if (app) app.hidden = false; }
    });
  }

  // Opened from the sidebar. The shell hides the other panels; this only has
  // to show itself and read what is there.
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
