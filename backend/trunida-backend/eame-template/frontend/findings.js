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
    list: document.getElementById('fn-list'),
    who: document.getElementById('fn-who'),
    person: document.getElementById('fn-person'),
    personClear: document.getElementById('fn-person-clear'),
    empty: document.getElementById('fn-empty'),
    emptyTitle: document.getElementById('fn-empty-title'),
    emptyNote: document.getElementById('fn-empty-note'),
    note: document.getElementById('fn-note'),
    areas: document.getElementById('fn-areas'),
    areagrid: document.getElementById('fn-areagrid'),
    areasSub: document.getElementById('fn-areas-sub'),
    areasLink: document.getElementById('fn-areas-link'),
    hero: document.getElementById('fn-hero'),
    greet: document.getElementById('fn-greet'),
    heroline: document.getElementById('fn-heroline'),
    herosub: document.getElementById('fn-herosub'),
    herometa: document.getElementById('fn-herometa'),
    health: document.getElementById('fn-health'),
    healthIcon: document.getElementById('fn-health-icon'),
    healthVerdict: document.getElementById('fn-health-verdict'),
    healthNote: document.getElementById('fn-health-note'),
    eg: document.getElementById('fn-eg'),
    eglist: document.getElementById('fn-eglist'),
  };

  var d = {
    back: document.getElementById('fd-back'),
    chip: document.getElementById('fd-chip'),
    title: document.getElementById('fd-title'),
    sub: document.getElementById('fd-sub'),
    rule: document.getElementById('fd-rule'),
    facts: document.getElementById('fd-facts'),
    rows: document.getElementById('fd-rows'),
    said: document.getElementById('fd-said'),
    saidbody: document.getElementById('fd-saidbody'),
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

  var LABEL_LONG = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };

  /*
   * ── The one answer, before the detail ──────────────────────────────────
   *
   * Six states, in this order, because the order is the whole correctness of
   * it. "Everything looks good" is only true when watchers ran and found
   * nothing — so a watcher that stopped itself, and an application whose
   * first check has not happened yet, are checked FIRST. Both would
   * otherwise render as all-clear, which is the one lie this screen must
   * never tell: somebody reads it and stops looking.
   */
  var SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/></svg>';
  var ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z"/><path d="M12 9v4M12 16.2h.01"/></svg>';
  var CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>';

  function health(body) {
    var open = (body.open || []).length;
    var counts = body.counts || {};

    /*
     * Nothing of theirs is connected yet, and that is not "healthy".
     *
     * This state was missing, and its absence was the whole problem. With no
     * records connected the watchers still run, still find nothing real, and
     * the board said "Everything looks good" — which reads as "we checked
     * your business and it is fine" when nothing of their business had been
     * looked at. The honest answer names the next step instead.
     *
     * Checked before every other state but a stopped watcher: nothing else
     * on this screen means anything until there is something to watch.
     */
    if (!body.example && body.hasRealData === false) {
      return {
        cls: 'is-idle', icon: CLOCK, verdict: 'Nothing connected yet',
        note: 'No records of yours have arrived',
        line: 'Connect your business data.',
        sub: body.hasExample
          ? 'Svarg has nothing of yours to watch yet. Open Data to connect a source — '
            + 'or turn on Example mode above to see how this works first.'
          : 'Svarg has nothing of yours to watch yet. Open Data to connect a source.',
      };
    }

    if (body.degraded) {
      return {
        cls: 'is-bad', icon: ALERT, verdict: 'Needs a look',
        note: body.degraded === 1 ? '1 watcher has stopped itself' : body.degraded + ' watchers have stopped themselves',
        line: 'Some checks have stopped.',
        sub: 'They failed repeatedly and switched themselves off, so what they watched is not being watched. Open Watchers to start them again.',
      };
    }
    if (!body.watching) {
      return {
        cls: 'is-idle', icon: CLOCK, verdict: 'Not watching yet',
        note: 'Nothing is running',
        line: 'Nothing is being watched yet.',
        sub: 'Open Watchers to choose what this application should keep an eye on.',
      };
    }
    if (!body.everRan) {
      return {
        cls: 'is-idle', icon: CLOCK, verdict: 'Starting up',
        note: 'The first check has not run',
        line: 'Getting started.',
        sub: body.nextDueAt
          ? 'Nothing has been checked yet. The first check is at ' + clockTime(body.nextDueAt) + '.'
          : 'Nothing has been checked yet. The first check runs shortly.',
      };
    }
    if (counts.high) {
      return {
        cls: 'is-bad', icon: ALERT, verdict: 'Needs attention',
        note: counts.high === 1 ? '1 high priority item' : counts.high + ' high priority items',
        line: open === 1 ? '1 thing needs you today.' : open + ' things need you today.',
        sub: 'Svarg is monitoring your business, and some of what it found is worth doing first.',
      };
    }
    if (open) {
      return {
        cls: 'is-watch', icon: SHIELD, verdict: 'Worth a look',
        note: open === 1 ? '1 thing is open' : open + ' things are open',
        line: open === 1 ? '1 thing to look at.' : open + ' things to look at.',
        sub: 'Svarg is monitoring your business. Nothing urgent, but these are still open.',
      };
    }
    return {
      cls: 'is-good', icon: SHIELD, verdict: 'Healthy',
      note: 'No critical issues at the moment',
      line: 'Everything looks good!',
      sub: 'Svarg is monitoring your business. No immediate issues detected.',
    };
  }

  /** Morning, afternoon or evening — from the reader's own clock. */
  function partOfDay() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  /*
   * The name the shell already resolved from the session. Read rather than
   * fetched: this page has no business asking who somebody is a second time,
   * and an empty greeting is better than a wrong one.
   */
  function firstName() {
    var el = document.getElementById('ch-who-name');
    return (el && el.textContent || '').trim();
  }

  function drawHero(body) {
    if (!el.hero) return;
    var h = health(body);
    /*
     * In Example mode the verdict is about the example.
     *
     * Every one of the sentences below says "Svarg is monitoring your
     * business", which is the right thing to say and the wrong thing to say
     * over invented people. The banner above already says the mode; this is
     * the line somebody actually reads.
     */
    if (body.example) {
      h.sub = 'This is example data, so you can see what Svarg does before connecting anything. '
        + 'Turn Example mode off to go back to your business.';
    }
    var name = firstName();
    var areas = (body.categories || []).length;

    el.greet.textContent = partOfDay() + (name ? ', ' + name : '') + ' 👋';
    el.heroline.textContent = h.line;
    el.herosub.textContent = h.sub;

    // What is doing the watching, stated in the customer's own units: areas
    // of their business, not a catalogue of machinery.
    var bits = [body.watching + (body.watching === 1 ? ' watcher active' : ' watchers active')];
    if (areas) bits.push(areas + (areas === 1 ? ' business area' : ' business areas'));
    el.herometa.textContent = bits.join(' · ');

    el.healthIcon.innerHTML = h.icon;
    el.healthVerdict.textContent = h.verdict;
    el.healthNote.textContent = h.note;
    el.health.className = 'fn__health ' + h.cls;
    el.hero.className = 'fn__hero ' + h.cls;
    el.hero.hidden = false;
  }

  /** Which category chip is selected. Empty means all of them. */
  var picked = '';

  /**
   * One finding as a row.
   *
   * A row rather than a card, because the point of this screen is to be read
   * down in one pass: category on the left so the eye can group, what happened
   * in the middle, how urgent and how long on the right. A wall of cards makes
   * five findings look like five separate things to deal with rather than one
   * morning's work.
   */
  function row(f) {
    var ev = f.evidence || {};
    var cat = f.category || f.watcher || '';
    var from = ev.dataset
      ? '<p class="fn__from">Evidence <b>' + esc(ev.dataset) + '</b></p>' : '';
    /*
     * Said twice, on purpose.
     *
     * The sentence explains; the tag is what somebody sees when they are
     * scanning, and scanning is what this screen is for. One quiet line under
     * a finding was the whole labelling a board full of invented people had,
     * and it was not enough — a screenshot of it was indistinguishable from a
     * screenshot of a real morning.
     */
    var sample = ev.simulated
      ? '<p class="fn__sim">Example data &mdash; not your own records.</p>'
      : '';
    return '<button type="button" class="fn__row fn__row--' + esc(f.severity) + '"'
      + ' data-open="' + esc(f.id) + '" data-cat="' + esc(cat) + '">'
      + '<span class="fn__rowcat">'
      +   '<span class="fn__dot" aria-hidden="true"></span>'
      +   '<span class="fn__catname">' + esc(cat) + '</span>'
      + '</span>'
      + '<span class="fn__rowbody">'
      +   '<span class="fn__rowtitle">' + esc(f.title) + '</span>'
      +   '<span class="fn__rowsub">' + esc(f.watcher || 'A watcher') + '</span>'
      +   from + sample
      + '</span>'
      + '<span class="fn__rowmeta">'
      +   (ev.simulated ? '<span class="fn__egtag">Example</span>' : '')
      +   '<span class="fn__pri fn__pri--' + esc(f.severity) + '">' + esc(LABEL_LONG[f.severity] || 'Medium priority') + '</span>'
      +   '<span class="fn__age">' + esc(ago(f.since)) + '</span>'
      + '</span>'
      + '<span class="fn__chev" aria-hidden="true">&rsaquo;</span>'
      + '</button>';
  }

  /**
   * One example, in the same shape as a real row so the reader learns the
   * shape -- and marked on its face so nobody can mistake it for one.
   *
   * It carries no person, no number and no date, because those are the parts
   * that would make a screenshot of this indistinguishable from a screenshot
   * of a real finding. What it does carry is true: a watcher this application
   * has, the question it actually asks, and the dataset it actually reads.
   * It is not a button, because there is nothing behind it to open.
   */
  function example(e) {
    return '<div class="fn__row fn__row--eg fn__row--' + esc(e.severity || 'medium') + '">'
      + '<span class="fn__rowcat">'
      +   '<span class="fn__dot" aria-hidden="true"></span>'
      +   '<span class="fn__catname">' + esc(e.category || '') + '</span>'
      + '</span>'
      + '<span class="fn__rowbody">'
      +   '<span class="fn__rowtitle">' + esc(e.says || '') + '</span>'
      +   '<span class="fn__rowsub">' + esc(e.watcher || '') + '</span>'
      +   (e.question ? '<p class="fn__from">Asks <b>' + esc(e.question) + '</b></p>' : '')
      + '</span>'
      + '<span class="fn__rowmeta"><span class="fn__egtag">Example</span></span>'
      + '</div>';
  }

  function drawExamples(list) {
    if (!el.eg || !el.eglist) return;
    var show = (list || []).length > 0;
    el.eg.hidden = !show;
    el.eglist.innerHTML = show ? list.map(example).join('') : '';
  }

  /*
   * ── The business areas, one box each ────────────────────────────────────
   *
   * Every area the industry names, including the quiet ones. A board that
   * drew only the areas with something wrong would change shape every
   * morning — and "All good" said against an area is the claim the product
   * exists to make. An empty row of boxes is not the same sentence.
   *
   * There is no "All" box. Picking an area filters the list below; picking
   * it again clears the filter, which is the same gesture and one fewer
   * thing on the screen.
   */
  var AREA_ICON = {
    Retention: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="8" r="3.5"/></svg>',
    Utilisation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V5M16 20v-7M22 20H2"/></svg>',
    Growth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    Cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    Fees: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
    Compliance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/></svg>',
  };
  var AREA_FALLBACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v4l2.5 2"/></svg>';

  function areaIcon(name) { return AREA_ICON[name] || AREA_FALLBACK; }

  /**
   * One area: what watches it, and whether anything is open under it.
   *
   * `nothing` is the state that was missing, and it is not a nicety. With no
   * records connected every area read "All good" — five green ticks over a
   * business nothing had looked at. The verdict above them says so now, and
   * an area saying the opposite three inches below it is the same lie moved
   * down the page.
   */
  function area(c, nothing) {
    var n = c.count || 0;
    var state = c.locked
      ? { cls: 'is-locked', text: 'Not in your plan' }
      : n
        ? { cls: 'is-open', text: n === 1 ? '1 to look at' : n + ' to look at' }
        : nothing
          ? { cls: 'is-idle', text: 'Nothing to watch yet' }
          : { cls: 'is-clear', text: 'All good' };
    var watchers = c.watchers === undefined ? null : c.watchers;
    return '<button type="button" class="fn__area ' + state.cls + (picked === c.name ? ' is-picked' : '') + '"'
      + ' data-pick="' + esc(c.name) + '" aria-pressed="' + (picked === c.name) + '"'
      + (c.asks ? ' title="' + esc(c.asks) + '"' : '') + '>'
      + '<span class="fn__area-top">'
      +   '<span class="fn__area-icon" aria-hidden="true">' + areaIcon(c.name) + '</span>'
      +   '<span class="fn__area-text">'
      +     '<span class="fn__area-name">' + esc(c.name) + '</span>'
      +     (watchers === null ? '' : '<span class="fn__area-agents">' + watchers
            + (watchers === 1 ? ' agent' : ' agents') + '</span>')
      +   '</span>'
      +   '<span class="fn__area-go" aria-hidden="true">&rsaquo;</span>'
      + '</span>'
      + '<span class="fn__area-state">' + esc(state.text) + '</span>'
      + '</button>';
  }

  function drawAreas(cats, body) {
    if (!el.areas || !el.areagrid) return;
    if (!cats.length) { el.areas.hidden = true; return; }
    el.areas.hidden = false;
    // Nothing of theirs connected, and not the demonstration: these areas
    // have not been looked at, and must not claim to have been.
    var nothing = !body.example && body.hasRealData === false;
    el.areagrid.innerHTML = cats.map(function (c) { return area(c, nothing); }).join('');

    var busy = cats.filter(function (c) { return (c.count || 0) > 0; }).length;
    el.areasSub.textContent = picked
      ? 'Showing ' + picked + '. Pick it again to see them all.'
      : nothing
        ? 'Nothing has been connected for these to watch.'
        : busy
          ? busy === 1 ? '1 area has something open.' : busy + ' areas have something open.'
          : 'All areas are within normal range.';
  }

  var _last = null;   // the last body, so a chip can re-filter without refetching
  /*
   * Whose findings are being shown, or empty for everyone.
   *
   * Held beside the category chip and applied the same way: both narrow the
   * same list, neither refetches, and a selection that no longer has
   * anything under it clears itself rather than leaving somebody on an empty
   * screen after their last finding resolved.
   */
  var person = '';

  /**
   * The people this morning is about.
   *
   * Shown from the first person, and hidden only when nobody has anything
   * open.
   *
   * ── Why not hidden below two ───────────────────────────────────────────────
   *
   * It was, on the reasoning that a box offering a choice of one is a control
   * that does nothing. Measured against a real board, that rule hid the
   * feature exactly when it was most needed: resolving a patient's four
   * findings to one person took the count from two to one, so making the
   * board more correct made the picker disappear. A reader who cannot see
   * that the board can be read one person at a time does not know to look for
   * it — and a board grows people, so the control is a promise about how this
   * page works rather than a switch that has to pay for itself today.
   *
   * The count beside each name is how many findings name them, so the person
   * worth opening first is visible without opening anybody.
   */
  function drawPeople(people) {
    if (!el.who || !el.person) return;
    if (!people.length) {
      el.who.hidden = true;
      person = '';
      return;
    }
    el.who.hidden = false;
    // "1 person", not "1 people" — the board says one man's name four times,
    // and a reader noticing the grammar before the finding is a reader lost.
    var many = people.length === 1 ? '1 person' : people.length + ' people';
    el.person.innerHTML = '<option value="">Everyone &mdash; ' + many + '</option>'
      + people.map(function (p) {
        return '<option value="' + esc(p.person) + '"' + (p.person === person ? ' selected' : '') + '>'
          + esc(p.person) + ' (' + p.findings + ')</option>';
      }).join('');
    el.person.value = person;
    if (el.personClear) el.personClear.hidden = !person;
  }

  function render(body) {
    _last = body;
    drawHero(body);
    var all = body.open || [];
    var counts = body.counts || {};
    var cats = body.categories || [];

    // A chip that no longer has anything under it stops being selected, rather
    // than leaving the reader on an empty screen after a finding resolves.
    if (picked && !cats.some(function (c) { return c.name === picked; })) picked = '';

    /*
     * And the same rule for the person: a selection with nothing left under it
     * clears itself, rather than leaving somebody on an empty screen after
     * their last finding resolved.
     */
    var people = body.people || [];
    if (person && !people.some(function (p) { return p.person === person; })) person = '';
    drawPeople(people);

    var open = all.filter(function (f) {
      if (picked && f.category !== picked) return false;
      if (person && (f.person || f.title) !== person) return false;
      return true;
    });

    /*
     * The examples follow the switch, because they are the demonstration.
     *
     * They used to appear on any board with nothing open, which put a
     * section headed "What a finding will look like", every row tagged
     * Example, on the screen of somebody who had deliberately turned Example
     * mode OFF -- and took it away when they turned it ON. The switch has
     * one meaning now: off is the business, on is the demonstration.
     *
     * Still never while something is open or a chip is filtering: an example
     * under "Cash" with Cash selected would read as a Cash finding.
     */
    var egs = body.example && !all.length && !picked ? (body.examples || []) : [];

    drawAreas(cats, body);

    el.list.innerHTML = open.map(row).join('');
    el.list.hidden = open.length === 0;

    drawExamples(egs);

    /*
     * ── A quiet morning keeps the same screen ──────────────────────────────
     *
     * A board with nothing on it used to swap itself for a panel saying so.
     * That made a good day look like a broken application: the structure the
     * reader had learned — the count, the areas, the rows — disappeared, and
     * what replaced it was indistinguishable from a page that had failed to
     * load.
     *
     * So the shape never changes. The heading counts, the areas are all there
     * reading zero, and the line beneath says what the zero means. Five
     * categories at zero is a sentence: we watched all of these and they are
     * clear.
     */
    el.empty.hidden = true;

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

  /**
   * Example mode, per reader and per browser.
   *
   * Deliberately not a setting on the application. It is a way of looking at
   * the product, not a fact about the business: two people can have this
   * screen open, and one of them being shown the demonstration must not
   * change what the other is working from. It also means it cannot be left on
   * by accident for somebody else — the worst outcome this mode could have.
   */
  function exampleOn() {
    try { return localStorage.getItem('ch-example') === '1'; } catch (e) { return false; }
  }
  function setExample(on) {
    try { localStorage.setItem('ch-example', on ? '1' : '0'); } catch (e) { /* fine */ }
  }

  function drawMode(body) {
    var box = document.getElementById('fn-mode');
    if (!box) return;
    // Nothing to switch to, nothing to offer.
    box.hidden = !body.hasExample;
    if (!body.hasExample) return;

    var on = !!body.example;
    var title = document.getElementById('fn-mode-title');
    var sub = document.getElementById('fn-mode-sub');
    var btn = document.getElementById('fn-mode-toggle');
    if (title) title.innerHTML = 'Example mode <b>' + (on ? 'ON' : 'OFF') + '</b>';
    if (sub) {
      sub.textContent = on
        ? 'You’re viewing example data to see how Svarg works.'
        : 'You’re viewing your business data.';
    }
    if (btn) btn.setAttribute('aria-checked', on ? 'true' : 'false');
    box.className = 'fn__mode' + (on ? ' is-on' : '');
  }

  /*
   * ── One board at a time ──────────────────────────────────────────────────
   *
   * Five things call load(), and two of them are routinely in flight at
   * once: the boot read and the shell's own announcement of the board, or a
   * read already running when somebody reaches for the Example mode switch.
   *
   * Without a sequence, the answer that arrives LAST paints the screen --
   * not the one that was asked for last. Ask for the business, then ask for
   * the demonstration, and if the first answer is the slower of the two it
   * lands second and turns the switch back off under the reader's hand.
   *
   * Which makes it intermittent, and an intermittent control is worse than
   * a broken one: a broken switch gets reported, a flaky one gets distrusted
   * along with everything around it.
   */
  var reading = 0;

  function load() {
    var mine = ++reading;
    return api('/findings' + (exampleOn() ? '?example=1' : ''))
      .then(function (body) {
        // Somebody asked a newer question. This answer is about a board the
        // reader has already moved on from.
        if (mine !== reading) return null;
        drawMode(body);
        render(body);
        return body;
      })
      .catch(function (err) {
        if (mine !== reading) return;
        // No verdict when the findings could not be read: a banner saying
        // "everything looks good" over a failed request is the worst
        // possible combination on this screen.
        if (el.hero) el.hero.hidden = true;
        el.list.hidden = true;
        drawExamples([]);
        el.empty.hidden = false;
        el.emptyTitle.textContent = 'The findings could not be read.';
        el.emptyNote.textContent = err.message;
      });
  }

  // ── One finding, and why we believe it ────────────────────────────────────

  /*
   * Columns that hold sentences rather than values.
   *
   * ── Why a finding needed this ──────────────────────────────────────────
   *
   * The first finding built on a phone call read "Promise made with no task
   * logged afterwards" and then showed a table whose ninth column held eight
   * hundred characters of transcript. The sentence that caused the finding —
   * "I will just check with the team and get back to you" — was in there, in
   * the same size type as the call duration and the same width as a column
   * called received_at. The owner's words were that anybody would find it
   * difficult to understand what promise was not kept, and they would.
   *
   * Two ways a column earns this: it is named like a quote, or its contents
   * are longer than anything belongs in a cell. The second matters because a
   * customer's own column could be called anything at all.
   */
  var PROSE_NAME = /quote|transcript|note|descript|comment|message|summary|reason|remark|detail/i;
  var PROSE_LENGTH = 90;
  /*
   * A named column still has to hold a sentence.
   *
   * transcript_status matches "transcript" and holds the word "read". Lifted
   * out as something somebody said, it became a quotation of the word "read"
   * sitting under the conversation it describes — which is the sort of thing
   * that makes a careful screen look careless. So a name is a hint and the
   * content decides, at a length no status word reaches.
   */
  var NAMED_MIN = 25;

  function proseColumns(columns, rows) {
    var out = [];
    (columns || []).forEach(function (c, i) {
      var longest = 0;
      (rows || []).forEach(function (r) {
        var v = String((r || [])[i] == null ? '' : (r || [])[i]);
        if (v.length > longest) longest = v.length;
      });
      if (longest > PROSE_LENGTH || (PROSE_NAME.test(c) && longest > NAMED_MIN)) out.push(i);
    });
    return out;
  }

  /** promise_quote -> "Promise quote". The customer's own column names. */
  function humanise(name) {
    var s = String(name || '').replace(/[_-]+/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  /**
   * The sentences out of a finding's rows, quoted rather than tabulated.
   *
   * A quote column leads, because on a promise finding that IS the finding.
   * The transcript follows it, because it is the proof rather than the point
   * — and a reader who wants it can have it without wading through it first.
   */
  function saidBlocks(sides) {
    var blocks = [];
    sides.forEach(function (s) {
      var idx = proseColumns(s.columns, s.rows);
      if (!idx.length) return;
      idx.sort(function (a, b) {
        var qa = /quote/i.test(s.columns[a]) ? 0 : 1;
        var qb = /quote/i.test(s.columns[b]) ? 0 : 1;
        return qa - qb || a - b;
      });
      idx.forEach(function (i) {
        (s.rows || []).forEach(function (r) {
          var v = String((r || [])[i] == null ? '' : (r || [])[i]).trim();
          if (!v) return;
          var quote = /quote/i.test(s.columns[i]);
          blocks.push(
            '<div class="fd-said__item' + (quote ? ' fd-said__item--quote' : '') + '">'
            + '<p class="fd-said__label">' + esc(humanise(s.columns[i]))
            + (s.dataset ? ' <span>' + esc(s.dataset) + '</span>' : '') + '</p>'
            + '<blockquote class="fd-said__text">' + esc(v) + '</blockquote>'
            + '</div>'
          );
        });
      });
    });
    return blocks.join('');
  }

  function facts(ev) {
    var rows = [];
    // Named "systems" when there are two: a finding that compares a diary
    // against a call log is read as "where did this come from", and the
    // answer is two places rather than one dataset with a plus in its name.
    if (ev.dataset) rows.push([ev.sides && ev.sides.length === 2 ? 'Systems read' : 'Source', ev.dataset]);
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

      /*
       * The label travels to the detail screen too.
       *
       * This is the screen somebody reads before acting on a finding, and
       * acting on an invented one means ringing a customer who does not
       * exist. The list said Example; so does this.
       */
      d.chip.textContent = (ev.simulated ? 'Example · ' : '')
        + (LABEL[f.severity] || 'Medium') + ' · ' + (f.watcher || 'A watcher');
      d.chip.className = 'fd__chip fd__chip--' + (ev.simulated ? 'eg' : (f.severity || 'medium'));
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
      // Cleared before every open: a finding with no sentences in it must not
      // show the last one's.
      d.said.hidden = true;
      d.saidbody.innerHTML = '';
      if (lines.length) {
        /*
         * One table per system.
         *
         * A finding that compares two systems carries rows from both, and
         * they have different columns. Drawing them all under one header
         * puts a call log's cells beneath an appointment diary's headings —
         * which does not look broken, it looks authoritative and wrong.
         *
         * `leftCount` says where the first dataset's rows stop. Without it —
         * every finding from a single dataset — this is the one table it
         * always was.
         */
        var split = (ev.sides && ev.sides.length === 2 && ev.leftCount != null)
          ? [
            { dataset: ev.sides[0].dataset, columns: ev.sides[0].columns, rows: lines.slice(0, ev.leftCount) },
            { dataset: ev.sides[1].dataset, columns: ev.sides[1].columns, rows: lines.slice(ev.leftCount) },
          ].filter(function (s) { return s.rows.length; })
          : [{ dataset: '', columns: ev.columns || [], rows: lines }];

        /*
         * The sentences come out first, and out of the table with them.
         *
         * Leaving them in as well would mean reading the same eight hundred
         * characters twice, once unreadably. What is left is the columns a
         * table is good at — a date, a duration, a number — and those now fit
         * on a screen.
         */
        d.saidbody.innerHTML = saidBlocks(split);
        d.said.hidden = !d.saidbody.innerHTML;

        split = split.map(function (s) {
          var drop = proseColumns(s.columns, s.rows);
          if (!drop.length) return s;
          var keep = (s.columns || []).map(function (_, i) { return i; })
            .filter(function (i) { return drop.indexOf(i) < 0; });
          return {
            dataset: s.dataset,
            columns: keep.map(function (i) { return s.columns[i]; }),
            rows: (s.rows || []).map(function (r) {
              return keep.map(function (i) { return (r || [])[i]; });
            }),
          };
        }).filter(function (s) { return s.columns.length; });

        d.rows.hidden = !split.length;

        d.table.innerHTML = split.map(function (s) {
          var head = (s.columns && s.columns.length)
            ? '<thead>'
              + (s.dataset ? '<tr class="fd-rows__from"><th colspan="' + s.columns.length + '">'
                  + esc(s.dataset) + '</th></tr>' : '')
              + '<tr>' + s.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>'
              + '</thead>'
            : '';
          return head + '<tbody>' + s.rows.map(function (row) {
            return '<tr>' + (row || []).map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody>';
        }).join('');

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

  (function wireMode() {
    var btn = document.getElementById('fn-mode-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = !exampleOn();
      setExample(next);
      // The whole board is re-read rather than re-filtered here: the verdict,
      // the area counts and the list all change together, and a screen that
      // updated some of them would be worse than one that reloaded.
      picked = '';
      /*
       * The switch moves now, not when the server answers.
       *
       * It used to wait for the round trip, so on a slow read the control
       * stayed where it was and the click looked like it had not taken --
       * and the obvious response to a switch that did not take is to press
       * it again, which undid it. What the switch reports is what this
       * browser is about to ask for, and that is already known here.
       */
      drawMode({ hasExample: _last ? _last.hasExample : true, example: next });
      load();
    });
  }());

  el.areagrid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]');
    if (!b) return;
    // Re-filter what is already loaded rather than asking the server again:
    // the areas are a lens on one morning's findings, not a new question.
    var name = b.dataset.pick || '';
    picked = picked === name ? '' : name;
    if (_last) render(_last);
  });

  /*
   * Choosing a person re-filters what is already loaded, exactly as a
   * category chip does. Both are a lens on one morning's findings rather
   * than a new question, so neither asks the server again.
   */
  if (el.person) {
    el.person.addEventListener('change', function () {
      person = el.person.value || '';
      if (_last) render(_last);
    });
  }
  if (el.personClear) {
    el.personClear.addEventListener('click', function () {
      person = '';
      if (_last) render(_last);
    });
  }

  if (el.areasLink) {
    el.areasLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof window.svargShowPanel === 'function') window.svargShowPanel('agents');
      else window.location.hash = '#agents';
    });
  }

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

  /*
   * The health card opens Watchers.
   *
   * A card that states a verdict should be able to show its working, and in
   * every one of the six states the useful next screen is the same: what is
   * doing the watching. Stopped checks are there, so is the area nothing is
   * watching yet.
   */
  if (el.health) {
    el.health.addEventListener('click', function () {
      if (typeof window.svargShowPanel === 'function') window.svargShowPanel('agents');
      else window.location.hash = '#agents';
    });
  }
  window.addEventListener('svarg:findings-open', function () {
    detail.hidden = true;
    page.hidden = false;
    tellTime();
    load();
  });

  /*
   * ── And once at startup, if the board is already on screen ───────────────
   *
   * This script is deferred, so it runs after the document has been parsed.
   * The shell decides which screen to show DURING parsing — on a refresh it
   * goes straight to the board and announces it — so by the time the
   * listener above exists, the event it is waiting for has already been and
   * gone. Nothing loaded, and the board sat empty under a hidden banner: a
   * blank page where the product's first screen should be.
   *
   * So the state is read rather than the event trusted. An event that may
   * have already fired is not something to build a screen on.
   */
  if (!page.hidden) { tellTime(); load(); }
}());
