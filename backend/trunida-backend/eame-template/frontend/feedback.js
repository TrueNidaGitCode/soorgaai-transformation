/**
 * A thumbs up or down under every answer.
 *
 * Fixed runtime, like data.js: it watches the conversation log for bot turns
 * and puts two small buttons under each, whatever module wrote the turn. A
 * vote is kept in this application (with the question and the answer it was
 * about) and only the vote reaches Svarg; a thumbs down offers a line for
 * what the answer should have been, which goes to Svarg as written, because
 * the person chose to write it for that.
 *
 * Which capability answered is read off the request the module made: a
 * POST under /api/<capability>/ carrying { message }. The fetch wrapper
 * below remembers the last such path and nothing else about the request.
 */
(function () {
  var API = (window.CONFIG && window.CONFIG.API_BASE) || '';
  var log = document.getElementById('ch-log');
  if (!log) return;

  var lastCapability = '';
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      // The segment after the last /api/: a module that doubled the prefix
      // (/api/api/thing) still names its capability.
      var tail = url.slice(url.lastIndexOf('/api/'));
      var m = /\/api\/([^/?#]+)/.exec(tail);
      if (method === 'POST' && m && !/^(session|data|connectors|signals)$/.test(m[1])) lastCapability = m[1];
    } catch (e) { /* the request goes through regardless */ }
    return nativeFetch.apply(this, arguments);
  };

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function questionBefore(turn) {
    var el = turn.previousElementSibling;
    while (el && !el.classList.contains('ch-turn--user')) el = el.previousElementSibling;
    return el ? el.textContent.trim() : '';
  }

  function decorate(turn) {
    var bubble = turn.querySelector('.ch-bubble');
    if (!bubble || bubble.classList.contains('ch-bubble--thinking') || bubble.querySelector('.ch-fb')) return;
    if (!bubble.querySelector('.ch-answer')) return;
    var box = document.createElement('div');
    box.className = 'ch-fb';
    box.innerHTML = '<button type="button" class="ch-fb__btn" data-vote="up" title="Good answer" aria-label="Good answer">&#128077;</button>'
      + '<button type="button" class="ch-fb__btn" data-vote="down" title="Not right" aria-label="Not right">&#128078;</button>'
      + '<span class="ch-fb__said" hidden></span>';
    bubble.appendChild(box);
  }

  async function send(payload) {
    var token = '';
    try { token = localStorage.getItem('token') || ''; } catch (e) { /* fine */ }
    var r = await nativeFetch(API + '/api/signals/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('not sent');
  }

  log.addEventListener('click', async function (e) {
    var btn = e.target.closest('.ch-fb__btn');
    if (btn) {
      var box = btn.closest('.ch-fb');
      var turn = btn.closest('.ch-turn');
      var vote = btn.dataset.vote;
      var answer = Array.prototype.map.call(turn.querySelectorAll('.ch-answer'), function (p) { return p.textContent; }).join('\n');
      var question = questionBefore(turn);
      box.querySelectorAll('.ch-fb__btn').forEach(function (b) { b.disabled = true; b.classList.toggle('ch-fb__btn--on', b === btn); });
      var said = box.querySelector('.ch-fb__said');
      if (vote === 'down') {
        said.hidden = false;
        said.innerHTML = '<input type="text" class="ch-fb__fix" maxlength="1000" placeholder="What should it have said? (optional)">'
          + '<button type="button" class="ch-fb__send">Send</button>';
        box._pending = { vote: vote, question: question, answer: answer, capability: lastCapability };
        said.querySelector('.ch-fb__fix').focus();
        return;
      }
      try { await send({ vote: vote, question: question, answer: answer, capability: lastCapability }); said.hidden = false; said.textContent = 'Thanks.'; }
      catch (err) { said.hidden = false; said.textContent = 'Could not send that.'; }
      return;
    }
    var go = e.target.closest('.ch-fb__send');
    if (go) {
      var b2 = go.closest('.ch-fb');
      var fix = b2.querySelector('.ch-fb__fix');
      var p = b2._pending || {};
      p.correction = fix ? fix.value.trim() : '';
      go.disabled = true;
      try { await send(p); b2.querySelector('.ch-fb__said').textContent = p.correction ? 'Thanks — noted, and it will be learned from.' : 'Thanks.'; }
      catch (err) { b2.querySelector('.ch-fb__said').textContent = 'Could not send that.'; }
    }
  });

  log.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('ch-fb__fix')) {
      e.preventDefault();
      var go = e.target.parentElement.querySelector('.ch-fb__send');
      if (go) go.click();
    }
  });

  new MutationObserver(function () {
    log.querySelectorAll('.ch-turn--bot').forEach(decorate);
  }).observe(log, { childList: true, subtree: true });
  log.querySelectorAll('.ch-turn--bot').forEach(decorate);
})();
