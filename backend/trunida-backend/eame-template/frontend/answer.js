/**
 * The conversation, as the page draws it.
 *
 * The application answers through POST /api/chat, which returns a structured
 * envelope rather than prose with numbers buried in it: the sentence, the
 * groups behind it with their records, what overlaps, where it came from, and
 * what can be done next. Nothing here parses text to find meaning — the
 * counting and the grouping happened in the pipeline, and this only lays it
 * out.
 *
 * It takes the composer over from the generated app.js, in the capture phase,
 * for the same reason the record card does: the shell owns the conversation
 * now, and every application should hold it the same way.
 *
 * Evidence is present and quiet — a line saying how many records, which opens
 * to show them. The answer is what the customer reads; the records are what
 * they check when they doubt it.
 */
(function () {
  var API = String((window.CONFIG && window.CONFIG.API_BASE) || window.location.origin).replace(/\/api\/?$/, '');
  var form = document.getElementById('ch-form');
  var input = document.getElementById('ch-input');
  var log = document.getElementById('ch-log');
  if (!form || !input || !log) return;

  // The turns this browser has had, so "what about their fees?" resolves
  // against what was just said. It stays here; the server is told only what
  // it needs to read the next question.
  var history = [];
  // What the last answer found: the people it named and the period it covered.
  // Sent back with the next question so a follow-up narrows that set instead
  // of starting again from the whole dataset.
  var context = null;
  var busy = false;

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function add(node) {
    log.appendChild(node);
    // The welcome goes once the conversation has begun.
    var w = document.querySelector('.ch-welcome');
    if (w) w.remove();
    var main = document.getElementById('ch-main');
    if (main) main.classList.remove('ch-main--welcome');
    log.scrollTop = log.scrollHeight;
    return node;
  }

  function said(text) {
    return add(el('<div class="ch-turn ch-turn--user"><div class="ch-bubble">' + esc(text) + '</div></div>'));
  }

  /*
   * What the application is doing, in the customer's terms. Not "calling the
   * model" or "querying" — those are true and useless. The steps are the work
   * as a person would describe it, and they advance on a timer because the
   * pipeline is one request: the point is that something is happening, not a
   * false claim about which stage it is on.
   */
  function working() {
    var steps = ['Reading the question…', 'Checking the records…', 'Putting the answer together…'];
    var node = add(el('<div class="ch-turn ch-turn--bot"><div class="ch-ans"><p class="ch-work"><span class="ch-work__dot"></span><span class="ch-work__text">' + steps[0] + '</span></p></div></div>'));
    var i = 0;
    var t = setInterval(function () {
      i++;
      if (i >= steps.length) { clearInterval(t); return; }
      var s = node.querySelector('.ch-work__text');
      if (s) s.textContent = steps[i];
    }, 1400);
    return { node: node, stop: function () { clearInterval(t); node.remove(); } };
  }

  /*
   * That the answer came from the simulated records is true of the
   * application, not of this reply, so it is said once where the application
   * says what it is — and never again under every answer.
   */
  function markSimulated(on) {
    var state = document.getElementById('ch-state');
    if (!state || !on || state.dataset.chSim === '1') return;
    state.dataset.chSim = '1';
    var label = state.querySelector('span:last-child') || state;
    label.textContent = 'Using simulated data';
    state.title = 'This application is answering from the records it was built with. Connect your own on the Data page.';
    state.classList.add('ch-head__state--sim');
  }

  function notice(text) {
    return add(el('<div class="ch-turn ch-turn--bot"><div class="ch-ans"><p class="ch-notice">' + esc(text) + '</p></div></div>'));
  }

  // ── One group of records ──────────────────────────────────────────────────

  function groupHtml(g) {
    // The count the customer reads is the one that matches the lines below it.
    // When rows and people differ, both are said rather than one standing in
    // for the other.
    var count = g.entities && g.entities !== g.records
      ? g.entities + (g.entities === 1 ? ' person' : ' people') + ' · ' + g.records + ' records'
      : g.records + (g.records === 1 ? ' record' : ' records');
    var items = g.items.map(function (it) {
      var extra = it.records > 1
        ? '<span class="ch-item__more">in ' + it.records + ' records</span>' : '';
      var detail = it.lines.map(function (cells) {
        return '<span class="ch-item__line">' + esc(cells.filter(Boolean).slice(0, 4).join(' · ')) + '</span>';
      }).join('');
      return '<li class="ch-item">'
        + (it.name ? '<span class="ch-item__name">' + esc(it.name) + '</span>' + extra : '')
        + '<span class="ch-item__lines">' + detail + '</span></li>';
    }).join('');
    return '<section class="ch-group">'
      + '<p class="ch-group__head">'
      + '<span class="ch-group__label">' + esc(g.label) + '</span>'
      // The tag says what kind of thing this group is. When the label already
      // says it, one of them is noise.
      + (g.categoryLabel && g.categoryLabel.toLowerCase() !== String(g.label).toLowerCase()
          ? '<span class="ch-tag ch-tag--' + esc(g.tone) + '">' + esc(g.categoryLabel) + '</span>' : '')
      + (g.window ? '<span class="ch-group__when">' + esc(g.window) + '</span>' : '')
      + '<span class="ch-group__count">' + esc(count) + '</span></p>'
      // A derived group is not a column anyone can look up: say the rule.
      + (g.rule ? '<p class="ch-group__rule">Worked out from the records: ' + esc(g.rule) + '</p>' : '')
      + '<ul class="ch-items">' + items + '</ul>'
      + '</section>';
  }

  // ── Evidence: quiet, and there when doubted ──────────────────────────────

  function sourcesHtml(d) {
    if (!d.sources.length) return '';
    var total = d.sources.reduce(function (n, s) { return n + s.records; }, 0);
    var what = d.sources.map(function (s) { return s.records + ' ' + s.dataset; }).join(' · ');
    return '<div class="ch-src">'
      + '<button type="button" class="ch-src__btn" aria-expanded="false">'
      + '<span class="ch-src__label">Sources</span>'
      + '<span class="ch-src__what">' + esc(what) + '</span>'
      + '<span class="ch-src__caret" aria-hidden="true">&rsaquo;</span></button>'
      + '<div class="ch-src__body" hidden></div>'
      + '</div>';
  }

  function evidenceTable(g) {
    var head = g.columns.slice(0, 5);
    var rows = [];
    g.items.forEach(function (it) {
      it.lines.forEach(function (cells) { rows.push(cells.slice(0, 5)); });
    });
    return '<p class="ch-ev__head">' + esc(g.label) + '</p>'
      + '<div class="ch-ev__wrap"><table class="ch-ev"><thead><tr>'
      + head.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + rows.slice(0, 25).map(function (r) {
        return '<tr>' + head.map(function (_, i) { return '<td>' + esc(r[i] || '') + '</td>'; }).join('') + '</tr>';
      }).join('')
      + '</tbody></table></div>'
      + (rows.length > 25 ? '<p class="ch-ev__more">' + (rows.length - 25) + ' more not shown.</p>' : '');
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  /*
   * What can be done from here. Opening a dataset is not consequential and is
   * a link. Anything that leaves the application — a message, a reminder — is
   * prepared and shown, and waits: the customer authorises it, or it does not
   * happen. Nothing here claims to have done something it has not.
   */
  function actionsHtml(d) {
    var acts = d.groups.map(function (g) {
      return '<button type="button" class="ch-act" data-open-dataset="' + esc(g.dataset) + '">View ' + esc(g.label.toLowerCase()) + '</button>';
    });
    if (d.intent === 'action' && d.act) {
      acts.unshift('<button type="button" class="ch-act ch-act--go" data-prepare="1">Prepare ' + esc(String(d.act).slice(0, 60)) + '</button>');
    }
    return acts.length ? '<div class="ch-acts">' + acts.join('') + '</div>' : '';
  }

  function answerNode(d) {
    // One flex child holding the whole answer: .ch-turn lays its children out
    // in a row, so an unwrapped set of paragraphs becomes a set of columns.
    var node = el('<div class="ch-turn ch-turn--bot"><div class="ch-ans"></div></div>');
    var body = node.querySelector('.ch-ans');
    var html = '';
    String(d.answer || '').split(/\n+/).filter(Boolean).forEach(function (p) {
      html += '<p class="ch-answer">' + esc(p) + '</p>';
    });
    // Only when the sentence has not already said it: the model is given the
    // overlap as a fact and often uses it, and hearing it twice reads as a bug.
    var saidOverlap = d.overlap && String(d.answer || '').indexOf(String(d.overlap.people)) !== -1
      && String(d.answer || '').indexOf(String(d.overlap.issues)) !== -1;
    // Only when it had to choose a reading: saying it every time is noise.
    if (d.reading && (d.state === 'ambiguous' || d.state === 'derivable')) {
      html += '<p class="ch-reading">Read as: ' + esc(d.reading) + '</p>';
    }
    if (d.overlap && !saidOverlap) {
      html += '<p class="ch-overlap">' + (d.overlap.both.length === 1
        ? 'One of these is in more than one group'
        : d.overlap.both.length + ' of these are in more than one group')
        + ', so this is ' + d.overlap.issues + ' items across ' + d.overlap.people + ' people.</p>';
    }
    d.groups.forEach(function (g) { if (g.records) html += groupHtml(g); });
    (d.notes || []).forEach(function (n) { html += '<p class="ch-gap">' + esc(n) + '</p>'; });
    html += actionsHtml(d);
    html += sourcesHtml(d);
    body.innerHTML = html;
    markSimulated(d.simulated);

    // Evidence opens where it is, not in a dialogue somewhere else.
    var btn = node.querySelector('.ch-src__btn');
    if (btn) {
      btn.addEventListener('click', function () {
        var body = node.querySelector('.ch-src__body');
        var open = body.hidden;
        if (open && !body.innerHTML) body.innerHTML = d.groups.filter(function (g) { return g.records; }).map(evidenceTable).join('');
        body.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        btn.classList.toggle('ch-src__btn--open', open);
      });
    }
    node.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open-dataset]');
      if (open) {
        try { sessionStorage.setItem('ch-open-dataset', open.dataset.openDataset); } catch (err) { /* fine */ }
        var l = document.getElementById('ch-data-link');
        if (l) l.click();
        return;
      }
      var prep = e.target.closest('[data-prepare]');
      if (prep) prepare(node, d, prep);
    });
    return add(node);
  }

  /*
   * A consequential action, prepared and waiting.
   *
   * The application cannot send anything on its own yet, and saying otherwise
   * would be the one lie that matters: the customer would believe the parents
   * had been told. So what it does is assemble the list and the words, show
   * them, and say plainly what would carry them.
   */
  function prepare(node, d, btn) {
    btn.disabled = true;
    var people = [];
    d.groups.forEach(function (g) {
      g.items.forEach(function (it) { if (it.name && people.indexOf(it.name) === -1) people.push(it.name); });
    });
    var card = el('<div class="ch-prep">'
      + '<p class="ch-prep__head">Prepared for ' + people.length + (people.length === 1 ? ' person' : ' people') + '</p>'
      + '<ul class="ch-prep__who">' + people.slice(0, 12).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('')
      + (people.length > 12 ? '<li class="ch-prep__rest">and ' + (people.length - 12) + ' more</li>' : '') + '</ul>'
      + '<p class="ch-prep__note">Nothing has been sent. This application has no connected way to send messages yet — connect WhatsApp Business on the Data page and this becomes a send.</p>'
      + '<div class="ch-acts"><button type="button" class="ch-act" data-open-dataset="' + esc(d.groups[0] ? d.groups[0].dataset : '') + '">Open the data</button></div>'
      + '</div>');
    (node.querySelector('.ch-ans') || node).appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  // ── Asking ────────────────────────────────────────────────────────────────

  async function ask(text) {
    said(text);
    history.push({ role: 'user', text: text });
    var work = working();
    var d = null;
    try {
      var token = ''; try { token = localStorage.getItem('token') || ''; } catch (e) { /* fine */ }
      var kind = 'own';
      try { kind = sessionStorage.getItem('ch-answer-kind') === 'sample' ? 'sample' : 'own'; } catch (e) { /* fine */ }
      var r = await fetch(API + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ message: text, history: history.slice(-8), context: context, kind: kind }),
      });
      d = r.ok ? await r.json() : null;
      if (!r.ok) {
        var err = await r.json().catch(function () { return {}; });
        work.stop();
        notice(err.error || 'That did not work. Try again in a moment.');
        return;
      }
    } catch (e) {
      work.stop();
      notice('I could not reach the application. Check your connection and try again.');
      return;
    }
    work.stop();
    answerNode(d);
    context = d.context || null;
    history.push({ role: 'assistant', text: d.answer || '' });
    if (history.length > 12) history = history.slice(-12);
  }

  // Capture phase, before the generated app.js sees it: the shell owns the
  // conversation. stopImmediatePropagation keeps both from answering at once.
  form.addEventListener('submit', function (e) {
    var text = (input.value || '').trim();
    if (!text || busy) return;

    /*
     * A record gets written, not answered.
     *
     * The shell's record card listens for the same submit and offers to write
     * "add Priya to the U14 batch" down. This layer listens first, so it has
     * to stand aside for that sentence, and pick the question up again when
     * the card decides it was not a record after all — which it signals by
     * re-submitting with this marker.
     */
    if (form.dataset.chPass === '1') {
      delete form.dataset.chPass;
    } else if (window.chIsRecord && window.chIsRecord(text)) {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    busy = true;
    ask(text).finally(function () { busy = false; });
  }, true);
})();
