/**
 * Svarg — Sales Funnel (platform admin only)
 *
 * Five tabs in funnel order. The board comes from
 * services/salesSignalsService.js, which also backs scripts/sales_agent.mjs,
 * so this screen and the terminal can never show different numbers.
 *
 * The ask box does NOT send the board up with the question — the server
 * rebuilds it. A client that could supply the board could supply the facts.
 *
 * Client-side role guard only — the backend independently enforces adminOnly
 * on every /api/admin/sales-signals/* route.
 */

const API_BASE = window.CONFIG.API_BASE;

/** Order matters: this is the funnel. */
const TABS = [
  { key: 'outreach',   label: 'Outreach',   hint: 'Everyone you are working toward a first conversation, grouped by how that conversation started. The only stage typed in by hand.' },
  { key: 'discovery',  label: 'Discovery',  hint: 'Anonymous guests who generated a blueprint. No email exists for these — the IP is the only way to tell one company returning from several visitors.' },
  { key: 'conversion', label: 'Conversion', hint: 'Signed up, nothing live yet. The blocker is the useful part.' },
  { key: 'onboarding', label: 'Onboarding', hint: 'Running a live application.' },
  { key: 'sales',      label: 'Sales',      hint: 'On a paid plan.' },
];

/**
 * Which kinds of row to show. Real only, by default.
 *
 * A third of the accounts are test@example.com and Svarg's own addresses. A
 * board you have to mentally filter every time you read it is one you stop
 * reading — but the filter is a view, never a deletion, and the screen always
 * says how many rows it is leaving out. A silent filter that hides a genuine
 * customer would be far worse than the noise it removes.
 */
let state = {
  signals: null, mail: null, template: null, tab: 'outreach',
  kinds: new Set(['real']), view: 'funnel',
  /**
   * The go-to-market motions, fetched from the server.
   *
   * Not hard-coded here. The plays are the reasoning behind the strategy and
   * the server validates against the same list, so two copies would drift into
   * two different strategies — one the operator reads, one the API enforces.
   */
  motions: null,
  /**
   * Which lane of Outreach is open.
   *
   * Introduced by default, not Broadcast. Cold email is a motion, not the
   * plan: for a new category the first enterprise sale turns on trust and a
   * sponsor, and whichever lane opens first is the one that gets worked.
   */
  lane: 'introduced',
  /** Which motion the add form is set to, within the open lane. */
  addMotion: null,
  /**
   * The link just produced for a newly added lead, if any.
   *
   * Kept here rather than in the DOM because adding a lead reloads the board,
   * which re-renders the panel the link sits in. Cleared as soon as the context
   * changes — another lane, another motion — since a link belongs to one person
   * and a stale one is a link sent to the wrong contact.
   */
  invite: null,
};

/** The rows of one stage, after the kind filter. */
function visible(rows) {
  return (rows || []).filter(r => !r.kind || state.kinds.has(r.kind));
}

function hiddenCount(rows) {
  return (rows || []).length - visible(rows).length;
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/sales-signals${path}`, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function esc(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Say something, where the operator is actually looking.
 *
 * The banner lives at the top of the page, above the tabs. The buttons that
 * produce messages are at the bottom of a long form, so a refusal — "no
 * organisation paragraph written" — was being reported into empty space
 * several screens away. The operator saw a button do nothing, and concluded
 * the feature was broken; a message nobody can see is the same as no message.
 *
 * So it scrolls itself into view, and errors stay until replaced while
 * confirmations clear themselves.
 */
let bannerTimer = null;

function banner(message, isError = true) {
  const el = document.getElementById('sg-banner');
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  if (!message) { el.style.display = 'none'; return; }

  el.textContent = message;
  el.className = `cl-banner ${isError ? 'error' : 'success'}`;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Success is transient; a refusal is something to act on and stays put.
  if (!isError) bannerTimer = setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function age(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return d < 1 ? `${d.toFixed(1)}d` : `${Math.round(d)}d`;
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * An address with its domain emphasised, plus a note when a look-alike account
 * sits at another stage.
 *
 * Both exist for the same reason: praneshbabykannan@soorgaai.com in Conversion
 * and praneshbabykannan@svargai.com in Onboarding are different accounts that
 * read as one row printed twice. The domain carries the whole distinction, so
 * it is the part that gets the contrast.
 */
function emailCell(r) {
  // Email is optional now — a warm introduction often has only a number. The
  // naive split rendered a bare "@" for those, which reads as a broken row
  // rather than as a contact you reach a different way.
  if (!String(r.email || '').trim()) {
    return r.phone
      ? `<span class="sg-local">${esc(r.phone)}</span>`
      : '<span class="sg-unknown">no email or number</span>';
  }
  const [local, domain] = String(r.email || '').split('@');
  const addr = `<span class="sg-local">${esc(local)}</span><span class="sg-domain">@${esc(domain || '')}</span>`;
  if (!r.alsoAt?.length) return addr;
  const others = r.alsoAt.map(o => `${esc(o.email)} in ${esc(o.stage)}`).join(', ');
  return `${addr}<div class="sg-alsoat" title="Separate accounts — not merged">also looks like ${others}</div>`;
}

/**
 * A blank that says which kind of blank it is.
 *
 * "not recorded" and "we know there is none" look identical as an empty cell,
 * and on a sales board the difference decides whether you go and find out.
 * Organisation comes from the profile, so blank means setup was never
 * finished; country is derived from the visitor IP, which was only captured
 * from 8 September, so every earlier row can never have one.
 */
function orgBlank() {
  return '<span class="sg-unknown" title="No organisation on their profile">no profile</span>';
}

function countryCell(code) {
  if (!code) return '<span class="sg-unknown" title="Derived from the visitor IP, which was not recorded for this visit">not recorded</span>';
  return `<span class="sg-country">${esc(code)}</span>`;
}

function table(cols, rows, row) {
  if (!rows.length) return '<div class="sg-empty">Nothing at this stage right now.</div>';
  return `<table class="cl-table">
    <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row).join('')}</tbody>
  </table>`;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const KIND_LABELS = { real: 'Real', internal: 'Internal', test: 'Test' };

function renderKindFilter() {
  const all = TABS.flatMap(t => state.signals[t.key] || []);
  const totals = { real: 0, internal: 0, test: 0 };
  for (const r of all) if (r.kind) totals[r.kind] = (totals[r.kind] || 0) + 1;

  document.getElementById('sg-kinds').innerHTML =
    `<span class="sg-kinds__label">Showing</span>` +
    Object.keys(KIND_LABELS).map(k => `
      <button type="button" data-kind="${k}"
              class="sg-kind sg-kind--${k} ${state.kinds.has(k) ? 'sg-kind--on' : ''}">
        ${esc(KIND_LABELS[k])} <span class="sg-kind__n">${totals[k] || 0}</span>
      </button>`).join('');

  document.querySelectorAll('.sg-kind').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.kind;
      // Never allow every kind to be switched off — an empty board looks
      // exactly like a board with nothing in it.
      if (state.kinds.has(k) && state.kinds.size === 1) return;
      state.kinds.has(k) ? state.kinds.delete(k) : state.kinds.add(k);
      renderKindFilter(); renderTabs(); renderStage();
    });
  });
}

function renderTabs() {
  document.getElementById('sg-tabs').innerHTML = TABS.map((t, i) => `
    <button type="button" role="tab" data-tab="${t.key}"
            class="sg-tab ${state.tab === t.key ? 'sg-tab--active' : ''}"
            aria-selected="${state.tab === t.key}">
      <span class="sg-tab__n">${i + 1}</span>
      <span class="sg-tab__label">${esc(t.label)}</span>
      <span class="sg-tab__count">${visible(state.signals[t.key]).length}</span>
    </button>
  `).join('<span class="sg-tab__arrow">→</span>');

  document.querySelectorAll('.sg-tab').forEach(b => {
    b.addEventListener('click', () => { state.tab = b.dataset.tab; renderTabs(); renderStage(); });
  });
}

// ── Stages ───────────────────────────────────────────────────────────────────

/** When the next follow-up goes out, said in words rather than a raw date. */
function nextSendLabel(q) {
  if (q.stoppedReason) return q.stoppedReason;
  if (!q.enabled) return 'Paused';
  if (!q.nextSendAt) return 'Not scheduled';
  const ms = new Date(q.nextSendAt) - Date.now();
  if (ms <= 0) return 'Due now';
  const days = ms / 86400000;
  return days < 1 ? `in ${Math.round(ms / 3600000)}h` : `in ${Math.round(days)}d`;
}

/**
 * What has to happen next, for a motion with no machinery behind it.
 *
 * Cold email has a scheduler that knows; every other motion has a person who
 * has to remember. A lane whose Next column is blank looks identical whether
 * it is moving or has stalled, which is the failure this whole screen exists
 * to avoid — so a missing next step is stated, not left as an empty cell.
 */
function nextStepLabel(r) {
  if (!r.nextStep && !r.nextStepAt) {
    return '<span class="sg-unknown" title="Nothing recorded — this lane has no scheduler, so an empty next step means it has stalled">no next step</span>';
  }
  const when = r.nextStepAt ? new Date(r.nextStepAt) : null;
  let due = '';
  if (when) {
    const days = Math.round((when - Date.now()) / 86400000);
    due = days < 0 ? `<span class="sg-blocked">${-days}d overdue</span>`
      : days === 0 ? '<span class="sg-blocked">today</span>'
      : `in ${days}d`;
  }
  return `${esc(clip(r.nextStep, 44)) || '<span class="sg-unknown">unnamed</span>'}${due ? `<div class="sg-note">${due}</div>` : ''}`;
}

/**
 * The "Route in" cell — whatever this motion actually knows about the approach.
 *
 * Most motions store one string in `via`: which firm, which event, which post.
 * A warm introduction stores how you know them and where they are instead,
 * because those are the two things that change what you say. Rendering `via`
 * for a motion that never collects it would leave the column permanently empty
 * on the lane the operator uses most.
 */
function routeInCell(r) {
  // Location moved to its own column — it is something you scan down, not
  // something you read per row, and repeating it here would say it twice.
  if (r.relationship) {
    return `${esc(r.relationship)}${r.phone ? `<div class="sg-note">${esc(r.phone)}</div>` : ''}`;
  }
  if (r.via) return esc(clip(r.via, 40));
  if (r.phone) return esc(r.phone);
  return `<span class="sg-unknown">${esc(motionByKey(r.motion)?.viaLabel || 'not recorded')}</span>`;
}

/**
 * Where this lead is.
 *
 * Recorded on the motions that ask for it, blank on the ones that do not — so
 * the cell says which of the two it is rather than leaving an ambiguous gap.
 * It is settable on any lead from Log, because a cold lead has a location too;
 * it was simply never asked for at the point of adding one.
 */
/**
 * What business they are in, and whether we can ground a conversation in it.
 *
 * A lane full of an industry the knowledge base has never heard of is not a
 * blank to be tidied away — it is the clearest signal there is about what to
 * write next, so the cell says which of the two it is rather than looking the
 * same either way.
 */
function industryCell(r) {
  if (!r.industry) return '';
  const known = groundedIndustries().some(i => i.toLowerCase() === r.industry.toLowerCase());
  return `<div class="sg-industry${known ? '' : ' sg-industry--ungrounded'}"
    title="${known ? 'The knowledge base covers this industry' : 'No knowledge base overlay for this industry yet'}"
    >${esc(r.industry)}</div>`;
}

/**
 * The options for the location select, including whatever this row already has.
 *
 * The list is India and US. A row whose location is neither — an area typed on
 * a walk-in, a city entered by an import — matched no option, so the browser
 * fell back to the first one ("not recorded") and pressing Save wrote an empty
 * string over it. Opening the log to read a row deleted a field on it.
 *
 * So the current value is an option whenever it is not already one. The select
 * still offers the two it is opinionated about; it simply no longer destroys
 * what it does not recognise.
 */
function locationOptions(current) {
  const known = ['India', 'US'];
  const all = current && !known.includes(current) ? [...known, current] : known;
  return `<option value="">not recorded</option>`
    + all.map(o => `<option value="${esc(o)}" ${current === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
}

function locationCell(r) {
  if (r.location) return `<span class="sg-loc">${esc(r.location)}</span>`;
  return '<span class="sg-unknown" title="Not recorded — press Log to set it">—</span>';
}

/** The motion this lead is filed under, as a chip beside the contact. */
function motionChip(r) {
  const m = motionByKey(r.motion);
  if (!m) return '';
  return `<span class="sg-motion" title="${esc(m.summary)}">${esc(m.label)}</span>`;
}

/**
 * An empty contact is not always missing information.
 *
 * On a walk-in it is the expected state: the institute earns a row before
 * anybody there is a contact, and the name arrives after the visit.
 * Rendering that as "no name" reads as a broken record rather than a plan,
 * and a list of places to visit then looks like data somebody abandoned.
 */
function noContactYet(r) {
  const m = motionByKey(r.motion);
  if (!m?.startsWithoutContact) return '<span class="sg-unknown">no name</span>';
  return '<span class="sg-await" title="Added as a place to visit. The name and number are filled in on this row after you have been.">to visit</span>';
}

/** Which renderer a row gets — decided per row, because a lane holds both kinds. */
function outreachRow(r) {
  return motionByKey(r.motion)?.emails ? leadRow(r) : motionRow(r);
}

/**
 * "Shared" — the one action that actually happens on these rows.
 *
 * Svarg cannot see that you sent the link; WhatsApp is not something it can
 * observe. So this is the one place in the funnel where a human has to tell the
 * board what happened, and it is worth a button of its own rather than being
 * buried in the status dropdown beside it.
 *
 * Once it has been pressed the button stops being an action and becomes a
 * record. Offering "Shared" again on a lead you already shared with invites
 * exactly the mistake it exists to prevent — two messages to the same friend —
 * so it shows the date instead and does nothing.
 */
function sharedButton(r) {
  if (r.status === 'to-contact') {
    return `<button type="button" class="sg-btn sg-btn--go" data-shared="${esc(r.id)}"
      title="Mark that you have sent them the link — moves this lead to contacted">Shared</button>`;
  }
  const when = r.lastContactedAt
    ? new Date(r.lastContactedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : '';
  return `<span class="sg-shared" title="${r.lastContactedAt
    ? `Shared on ${new Date(r.lastContactedAt).toLocaleString()}`
    : 'Already past to-contact'}">Shared${when ? ` ${esc(when)}` : ''}</span>`;
}

/**
 * A lead on a motion that never sends.
 *
 * Same six columns as a cold lead so one table holds both, and deliberately
 * no Generate, Preview or Send. Those buttons on a warm introduction would be
 * an invitation to spend the introduction on a templated email — the server
 * refuses it too, but a button you must not press should not be there at all.
 */
function motionRow(r) {
  return `<tr class="sg-leadrow">
    <td>
      <select data-lead="${esc(r.id)}" class="sg-status-select sg-status-select--${esc(r.status)}">
        ${['to-contact', 'contacted', 'replied', 'dead'].map(v =>
          `<option value="${v}" ${v === r.status ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </td>
    <td>
      <div class="sg-org">${esc(r.company) || orgBlank()}</div>
      ${industryCell(r)}
      <div class="sg-links">
        ${r.linkedinUrl ? `<a href="${esc(r.linkedinUrl)}" target="_blank" rel="noopener">in</a>` : ''}
        ${r.companyUrl ? `<a href="${esc(r.companyUrl)}" target="_blank" rel="noopener">web</a>` : ''}
      </div>
    </td>
    <td>
      <div class="sg-contact__name">${esc(r.name) || noContactYet(r)}
        ${r.role ? `<span class="sg-fn">${esc(r.role)}</span>` : ''}</div>
      <div class="sg-who">${emailCell(r)}</div>
      ${motionChip(r)}
    </td>
    <td>${locationCell(r)}</td>
    <td class="sg-note">${routeInCell(r)}</td>
    <td class="sg-note sg-editable" data-log="${esc(r.id)}"
        title="Click to record the route in, what happens next, and where they are">${nextStepLabel(r)}</td>
    <td class="sg-rowactions">
      ${r.inviteLink
        ? `<button type="button" class="sg-btn" data-copylink="${esc(r.inviteLink)}"
             title="The link to send them — signups through it are attributed to this lead">Link</button>`
        : ''}
      ${sharedButton(r)}
      <button type="button" class="sg-del" data-del="${esc(r.id)}" title="Remove">×</button>
    </td>
  </tr>
  <tr class="sg-composer" id="log-${esc(r.id)}" hidden><td colspan="7">
    <input type="text" class="sg-l-via" placeholder="${esc(motionByKey(r.motion)?.viaLabel || 'Route in')}" value="${esc(r.via || '')}">
    <input type="text" class="sg-l-next" placeholder="What has to happen next" value="${esc(r.nextStep || '')}">
    <input type="text" class="sg-l-industry" list="sg-industries" placeholder="Industry"
           value="${esc(r.industry || '')}">
    <div class="sg-c-controls">
      <label>Location
        <select class="sg-l-loc">
          ${locationOptions(r.location)}
        </select>
      </label>
      <label>By <input type="date" class="sg-l-when" value="${r.nextStepAt ? new Date(r.nextStepAt).toISOString().slice(0, 10) : ''}"></label>
      <button type="button" class="cta-button sg-l-save" data-logsave="${esc(r.id)}">Save</button>
    </div>
    <textarea class="sg-l-note" rows="3" placeholder="Private note — never sent">${esc(r.note || '')}</textarea>
  </td></tr>`;
}

function leadRow(r) {
  const q = r.sequence;
  const done = q.sentCount >= q.maxSends;
  return `<tr class="sg-leadrow">
    <td>
      <select data-lead="${esc(r.id)}" class="sg-status-select sg-status-select--${esc(r.status)}">
        ${['to-contact', 'contacted', 'replied', 'dead'].map(v =>
          `<option value="${v}" ${v === r.status ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </td>
    <td>
      <div class="sg-org">${esc(r.company) || orgBlank()}</div>
      ${industryCell(r)}
      <div class="sg-links">
        ${r.linkedinUrl ? `<a href="${esc(r.linkedinUrl)}" target="_blank" rel="noopener">in</a>` : ''}
        ${r.companyUrl ? `<a href="${esc(r.companyUrl)}" target="_blank" rel="noopener">web</a>` : ''}
      </div>
    </td>
    <td>
      <div class="sg-contact__name">${esc(r.name) || '<span class="sg-unknown">no name</span>'}
        ${r.role ? `<span class="sg-fn">${esc(r.role)}</span>` : ''}</div>
      <div class="sg-who">${emailCell(r)}${r.unsubscribedAt ? ' <span class="sg-unsub">unsubscribed</span>' : ''}${r.clicked ? ' <span class="sg-clicked">clicked</span>' : ''}</div>
      ${motionChip(r)}
    </td>
    <td>${locationCell(r)}</td>
    <td class="sg-seq">
      <span class="sg-sent ${done ? 'sg-sent--done' : ''}">${q.sentCount}/${q.maxSends}</span>
      <div class="sg-note">every ${q.intervalDays}d</div>
    </td>
    <td class="sg-note ${q.stoppedReason || r.lastError ? 'sg-blocked' : ''}">
      ${esc(r.lastError ? `Failed: ${clip(r.lastError, 50)}` : nextSendLabel(q))}
    </td>
    <td class="sg-rowactions">
      <button type="button" class="sg-btn sg-btn--gen" data-generate="${esc(r.id)}">Generate</button>
      <button type="button" class="sg-btn" data-preview="${esc(r.id)}">Preview</button>
      <button type="button" class="sg-btn sg-btn--go" data-send="${esc(r.id)}"
              ${r.unsubscribedAt ? 'disabled title="They unsubscribed"' : ''}>Send</button>
      <button type="button" class="sg-del" data-del="${esc(r.id)}" title="Remove">×</button>
    </td>
  </tr>
  <tr class="sg-preview" id="preview-${esc(r.id)}" hidden><td colspan="7">
    <div class="sg-pv">
      <div class="sg-pv__warn"></div>
      <div class="sg-pv__to"></div>
      <div class="sg-pv__subject"></div>
      <div class="sg-pv__alts"></div>
      <div class="sg-pv__body"></div>
    </div>
  </td></tr>
  <tr class="sg-composer" id="compose-${esc(r.id)}" hidden><td colspan="7">
    <input type="text" class="sg-c-name" placeholder="First name — fills {{name}}" value="${esc(r.name || '')}">
    <textarea class="sg-c-context" rows="4" placeholder="The paragraph about THIS organisation — fills {{context}}.">${esc(r.orgContext || '')}</textarea>
    <input type="text" class="sg-c-subject" placeholder="Subject" value="${esc(q.subject)}">
    <textarea class="sg-c-body" rows="7" placeholder="Your message. {{name}}, {{company}}, {{context}} and {{link}} are filled in; an unsubscribe line is appended automatically.">${esc(q.body)}</textarea>
    <div class="sg-c-controls">
      <label>Every <input type="number" class="sg-c-interval" min="7" max="90" value="${q.intervalDays}"> days</label>
      <label>Stop after <input type="number" class="sg-c-max" min="1" max="6" value="${q.maxSends}"> emails</label>
      <label>Location
        <select class="sg-c-loc">
          ${locationOptions(r.location)}
        </select>
      </label>
      <label class="sg-c-toggle"><input type="checkbox" class="sg-c-enabled" ${q.enabled ? 'checked' : ''}> Auto follow-up</label>
      <button type="button" class="cta-button sg-c-save" data-save="${esc(r.id)}">Save</button>
    </div>
  </td></tr>`;
}

/**
 * What mail is configured, said before the compose box rather than after a
 * failed send.
 *
 * The sending domain is the headline: on a provider's shared domain
 * (…brevosend.com, …sendgrid.net) mail is filtered however good the rest of
 * the setup is, and that is invisible from the compose form.
 */
function mailBanner(m) {
  if (!m) return '';
  if (!m.configured) {
    return `<div class="sg-mailstate sg-mailstate--bad">
      No email provider is configured — nothing can send, including sign-in codes.
      Set BREVO_API_KEY on the server.</div>`;
  }
  const shared = /brevosend\.com|sendgrid\.net|sendinblue/i.test(m.senderDomain || '');
  const noSender = !m.sender;
  const cls = (shared || noSender) ? 'sg-mailstate--warn' : 'sg-mailstate--ok';
  const detail = noSender
    ? 'No sender address is set (EMAIL_FROM), so the provider picks one — usually on its own shared domain, which lands in spam.'
    : shared
      ? `Sending as <strong>${esc(m.sender)}</strong> on the provider's shared domain. Authenticate svargai.com and set EMAIL_FROM, or expect spam.`
      : `Sending as <strong>${esc(m.senderName)} &lt;${esc(m.sender)}&gt;</strong>${m.replyTo ? `, replies to ${esc(m.replyTo)}` : ''}.`;
  return `<div class="sg-mailstate ${cls}">${detail}</div>`;
}

// ── Motions ──────────────────────────────────────────────────────────────────

/** The lanes, or an empty list if the registry could not be fetched. */
function lanes() { return state.motions?.lanes || []; }

function motionsInLane(laneKey) {
  return (state.motions?.motions || []).filter(m => m.lane === laneKey);
}

/**
 * The industries the knowledge base actually covers.
 *
 * They already travel with the registry, as the industry field's suggestions —
 * so they are read from there rather than kept a second time in state, where
 * the copy and the form could disagree about what is grounded.
 */
function groundedIndustries() {
  for (const m of state.motions?.motions || []) {
    const f = (m.fields || []).find(x => x.key === 'industry');
    if (f?.suggestions?.length) return f.suggestions;
  }
  return [];
}

/** One datalist for the whole screen, not one per row. */
function renderIndustryDatalist() {
  const list = groundedIndustries();
  let el = document.getElementById('sg-industries');
  if (!el) {
    el = document.createElement('datalist');
    el.id = 'sg-industries';
    document.body.appendChild(el);
  }
  el.innerHTML = list.map(i => `<option value="${esc(i)}"></option>`).join('');
}

function motionByKey(key) {
  return (state.motions?.motions || []).find(m => m.key === key) || null;
}

function laneObj(key) {
  return lanes().find(l => l.key === key) || null;
}

/** The rows of one lane, after the kind filter. */
function laneRows(s, laneKey) {
  return visible(s.outreach).filter(r => (r.lane || 'broadcast') === laneKey);
}

/**
 * How the conversation started, as a tab strip.
 *
 * Three lanes rather than eleven tabs. The distinction that changes what you
 * actually do is not which of ten plays you picked, it is whether someone
 * vouched for you, whether they watched it work, or whether you arrived cold.
 * The count is on the tab because a lane with nothing in it is the useful
 * thing to notice — an empty Introduced lane is a strategy that is not running.
 */
function renderLaneStrip(s) {
  if (!lanes().length) return '';
  return `<div class="sg-lanes" role="tablist" aria-label="How the conversation started">
    ${lanes().map(l => {
      const n = laneRows(s, l.key).length;
      const on = l.key === state.lane;
      return `<button type="button" class="sg-lane ${on ? 'sg-lane--on' : ''}"
        data-lane="${esc(l.key)}" role="tab" aria-selected="${on}">
        ${esc(l.label)}<span class="sg-lane__n">${n}</span></button>`;
    }).join('')}
  </div>`;
}

/**
 * The plays in this lane, with the exact words to use.
 *
 * The ask is the part that is actually hard about most of these — "do you know
 * anyone who might buy Svarg?" and "who is responsible for AI adoption at
 * [company]?" are the same request and only one of them gets an answer. A
 * playbook that lists motions and omits the sentence is decoration, so the ask
 * is quoted here verbatim, at the point where a lead gets added.
 */
function renderPlays(laneKey) {
  const lane = laneObj(laneKey);
  const ms = motionsInLane(laneKey);
  if (!lane || !ms.length) return '';

  return `<p class="sg-lane__blurb">${esc(lane.blurb)}</p>
    <details class="sg-plays">
      <summary class="sg-plays__head">How to run the ${esc(lane.label.toLowerCase())} motions
        <span class="sg-plays__n">${ms.length}</span></summary>
      <div class="sg-plays__list">
        ${ms.map(m => `<div class="sg-play">
          <span class="sg-play__name">${esc(m.label)}</span>
          <p class="sg-play__sum">${esc(m.summary)}</p>
          ${m.ask ? `<blockquote class="sg-play__ask">${esc(m.ask)}</blockquote>` : ''}
          <p class="sg-play__note">${esc(m.note)}</p>
        </div>`).join('')}
      </div>
    </details>`;
}

/**
 * The ICP, shown only where an email is written.
 *
 * It exists to tell Generate which function it is writing for. On the lanes
 * that never send, it is guidance for a conversation nobody is templating, and
 * putting it above every form would push the actual work further down the page.
 */
function renderIcp() {
  return `<details class="sg-icp">
    <summary class="sg-icp__head">Who we sell to, and how each one is approached</summary>
    <div class="sg-icp__grid">
      <div>
        <span class="sg-icp__fn">Operations or administration manager</span>
        <p>The person the product is for. Their week is recurring coordination across
           tools that do not talk to each other. Lead with that load in their own
           words &mdash; never with AI.</p>
      </div>
      <div>
        <span class="sg-icp__fn">Owner</span>
        <p>At a small firm the owner is the operations manager, and the admin lands on
           them after hours. Same load, and they hold the budget.</p>
      </div>
      <div>
        <span class="sg-icp__fn">Centre or practice manager</span>
        <p>Runs one site and everything in it, usually with one assistant and a
           spreadsheet. Lead with what stops being missed, not with what they would
           have to adopt.</p>
      </div>
    </div>
    <p class="field-hint sg-icp__foot">Generate reads this. Set the designation and the
      email is written for that function — the same rules, applied every time rather
      than remembered.</p>
  </details>`;
}

/**
 * One input, built from the motion's own field definition.
 *
 * The id is derived from the field key, so addLead can read every field back
 * generically. A hand-written form plus a hand-written reader is exactly how
 * this screen once came to collect an organisation paragraph on every lead and
 * send none of them.
 */
function renderField(f) {
  const id = `sg-lead-${f.key}`;
  const title = f.hint ? ` title="${esc(f.hint)}"` : '';

  if (f.type === 'select') {
    // Starts empty, so it starts wearing the placeholder colour. wireOutreach
    // takes the class off as soon as something is chosen.
    return `<select id="${id}" class="sg-field-select sg-field-select--empty"${title} aria-label="${esc(f.label)}">
      <option value="">${esc(f.label)}</option>
      ${f.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
    </select>`;
  }

  const list = f.suggestions ? ` list="${id}-list"` : '';
  const datalist = f.suggestions
    ? `<datalist id="${id}-list">${f.suggestions.map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist>`
    : '';
  return `<input type="${esc(f.type)}" id="${id}" placeholder="${esc(f.label)}" autocomplete="off"${list}${title}>${datalist}`;
}

/**
 * The add form for the open lane.
 *
 * The motion picker is scoped to the lane, so a warm introduction cannot be
 * filed under Broadcast by a mis-click. Everything below it comes from that
 * motion's own field list: a cold email asks for a designation and a website
 * because those are what the writer reads, and a warm introduction to someone
 * you already know asks for a mobile number and how you know them, because
 * that is what you actually have. One shared form for eleven motions is how a
 * form becomes something people fill in with whatever gets past validation.
 */
function renderAddForm(laneKey) {
  const ms = motionsInLane(laneKey);
  if (!ms.length) return '';
  const first = ms.find(m => m.key === state.addMotion) || ms[0];

  /**
   * The fields come from the server. If they are missing, the API is running a
   * build that predates them.
   *
   * Without this the form renders as a lone dropdown and an Add button that
   * refuses everything — a mystery rather than a message. The frontend and the
   * API are separate deployments here, so one being ahead of the other is a
   * real state that happens for a few minutes after every release.
   */
  if (!first.fields?.length) {
    return `<p class="sg-hidden-note">The server has not sent the fields for
      <strong>${esc(first.label)}</strong> yet — it is still running an older build.
      Wait a moment and press Refresh; the form appears as soon as the API catches up.</p>`;
  }

  return `
    <div class="sg-addlead sg-addlead--wide">
      <select id="sg-lead-motion" class="sg-motion-select" aria-label="Motion">
        ${ms.map(m => `<option value="${esc(m.key)}" ${m.key === first.key ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
      </select>
      ${first.fields.map(renderField).join('\n      ')}
    </div>
    <div class="sg-addmail__actions">
      <button type="button" id="sg-lead-add" class="cta-button">Add</button>
      <span class="field-hint sg-addmail__hint" id="sg-add-hint">${esc(addHint(first))}</span>
    </div>
    <div id="sg-invite" class="sg-invite" ${state.invite ? '' : 'hidden'}>${
      state.invite ? renderInvite(state.invite.link, state.invite.lead) : ''}</div>`;
}

/**
 * The link, shown the moment the lead is added.
 *
 * On a warm introduction this is the whole point of adding them: you are not
 * filing a contact, you are getting something to paste into WhatsApp. Putting
 * it behind a board reload would make the slowest step the one thing you came
 * for.
 *
 * It is not a credential. It carries a ref that ties whatever they do back to
 * this lead, and they still sign in normally when they arrive — so a forwarded
 * message costs nothing worse than a slightly wrong attribution.
 */
function renderInvite(link, lead) {
  if (!link) return '';
  const digits = String(lead?.phone || '').replace(/[^0-9]/g, '');
  const wa = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(inviteMessage(link, lead))}`
    : '';
  const msg = inviteMessage(link, lead);
  const m = motionByKey(lead?.motion);

  // Email as well as WhatsApp, because who you reach and how differs by motion:
  // a friend gets a message on their phone, a training company gets an email
  // with a subject line.
  const mail = lead?.email && msg
    ? `mailto:${encodeURIComponent(lead.email)}`
      + `?subject=${encodeURIComponent(m?.messageSubject || 'SvargAI')}`
      + `&body=${encodeURIComponent(msg)}`
    : '';

  return `
    <p class="sg-invite__head">Send this to ${esc(lead?.name || 'them')}${
      m ? ` · ${esc(m.label)}` : ''}</p>
    ${msg
      ? `<textarea class="sg-invite__msg" id="sg-invite-msg" rows="13">${esc(msg)}</textarea>`
      : `<p class="sg-invite__note">There is no message template for ${esc(m?.label || 'this motion')}
          yet, so only the link is below. Write one and it can live with the motion like the
          others.</p>`}
    <div class="sg-invite__row">
      ${msg ? '<button type="button" class="sg-btn sg-btn--go" id="sg-invite-copymsg">Copy message</button>' : ''}
      ${wa ? `<a class="sg-btn" href="${esc(wa)}" target="_blank" rel="noopener">Open WhatsApp</a>` : ''}
      ${mail ? `<a class="sg-btn" href="${esc(mail)}">Open email</a>` : ''}
      <input type="text" class="sg-invite__link" id="sg-invite-link" readonly value="${esc(link)}">
      <button type="button" class="sg-btn" id="sg-invite-copy">Copy link only</button>
    </div>
    <p class="sg-invite__note">The link in the message is this lead's own — anyone who signs up
      through it is attributed to them, which is how they leave Outreach. Sending a plain
      www.svargai.com instead loses that. It is not a password: they still sign in normally.</p>`;
}

/**
 * The message for THIS motion, filled in for this person.
 *
 * The pitch is not one pitch. A warm introduction asks a friend for a favour;
 * a training partner is asked whether Svarg belongs in a demonstration they
 * already give, and the argument there is about their clients' problem rather
 * than yours. Sending one to the other reads as a mail-merge, which is the
 * precise impression these motions exist to avoid.
 *
 * The templates live on the motion in gtmMotions.js, beside its play and its
 * fields, and arrive with the registry.
 *
 * ── The link replaces the bare domain, deliberately ─────────────────────────
 *
 * Where a draft names www.svargai.com, the token puts this lead's tracked link.
 * The plain address would lose the ref, and the ref is the only thing that
 * connects someone who signs up back to the conversation that produced them.
 */
function inviteMessage(link, lead) {
  const m = motionByKey(lead?.motion);
  if (!m?.message?.length) return '';
  return m.message.join('\n')
    .replace(/\{\{\s*name\s*\}\}/gi, lead?.name || 'there')
    .replace(/\{\{\s*company\s*\}\}/gi, lead?.company || 'your team')
    .replace(/\{\{\s*link\s*\}\}/gi, link);
}

function addHint(m) {
  if (m.emails) {
    return 'Then press Generate on the row — the agent reads their website and writes the email for their function.';
  }
  // Svarg sends nothing here, so say what actually happens: you get a link and
  // you send it. A hint that only says "nothing is sent" leaves the operator
  // wondering what adding the person achieved.
  return m.sharesLink
    ? 'Svarg sends nothing on this lane. Adding them gives you a link to send yourself — anyone who signs up through it is attributed to this lead.'
    : 'Nothing is sent on this lane. Add them, then record what happens next on the row.';
}

/**
 * The shared cold-email template, shown only on the lane that sends.
 */
function renderTemplate() {
  return `<details class="sg-template">
      <summary>Shared template — used for every new cold lead</summary>
      <input type="text" id="sg-tpl-subject" placeholder="Subject line" autocomplete="off"
             value="${esc(state.template?.subject || '')}">
      <textarea id="sg-tpl-body" rows="14">${esc(state.template?.body || '')}</textarea>
      <div class="sg-addmail__actions">
        <span class="field-hint sg-addmail__hint">
          Tokens: <code>{{name}}</code> <code>{{company}}</code> <code>{{context}}</code>
          <code>{{link}}</code> — the link is tracked per lead, so a visit it produces
          shows up against that person in Discovery instead of as an anonymous guest.
          An unsubscribe line is appended automatically.
        </span>
        <button type="button" id="sg-tpl-save" class="btn-secondary">Save template</button>
      </div>
    </details>
    <p class="field-hint"><strong>At most 6 emails to one contact, one a week</strong> — enforced on the server, so Send cannot get round it. Leads leave this stage on signup, reply, or unsubscribe.</p>`;
}

function renderOutreach(s) {
  return renderOutreachBody(s);
}

function renderOutreachBody(s) {
  if (!state.motions) {
    // The registry is what defines the lanes; without it, show the rows rather
    // than an empty screen, and say why the lanes are missing.
    return `<p class="sg-hidden-note">Could not load the go-to-market motions, so the lanes
      are unavailable. Every lead is listed below.</p>`
      + table(['Status', 'Organisation', 'Contact', 'Location', 'Route in', 'Next', ''], visible(s.outreach), outreachRow);
  }

  const lane = state.lane;
  const sendsHere = motionsInLane(lane).some(m => m.emails);

  return renderLaneStrip(s)
    + renderPlays(lane)
    + (sendsHere ? mailBanner(state.mail) + renderIcp() : '')
    + renderAddForm(lane)
    + (sendsHere ? renderTemplate() : '')
    + renderLaneTables(s, lane);
}

const OUTREACH_COLS = ['Status', 'Organisation', 'Contact', 'Location', 'Route in', 'Next', ''];

/**
 * One table per motion, not one table per lane.
 *
 * A lane groups motions that share a shape — someone vouches for you — but the
 * work inside it does not pool. A warm introduction to a friend and a pitch to
 * an AI training company are different conversations, sent with different
 * messages, and worked on different days; stacked in one list they read as a
 * single queue and you lose the ability to see that one of them has stalled
 * while the other is moving.
 *
 * Only motions with rows get a section. An empty heading for each of the eleven
 * motions would be a page of headings, and the lane tab already carries the
 * count for the lane as a whole.
 */
function renderLaneTables(s, laneKey) {
  const rows = laneRows(s, laneKey);
  if (!rows.length) return '<div class="sg-empty">Nothing at this stage right now.</div>';

  const ms = motionsInLane(laneKey);
  const seen = new Set();
  let out = '';

  for (const m of ms) {
    const mine = rows.filter(r => r.motion === m.key);
    if (!mine.length) continue;
    mine.forEach(r => seen.add(r.id));
    out += `<div class="sg-group">
      <h3 class="sg-group__head">${esc(m.label)}<span class="sg-group__n">${mine.length}</span></h3>
      ${table(OUTREACH_COLS, mine, outreachRow)}
    </div>`;
  }

  // A lead filed under a motion this lane no longer lists would otherwise
  // vanish from a screen that just told you the lane holds it.
  const orphans = rows.filter(r => !seen.has(r.id));
  if (orphans.length) {
    out += `<div class="sg-group">
      <h3 class="sg-group__head">Other<span class="sg-group__n">${orphans.length}</span></h3>
      <p class="field-hint">Filed under a motion that is no longer listed in this lane.</p>
      ${table(OUTREACH_COLS, orphans, outreachRow)}
    </div>`;
  }
  return out;
}

/**
 * Who opened the site, above who used it.
 *
 * Discovery has always meant "generated a blueprint" — real intent, and rare.
 * Everyone who opened the link, read the page and left used to leave no trace
 * at all, which made an empty Discovery column ambiguous in the worst possible
 * way: nobody came, or everybody came and bounced. Those call for opposite
 * fixes — one is a delivery problem, the other a copy problem — and the board
 * could not tell you which you had.
 */
function renderVisits(s) {
  const t = s.visitTotals || { people: 0, addresses: 0, sessions: 0, generated: 0, fromOutreach: 0 };
  const rows = s.visits || [];

  const summary = `<div class="sg-kpi">
    <div class="sg-kpi__item" title="Browsers, not people: the same person on a phone and a laptop is two. The address count beside it says how many places they came from."><span class="sg-kpi__n">${t.people}</span> opened the site</div>
    <div class="sg-kpi__item" title="Distinct network blocks. Two browsers from one block are usually one office, sometimes one person."><span class="sg-kpi__n">${t.addresses ?? t.people}</span> addresses</div>
    <div class="sg-kpi__item"><span class="sg-kpi__n">${t.sessions}</span> sessions</div>
    <div class="sg-kpi__item"><span class="sg-kpi__n">${t.fromOutreach}</span> from your outreach</div>
    <div class="sg-kpi__item"><span class="sg-kpi__n">${t.generated}</span> went on to generate</div>
  </div>`;

  if (!rows.length) {
    return summary + `<p class="field-hint">No visits recorded yet. Visits are counted from the
      moment this shipped — anything before that was never captured, and a zero here does not
      mean nobody came in the past.</p>`;
  }

  /**
   * Two audiences, two tables.
   *
   * Someone who arrived on a link you sent is a name you already know, moving
   * down the funnel. Someone who arrived from a LinkedIn post or a search
   * result is a stranger, and the interesting fact about them is which channel
   * produced them. Pooled into one list the second group buries the first, and
   * neither number means much on its own — "12 visits" answers no question,
   * while "3 of the people I messaged came, and 9 strangers found us" answers
   * two.
   */
  return summary
    + visitGroup('From your outreach', rows.filter(r => r.fromLead),
        'They opened a link you sent, so the row names who it went to.')
    + visitGroup('Found you on their own', rows.filter(r => !r.fromLead),
        'No tracked link — LinkedIn, a search result, or a link someone forwarded on. '
        + 'The referrer is the only clue to which.');
}

function visitGroup(heading, rows, blurb) {
  return `<div class="sg-group">
    <h3 class="sg-group__head">${esc(heading)}<span class="sg-group__n">${rows.length}</span></h3>
    <p class="field-hint">${esc(blurb)}</p>
    ${rows.length ? visitTable(rows) : '<div class="sg-empty">Nobody yet.</div>'}
  </div>`;
}

function visitTable(rows) {
  return table(
    ['Sessions', 'Last seen', 'IP block', 'Country', 'Came from', 'Referrer', 'Then what'],
    rows,
    r => `<tr>
      <td><span class="sg-visits ${r.visits > 1 ? 'sg-visits--repeat' : ''}">${r.visits}×</span></td>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-note">${r.ips.length
        ? `<span class="sg-ip" title="The network block, not the machine — the last octet is never stored">${esc(r.ips.join(', '))}</span>`
          + (r.sameAddress
            ? `<div class="sg-same" title="Another browser came from this block — the same person on another device, or a colleague. Counted separately above, because a block can hold a whole office.">same address as ${r.sameAddress} other${r.sameAddress === 1 ? '' : 's'}</div>`
            : '')
        : '<span class="sg-unknown" title="The request arrived without one — never the same as another blank">not recorded</span>'}</td>
      <td>${countryCell(r.countries[0] || '')}</td>
      <td>${r.fromLead
        ? `<span class="sg-todo">${esc(r.fromLead.contact)}</span>${r.fromLead.company
            ? `<div class="sg-note">${esc(r.fromLead.company)}</div>` : ''}`
        : '<span class="sg-unknown" title="No tracked link — they found the site some other way">direct</span>'}</td>
      <td class="sg-note">${esc(clip(r.referers[0] || '', 28)) || '<span class="sg-unknown">—</span>'}</td>
      <td>${r.generated
        ? '<span class="sg-pill">generated a blueprint</span>'
        : '<span class="sg-unknown">looked and left</span>'}</td>
    </tr>`);
}

function renderDiscovery(s) {
  return renderVisits(s) + `
    <h3 class="sg-group__head sg-group__head--spaced">Generated a blueprint
      <span class="sg-group__n">${visible(s.discovery).length}</span></h3>` + table(
    ['Visits', 'Last seen', 'Guest', 'Organisation', 'Country', 'Objective', 'IP', 'What happened'],
    visible(s.discovery),
    r => `<tr>
      <td><span class="sg-visits ${r.visits > 1 ? 'sg-visits--repeat' : ''}">${r.visits}×</span></td>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${esc(r.who)}${r.fromLead
        ? `<div class="sg-fromlead">from your email to ${esc(r.fromLead.email)}</div>` : ''}</td>
      <td>${esc(r.org) || orgBlank()}</td>
      <td>${r.countries.length ? countryCell(r.countries.join(', ')) : countryCell('')}</td>
      <td>${esc(clip(r.objective, 80))}</td>
      <td class="sg-who ${r.ips.length ? '' : 'sg-unknown'}">${esc(r.ipLabel)}</td>
      <td class="sg-note">${esc(r.note)}</td>
    </tr>`);
}

function renderConversion(s) {
  return table(
    ['Age', 'Email', 'Organisation', 'Country', 'Objective', 'Blueprints', 'Where they stopped'],
    visible(s.conversion),
    r => `<tr>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${emailCell(r)}${kindTag(r)}</td>
      <td>${esc(r.org) || orgBlank()}</td>
      <td>${countryCell(r.country)}</td>
      <td>${esc(clip(r.objective, 60))}</td>
      <td>${r.blueprints}</td>
      <td class="sg-note ${r.blocker ? 'sg-blocked' : ''}">${esc(r.note)}</td>
    </tr>`);
}

function renderOnboarding(s) {
  return table(
    ['Last query', 'Email', 'Organisation', 'Country', 'Objective', 'Live apps', 'Usage'],
    visible(s.onboarding),
    r => `<tr>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${emailCell(r)}</td>
      <td>${esc(r.org) || orgBlank()}</td>
      <td>${countryCell(r.country)}</td>
      <td>${esc(clip(r.objective, 60))}</td>
      <td>${r.liveCount}</td>
      <td class="sg-note ${r.degraded || r.quiet ? 'sg-blocked' : ''}">${esc(r.note)}</td>
    </tr>`);
}

function renderSales(s) {
  return table(
    ['Since', 'Email', 'Organisation', 'Country', 'Plan', 'Blueprints', 'Spend'],
    visible(s.sales),
    r => `<tr>
      <td class="sg-age">${age(r.at)}</td>
      <td class="sg-who">${emailCell(r)}</td>
      <td>${esc(r.org) || orgBlank()}</td>
      <td>${countryCell(r.country)}</td>
      <td><span class="sg-pill sg-pill--paid">${esc(r.note)}</span></td>
      <td>${r.blueprints}</td>
      <td>$${(r.spendUsd || 0).toFixed(4)}</td>
    </tr>`);
}

const RENDERERS = {
  outreach: renderOutreach, discovery: renderDiscovery, conversion: renderConversion,
  onboarding: renderOnboarding, sales: renderSales,
};

function renderStage() {
  const tab = TABS.find(t => t.key === state.tab);
  const el = document.getElementById('sg-stage');
  const hidden = hiddenCount(state.signals[state.tab]);
  el.innerHTML = `<div class="admin-panel sg-section">
    <div class="panel-header"><h2>${esc(tab.label)}</h2></div>
    <p class="field-hint">${esc(tab.hint)}</p>
    ${hidden ? `<p class="sg-hidden-note">${hidden} row${hidden === 1 ? '' : 's'} hidden by the filter above.</p>` : ''}
    ${RENDERERS[state.tab](state.signals)}
  </div>`;
  // Visibility is not decided here. Setting an inline display on every
  // render overrode setView's [hidden], which is why the funnel stayed on
  // screen whichever tab was open.

  if (state.tab === 'outreach') wireOutreach();
  wireKindSelects();
}

// ── Outreach actions ─────────────────────────────────────────────────────────

/**
 * Push everything in one lead's composer to the server.
 *
 * One function for all three buttons — Save, Preview and Send now — because
 * they each used to build their own payload and Send now's listed only
 * subject and body. An organisation paragraph typed into the composer was
 * therefore discarded on every send, and Preview, which reads back from the
 * database, faithfully showed the empty value that had just been saved over
 * the top of it. Two buttons disagreeing about which fields exist is the same
 * failure as a guard living on one code path.
 *
 * Returns false when the composer is closed, so callers can tell "nothing to
 * save" from "saved".
 */
async function saveComposer(id) {
  const box = document.getElementById(`compose-${id}`);
  if (!box) return false;
  await api(`/leads/${id}/sequence`, {
    method: 'PUT',
    body: JSON.stringify({
      name:         box.querySelector('.sg-c-name').value,
      orgContext:   box.querySelector('.sg-c-context').value,
      subject:      box.querySelector('.sg-c-subject').value,
      body:         box.querySelector('.sg-c-body').value,
      intervalDays: Number(box.querySelector('.sg-c-interval').value),
      maxSends:     Number(box.querySelector('.sg-c-max').value),
      enabled:      box.querySelector('.sg-c-enabled').checked,
    }),
  });
  // Location is a property of the lead, not of the sequence, so it goes to the
  // lead endpoint. Two calls rather than widening setSequence to write fields
  // that have nothing to do with sending.
  const loc = box.querySelector('.sg-c-loc');
  if (loc) await api(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ location: loc.value }) });
  return true;
}

function wireOutreach() {
  // Switching lane is a view change — no reload, because the board already
  // holds every lead and a round trip would blank the screen to show rows it
  // is already holding.
  document.querySelectorAll('[data-lane]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.lane = btn.dataset.lane;
      state.addMotion = null;   // the picker is scoped to the lane
      state.invite = null;      // a link belongs to one person, not to a screen
      renderStage();
    });
  });

  // Changing motion changes which fields exist, so the form is re-rendered
  // rather than adjusted in place — the fields come from the motion, and there
  // is no set of tweaks that turns a cold-email form into a warm-intro one.
  const motionSel = document.getElementById('sg-lead-motion');
  if (motionSel) motionSel.addEventListener('change', () => {
    state.addMotion = motionSel.value;
    state.invite = null;
    renderStage();
  });

  const addBtn = document.getElementById('sg-lead-add');
  if (addBtn) addBtn.addEventListener('click', () => addLead());
  // Enter on any field in the add form adds the row. It has never sent
  // anything, and cannot write anything either — Generate is a separate press.
  document.querySelectorAll('.sg-addlead input').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') addLead(); });
  });
  // A select with nothing chosen should look like an empty field, not a filled
  // one — the label in the first slot is a prompt, not an answer.
  document.querySelectorAll('.sg-field-select').forEach(sel => {
    sel.addEventListener('change', () => {
      sel.classList.toggle('sg-field-select--empty', !sel.value);
    });
  });

  wireInvite();
  wireGenerate();

  /**
   * You sent it. The board could not have known.
   *
   * Sets status to contacted, which is what the stage actually means here —
   * the server stamps lastContactedAt on that transition, so "when did I send
   * this" is answerable afterwards rather than being a thing you remember.
   */
  document.querySelectorAll('[data-shared]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api(`/leads/${btn.dataset.shared}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'contacted' }),
        });
        await load(state.tab);
      } catch (err) {
        banner(`Could not mark as shared: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  // Get the link back later, without re-adding the person.
  document.querySelectorAll('[data-copylink]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(btn.dataset.copylink);
        btn.textContent = 'Copied';
      } catch {
        // A clipboard the browser refuses is not a copy. Say the link instead
        // of claiming a copy that did not happen.
        banner(btn.dataset.copylink, false);
        btn.textContent = 'Shown above';
      }
      setTimeout(() => { btn.textContent = original; }, 2500);
    });
  });

  // ── The non-email lanes: record the route in and what happens next ────────
  document.querySelectorAll('[data-log]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(`log-${btn.dataset.log}`);
      row.hidden = !row.hidden;
    });
  });

  document.querySelectorAll('[data-logsave]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.logsave;
      const box = document.getElementById(`log-${id}`);
      btn.disabled = true;
      try {
        await api(`/leads/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            via:      box.querySelector('.sg-l-via').value.trim(),
            nextStep: box.querySelector('.sg-l-next').value.trim(),
            // An empty date clears the deadline rather than leaving a stale one.
            nextStepAt: box.querySelector('.sg-l-when').value || null,
            location: box.querySelector('.sg-l-loc').value,
            industry: box.querySelector('.sg-l-industry').value.trim(),
            note:     box.querySelector('.sg-l-note').value.trim(),
          }),
        });
        banner('Saved.', false);
        await load(state.tab);
      } catch (err) {
        banner(`Could not save: ${err.message}`);
      } finally { btn.disabled = false; }
    });
  });

  document.querySelectorAll('.sg-status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/leads/${sel.dataset.lead}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
        await load(state.tab);
      } catch (err) { banner(`Could not update: ${err.message}`); }
    });
  });

  document.querySelectorAll('.sg-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this lead?')) return;
      try {
        await api(`/leads/${btn.dataset.del}`, { method: 'DELETE' });
        await load(state.tab);
      } catch (err) { banner(`Could not remove: ${err.message}`); }
    });
  });

  document.querySelectorAll('[data-compose]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(`compose-${btn.dataset.compose}`);
      row.hidden = !row.hidden;
    });
  });

  const tplSave = document.getElementById('sg-tpl-save');
  if (tplSave) tplSave.addEventListener('click', async () => {
    tplSave.disabled = true;
    try {
      const { template } = await api('/template', {
        method: 'PUT',
        body: JSON.stringify({
          subject: document.getElementById('sg-tpl-subject').value,
          body:    document.getElementById('sg-tpl-body').value,
        }),
      });
      state.template = template;
      banner('Template saved. New leads will start from it.', false);
    } catch (err) {
      banner(`Could not save the template: ${err.message}`);
    } finally { tplSave.disabled = false; }
  });

  document.querySelectorAll('[data-preview]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        // Save first. Preview reads back from the database, so without this it
        // shows the stored value rather than what is on screen — which is how
        // an organisation paragraph that had been typed but not saved looked
        // exactly like one that had never been written.
        await saveComposer(btn.dataset.preview);
        const p = await api(`/leads/${btn.dataset.preview}/preview`);
        // Shown exactly as it will arrive — the same fill() the real send uses,
        // so an unreplaced token is visible here rather than in an inbox.
        const box = document.getElementById(`preview-${btn.dataset.preview}`);
        box.hidden = false;
        box.querySelector('.sg-pv__to').textContent = `To: ${p.to}`;
        box.querySelector('.sg-pv__subject').textContent = p.subject;
        box.querySelector('.sg-pv__body').textContent = p.body;
        renderAlternates(box, btn.dataset.preview, p.alternates || []);
        // Both can be true. Preview is the last look before Send, so it shows
        // everything wrong rather than only the first thing.
        box.querySelector('.sg-pv__warn').textContent = [
          p.unbackedClaim || '',
          p.missingContext ? 'No organisation paragraph written — this email is entirely generic.' : '',
        ].filter(Boolean).join(' ');
      } catch (err) {
        banner(`Could not preview: ${err.message}`);
      } finally { btn.disabled = false; }
    });
  });

  document.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.save;
      const box = document.getElementById(`compose-${id}`);
      btn.disabled = true;
      try {
        await api(`/leads/${id}/sequence`, {
          method: 'PUT',
          body: JSON.stringify({
            name:         box.querySelector('.sg-c-name').value,
            orgContext:   box.querySelector('.sg-c-context').value,
            subject:      box.querySelector('.sg-c-subject').value,
            body:         box.querySelector('.sg-c-body').value,
            intervalDays: Number(box.querySelector('.sg-c-interval').value),
            maxSends:     Number(box.querySelector('.sg-c-max').value),
            enabled:      box.querySelector('.sg-c-enabled').checked,
          }),
        });
        banner('Saved.', false);
        await load('outreach');
      } catch (err) {
        banner(`Could not save: ${err.message}`);
      } finally { btn.disabled = false; }
    });
  });

  document.querySelectorAll('[data-send]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.send;
      const box = document.getElementById(`compose-${id}`);
      // Save whatever is on screen first, so Send never posts a stale draft.
      btn.disabled = true;
      try {
        await saveComposer(id);
        const r = await api(`/leads/${id}/send`, { method: 'POST', body: JSON.stringify({}) });
        // A refusal comes back 200 with sent:false — it is the guard working,
        // not an error, and the reason is the useful part.
        banner(r.sent ? `Sent (${r.sentCount} of the sequence).` : `Not sent — ${r.reason}`, !r.sent);
        await load('outreach');
      } catch (err) {
        banner(`Could not send: ${err.message}`);
      } finally { btn.disabled = false; }
    });
  });
}

/**
 * Refuse, and point at the box that caused it.
 *
 * A banner alone told the operator something was wrong but not which of five
 * fields to look at, which on a long form is barely better than silence.
 */
function complain(fieldId, message) {
  banner(message);
  const el = document.getElementById(fieldId);
  if (el) {
    el.classList.add('sg-invalid');
    el.focus();
    el.addEventListener('input', () => el.classList.remove('sg-invalid'), { once: true });
  }
}

/**
 * Add whoever is in the form, reading exactly the fields this motion declared.
 *
 * The ids come from renderField, so the form and the reader cannot disagree
 * about which fields exist. That disagreement is not hypothetical: this screen
 * previously collected an organisation paragraph on every lead and dropped it
 * on the way to the server, because two places listed the fields by hand.
 */
async function addLead() {
  const motion = document.getElementById('sg-lead-motion')?.value || '';
  const m = motionByKey(motion);
  if (!m) return banner('No motion is selected.');

  const payload = { motion };
  for (const f of m.fields || []) {
    const v = (document.getElementById(`sg-lead-${f.key}`)?.value || '').trim();
    if (f.required && !v) return complain(`sg-lead-${f.key}`, `${f.label} is required.`);
    if (v) payload[f.key] = v;
  }

  const btns = [document.getElementById('sg-lead-add')];
  btns.forEach(b => { b.disabled = true; });
  try {
    const res = await api('/leads', { method: 'POST', body: JSON.stringify(payload) });
    const who = payload.name || payload.email || payload.phone || 'them';

    /**
     * On a motion you send yourself, the link IS the result — so it goes on
     * screen rather than being announced. A banner reading "a link was
     * generated" would mean going to look for it.
     *
     * Held in state rather than written straight into the box, because the
     * board reload below re-renders this whole panel and would otherwise wipe
     * the one thing the operator is here to copy.
     */
    state.invite = res.inviteLink ? { link: res.inviteLink, lead: res.lead } : null;
    if (!res.inviteLink) {
      banner(`Added ${who}. Press Generate on their row to write the email.`, false);
    }

    // The new row appears in the table, and the invite survives it.
    await load('outreach');
    document.getElementById('sg-invite')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    banner(`Could not save the lead: ${err.message}`);
  } finally {
    btns.forEach(b => { if (b) b.disabled = false; });
  }
}

/**
 * Copy, with the button reporting what actually happened.
 *
 * Clipboard access can be refused outright by the browser. Saying "Copied"
 * regardless would send someone to WhatsApp to paste an empty clipboard, so a
 * refusal selects the text and says to press Ctrl+C instead.
 */
function wireInvite() {
  const pairs = [
    ['sg-invite-copymsg', 'sg-invite-msg', 'Copy message'],
    ['sg-invite-copy',    'sg-invite-link', 'Copy link only'],
  ];
  for (const [btnId, fieldId, label] of pairs) {
    const btn = document.getElementById(btnId);
    const field = document.getElementById(fieldId);
    if (!btn || !field) continue;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(field.value);
        btn.textContent = 'Copied';
      } catch {
        field.select();
        btn.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => { btn.textContent = label; }, 2500);
    });
  }
}

// ── Ask ──────────────────────────────────────────────────────────────────────

/**
 * The transcript, kept in memory only.
 *
 * Not persisted: the funnel is rebuilt on the server for every question, so a
 * conversation restored tomorrow would be reasoning aloud about rows that have
 * since moved. A short session that starts fresh is the honest shape.
 */
let noleTurns = [];

const NOLE_GREETING =
  'I can see all five stages — who is where, how long they have been there, and '
  + 'where each one stopped. Ask me who to contact today, or about any row.';

function noleBubble(role, text, extraClass = '') {
  const div = document.createElement('div');
  div.className = `nl-msg nl-msg--${role} ${extraClass}`.trim();
  const body = document.createElement('div');
  body.className = 'nl-msg__body';
  body.textContent = text;   // textContent, not innerHTML — this is model output
  div.appendChild(body);
  return div;
}

function noleScroll() {
  const log = document.getElementById('nl-log');
  log.scrollTop = log.scrollHeight;
}

function renderNole() {
  const log = document.getElementById('nl-log');
  log.innerHTML = '';
  log.appendChild(noleBubble('bot', NOLE_GREETING));
  for (const t of noleTurns) log.appendChild(noleBubble(t.role, t.text));
  noleScroll();
}

async function handleAsk(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('nl-input');
  const send  = document.getElementById('nl-send');
  const log   = document.getElementById('nl-log');
  const question = input.value.trim();
  if (!question) return;

  const history = noleTurns.slice();
  noleTurns.push({ role: 'user', text: question });
  log.appendChild(noleBubble('user', question));
  input.value = '';
  input.style.height = 'auto';
  send.disabled = true;

  const pending = noleBubble('bot', 'Reading the funnel…', 'nl-msg--pending');
  log.appendChild(pending);
  noleScroll();

  try {
    const { answer } = await api('/ask', { method: 'POST', body: JSON.stringify({ question, history }) });
    pending.remove();
    noleTurns.push({ role: 'bot', text: answer });
    log.appendChild(noleBubble('bot', answer));
  } catch (err) {
    pending.remove();
    // Left out of noleTurns on purpose — replaying a failure as context would
    // have Nole apologising for it on every later turn.
    log.appendChild(noleBubble('bot', `I could not answer that: ${err.message}`, 'nl-msg--error'));
  } finally {
    send.disabled = false;
    noleScroll();
    input.focus();
  }
}

// ── Loading ──────────────────────────────────────────────────────────────────

async function load(keepTab) {
  document.getElementById('sg-loading').hidden = state.view !== 'funnel';
  document.getElementById('sg-stage').hidden = true;

  try {
    const [{ signals }, mail, tpl, motions] = await Promise.all([
      api(''),
      // Never fatal: a funnel you can read is worth more than a banner about
      // mail configuration, so this failing must not blank the screen.
      api('/mail-status').catch(() => null),
      api('/template').catch(() => null),
      // Static, so it is fetched once and kept.
      state.motions ? Promise.resolve(null) : api('/motions').catch(() => null),
    ]);
    state.signals = signals;
    state.mail = mail?.mail || null;
    state.template = tpl?.template || state.template;
    if (motions) state.motions = motions;
    renderIndustryDatalist();
    if (keepTab) state.tab = keepTab;
    renderKindFilter();
    renderTabs();
    renderStage();
    // Re-applied after every load: the renderers above rebuild the funnel
    // panels, and only setView knows whether this tab is showing them.
    setView(state.view);
    document.getElementById('sg-generated').textContent =
      `Read at ${new Date(signals.generatedAt).toLocaleTimeString()}`;
  } catch (err) {
    banner(`Could not load the funnel: ${err.message}`);
  } finally {
    document.getElementById('sg-loading').hidden = true;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/sales.html');
    window.location.href = '/admin/login.html';
    return;
  }

  document.getElementById('nl-form').addEventListener('submit', handleAsk);

  const nlInput = document.getElementById('nl-input');
  nlInput.addEventListener('keydown', (e) => {
    // Enter sends, Shift+Enter starts a new line — the convention every other
    // chat box on the site follows.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  });
  // Grow with the message rather than scrolling a one-line box.
  nlInput.addEventListener('input', () => {
    nlInput.style.height = 'auto';
    nlInput.style.height = `${Math.min(nlInput.scrollHeight, 110)}px`;
  });

  const nlPanel = document.getElementById('nl-panel');
  const nlToggle = document.getElementById('nl-toggle');
  nlToggle.addEventListener('click', () => {
    // Minimised by default. It was 520px of empty box between the table and
    // the accounts roll-up, on a screen whose job is to be read quickly.
    const open = nlPanel.classList.toggle('nl-panel--open');
    nlPanel.classList.toggle('nl-panel--min', !open);
    nlToggle.textContent = open ? 'Close' : 'Open';
    nlToggle.setAttribute('aria-expanded', String(open));
    if (open) { noleScroll(); document.getElementById('nl-input').focus(); }
  });

  document.getElementById('nl-clear').addEventListener('click', () => {
    noleTurns = [];
    renderNole();
  });

  wireAccountControls();
  document.getElementById('sg-refresh-btn').addEventListener('click', () => load(state.tab));

  renderNole();
  load();
});

/**
 * The classification, and a way to correct it.
 *
 * Shown on every account row rather than only the odd ones, because a guess
 * the operator cannot see is a guess they cannot disagree with — and the
 * heuristic is definitely wrong about some addresses. "guessed" is stated
 * explicitly so a wrong one is obviously a guess rather than a fact.
 */
function kindTag(r) {
  if (!r.kind) return '';
  const title = esc(r.why || '');
  return `<div class="sg-kindtag">
    <select class="sg-kind-select" data-account="${esc(r.id)}" title="${title}">
      ${['real', 'internal', 'test'].map(k =>
        `<option value="${k}" ${k === r.kind ? 'selected' : ''}>${KIND_LABELS[k]}</option>`).join('')}
      <option value="" ${r.inferred ? '' : 'selected'}>— infer —</option>
    </select>
    ${r.inferred ? '<span class="sg-guessed" title="' + title + '">guessed</span>' : ''}
    ${signalTags(r)}
  </div>`;
}

/**
 * Why this row may not deserve the attention it is asking for.
 *
 * The board reports what the records contain — "approved an opportunity",
 * "application built" — and both were true of two throwaway accounts that
 * signed up, did exactly one thing, and never came back. True, and
 * misleading, because nothing said who they were.
 *
 * Nothing is hidden or filtered. The row still appears and still says what
 * happened; it just also says what is known about the person.
 */
function signalTags(r) {
  if (!r.signals || !r.signals.length) return '';
  return r.signals.map(sig =>
    `<span class="sg-signal sg-signal--${esc(sig.tone)}" title="${esc(SIGNAL_WHY[sig.key] || '')}">${esc(sig.label)}</span>`
  ).join('');
}

const SIGNAL_WHY = {
  'throwaway': 'The address is at a temporary mail service. Nobody reads it after the visit.',
  'never-returned': 'Last seen in the same minute they signed up. They have not been back.',
};

/** Wired after every stage render, since the rows are rebuilt each time. */
function wireKindSelects() {
  document.querySelectorAll('.sg-kind-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/accounts/${sel.dataset.account}/kind`, {
          method: 'PATCH', body: JSON.stringify({ kind: sel.value }),
        });
        await load(state.tab);
      } catch (err) { banner(`Could not reclassify: ${err.message}`); }
    });
  });
}

// ── Accounts ─────────────────────────────────────────────────────────────────

const STAGE_LABEL = { conversion: 'Signed up', onboarding: 'Live', sales: 'Paying' };

/**
 * The same people, rolled up by organisation.
 *
 * The funnel answers "who is where". A bottom-up motion asks something else:
 * which companies have somebody actually using this, and has anyone with
 * budget there been approached. One person generating four blueprints is a
 * reason to go find their VP — and that is invisible in a list sorted by
 * person, which is what every other view on this screen is.
 */
function renderAccounts() {
  const list = state.signals.accounts || [];
  const el = document.getElementById('sg-accounts');
  if (!list.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="admin-panel sg-section">
    <div class="panel-header"><h2>Accounts <span class="sg-section__count">· ${list.length}</span></h2>
      <div class="sg-section__stage">Bottom-up — find the power user, then their decision-maker</div>
    </div>
    ${table(
      ['Organisation', 'Reached', 'Power users', 'Approached', 'Next action'],
      list,
      a => `<tr>
        <td><strong>${esc(a.org)}</strong>${a.dormant
          ? `<div class="sg-note">${a.dormant} signed up, no activity</div>` : ''}</td>
        <td><span class="sg-pill ${a.paid ? 'sg-pill--paid' : ''}">${esc(STAGE_LABEL[a.furthest] || a.furthest)}</span></td>
        <td>${a.powerUsers.length
          ? a.powerUsers.map(u => `<div class="sg-who">${esc(u.email)}
              <span class="sg-power">${u.blueprints}</span></div>`).join('')
          : '<span class="sg-unknown">none yet</span>'}</td>
        <td>${a.functionsContacted.length
          ? a.functionsContacted.map(f => `<span class="sg-fn">${esc(f)}</span>`).join(' ')
          : '<span class="sg-unknown">nobody</span>'}</td>
        <td class="sg-note ${a.powerUsers.length && !a.leads.length ? 'sg-todo' : ''}">${esc(a.nextAction)}</td>
      </tr>`)}
  </div>`;
}

/**
 * Have the agent write this lead's email.
 *
 * Reads their website when one was given, applies the ICP rule for their
 * designation, and writes the subject and the organisation paragraph onto the
 * lead. The operator's next two actions are Preview and Send — the draft is
 * saved server-side first, so it cannot be generated, admired, and then lost
 * to a reload.
 */
function wireGenerate() {
  document.querySelectorAll('[data-generate]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Writing…';
      try {
        const r = await api(`/leads/${btn.dataset.generate}/generate`, {
          method: 'POST', body: JSON.stringify({}),
        });
        // An unbacked story claim outranks the website note: one is about how
        // specific the email is, the other is about whether it is true.
        banner(r.unbackedClaim
          ? r.unbackedClaim
          : r.groundedInWebsite
            ? 'Written from their website. Preview it before sending.'
            : 'Written — but no website was read, so it stays general. Preview it before sending.',
          !!r.unbackedClaim || !r.groundedInWebsite);
        await load('outreach');
      } catch (err) {
        banner(`Could not write the email: ${err.message}`);
      } finally { btn.disabled = false; btn.textContent = original; }
    });
  });
}

/**
 * The other two subject lines, one click away.
 *
 * The paragraph is usually right and the subject is the part worth arguing
 * with, so swapping it must not cost a regeneration — that would throw away a
 * good paragraph to change six words. Each alternate takes a different angle
 * rather than rewording the first, so this is a real choice.
 */
function renderAlternates(box, leadId, alternates) {
  const wrap = box.querySelector('.sg-pv__alts');
  if (!alternates.length) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = `<span class="sg-pv__altlabel">Or use</span>` +
    alternates.map((a, i) => `<button type="button" class="sg-alt" data-alt="${i}">${esc(a)}</button>`).join('');

  wrap.querySelectorAll('.sg-alt').forEach((b, i) => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api(`/leads/${leadId}/sequence`, {
          method: 'PUT', body: JSON.stringify({ subject: alternates[i] }),
        });
        banner('Subject changed. The message is unchanged.', false);
        await load('outreach');
      } catch (err) { banner(`Could not change the subject: ${err.message}`); }
    });
  });
}

/**
 * Leads that became accounts — the only evidence outreach works at all.
 *
 * A dropdown rather than a banner because it grows: one converted lead is a
 * sentence, twenty is a wall across the top of the stage you are trying to
 * work. Collapsed it answers "is any of this working"; opened it answers
 * "what did it cost", which is the question that decides whether to keep going.
 *
 * "Attributed" is deliberately strict. A signup dated before the lead was added
 * means they found Svarg on their own and were entered into outreach
 * afterwards — real, but not something the email did. Counting those would
 * make the number flattering rather than useful.
 */
function renderConverted(converted) {
  if (!converted?.length) return '';

  const credited = converted.filter(c => c.attributed);
  const stageLabel = { conversion: 'Signed up', onboarding: 'Live', sales: 'Paying' };

  return `<details class="sg-conv">
    <summary class="sg-conv__head">
      <span class="sg-conv__n">${converted.length}</span>
      lead${converted.length === 1 ? '' : 's'} converted
      ${credited.length < converted.length
        ? `<span class="sg-conv__sub">${credited.length} attributable to a motion</span>` : ''}
    </summary>
    <table class="cl-table sg-conv__table">
      <thead><tr>
        <th>Contact</th><th>Organisation</th><th>Motion</th><th>Emails</th><th>Days</th><th>Reached</th>
      </tr></thead>
      <tbody>${converted.map(c => `<tr>
        <td class="sg-who">${esc(c.email)}</td>
        <td>${esc(c.company) || '<span class="sg-unknown">—</span>'}</td>
        <td>${motionChip(c) || '<span class="sg-unknown">—</span>'}
          ${c.via ? `<div class="sg-note">${esc(clip(c.via, 30))}</div>` : ''}</td>
        <td>${c.emailsSent || '<span class="sg-unknown">0</span>'}</td>
        <td>${c.attributed
          ? `${c.daysToConvert}d`
          : '<span class="sg-unknown" title="Signed up before the lead was added — they found Svarg on their own and were entered afterwards, so no motion can claim it">not attributable</span>'}</td>
        <td><span class="sg-pill ${c.stage === 'sales' ? 'sg-pill--paid' : ''}">${esc(stageLabel[c.stage] || c.stage)}</span></td>
      </tr>`).join('')}</tbody>
    </table>
  </details>`;
}

// ── Views ────────────────────────────────────────────────────────────────────

/**
 * Funnel is work; Reports is reading.
 *
 * Accounts and converted leads carry no buttons — nothing on them is actioned —
 * so they were sitting between the operator and the rows they came to work. A
 * report mixed into a worklist makes the worklist longer without making it
 * more useful, and it is the report that gets scrolled past.
 */
function setView(view) {
  state.view = view;
  const funnel  = view === 'funnel';
  const reports = view === 'reports';
  const pitches = view === 'pitches';
  const icp     = view === 'icp';

  document.getElementById('sg-kinds').hidden = !funnel;
  document.getElementById('sg-tabs').hidden = !funnel;
  document.getElementById('sg-stage').hidden = !funnel;
  document.getElementById('nl-panel').hidden = !funnel;
  document.getElementById('sg-reports').hidden = !reports;
  document.getElementById('sg-pitches').hidden = !pitches;
  document.getElementById('sg-icp').hidden = !icp;

  document.getElementById('sg-subtitle').textContent = icp
    ? 'Who this is for, and who it is not. Every hour spent outside this is an hour that teaches nothing about the product.'
    : funnel
    ? 'Five stages, in the order a customer moves through them. Only Outreach is typed in — the rest are records the product already writes. Each account appears once, at the furthest stage it has reached, so the counts add up.'
    : reports
      ? 'Read-only. Which organisations have someone using this, and which cold emails turned into accounts.'
      : 'What to say in the room. Every pitch concedes the incumbent first — all three prospects already run software, and a pitch that ignores it is heard as an attack.';

  for (const [id, on] of [['sg-view-icp', icp], ['sg-view-funnel', funnel], ['sg-view-reports', reports], ['sg-view-pitches', pitches]]) {
    const b = document.getElementById(id);
    b.classList.toggle('sg-view--on', on);
    b.setAttribute('aria-selected', String(on));
  }

  if (reports) renderReports();
  if (pitches) renderPitches();
  if (icp) renderIcpView();
}

function renderReports() {
  document.getElementById('sg-conversions').innerHTML = state.signals
    ? renderConverted(state.signals.converted) : '';
  renderAccounts();
}

/**
 * Signing out clears the whole session, not only the token.
 *
 * role and username decide what the client-side guards let you see, so leaving
 * them behind on a shared machine shows the next person an admin shell that
 * then fails every request — which looks like a broken product rather than a
 * finished logout.
 */
function wireAccountControls() {
  document.getElementById('sg-username').textContent =
    localStorage.getItem('username') || 'admin';

  document.getElementById('sg-view-icp').addEventListener('click', () => setView('icp'));
  document.getElementById('sg-view-funnel').addEventListener('click', () => setView('funnel'));
  document.getElementById('sg-view-reports').addEventListener('click', () => setView('reports'));
  document.getElementById('sg-view-pitches').addEventListener('click', () => setView('pitches'));

  document.getElementById('sg-logout').addEventListener('click', () => {
    ['token', 'role', 'username', 'redirectAfterLogin'].forEach(k => {
      try { localStorage.removeItem(k); } catch { /* private mode */ }
    });
    window.location.href = '/admin/login.html';
  });
}

/* ── Persona pitches ────────────────────────────────────────────────────────
 *
 * What to say in the room, per prospect. Kept as data rather than markup so a
 * sentence can be changed without touching a renderer, and so the three read
 * as variations on one structure instead of three separate documents.
 *
 * Every one of them opens by conceding the incumbent. That is deliberate: all
 * three prospects already run software, and a pitch that ignores it is heard
 * as an attack on a decision they already defended.
 */

/** The shape every meeting follows, whatever the prospect. */
const PITCH_FLOW = [
  { step: 'Question',  say: 'What is something your team needs to know regularly?' },
  { step: 'Answer',    say: 'SvargAI finds the relevant people and information.' },
  { step: 'Drill down', say: 'Why do these people need attention? SvargAI explains.' },
  { step: 'Action',    say: 'Draft a message, report or task. Human reviews, approves, executes.' },
  { step: 'Learning',  say: 'What other questions would your team want to ask?' },
];

/*
 * By industry, not by prospect.
 *
 * These began as three pitches for three named companies, which meant a fourth
 * conversation had nothing to read. The pattern was never the company: it is
 * what that kind of business already runs, and where that system stops. SIX
 * Cricket and the Bopanna academy are the same pitch; Vesoma is a different one
 * because the seam is between services rather than inside one.
 *
 * Every one of them opens by conceding the incumbent. That is deliberate: these
 * businesses already bought software once and defended the decision, and a
 * pitch that ignores it is heard as an attack on that decision.
 *
 * "Seen here" names the real prospects each pattern came from, so a generic
 * pitch can still be checked against a real conversation.
 */
const PITCHES = [
  {
    id: 'sports-academy',
    industry: 'Sports academies & clubs',
    thesis: 'Make existing information actionable',
    whoYouMeet: 'The academy director, the head coach, or the admin who runs the day',
    alreadyRun: 'Sportzy, AcadWare, a part-built custom system — or spreadsheets and WhatsApp',
    seen: 'SIX Cricket Academy · Rohan Bopanna Tennis Academy',
    elevator: [
      'You already have a system for the academy, and we\'re not asking you to replace it.',
      'The problem we\'re looking at is the work that still happens around it — coaches sending attendance on WhatsApp, admins checking different places, and people spending time finding out what needs attention.',
      'SvargAI lets your team simply ask questions like, “Who hasn\'t confirmed attendance?” or “What needs my attention today?”',
      'It finds the people and actions that matter, so your team spends less time looking for information and more time acting on it.',
    ],
    steps: [
      {
        title: 'Start with a familiar problem',
        say: 'Let me show you something your admins or coaches could ask every morning.',
        ask: 'Who hasn\'t confirmed attendance?',
        showLabel: 'Show',
        show: ['Student names', 'Batch', 'Session', 'Last attendance / confirmation'],
      },
      {
        title: 'Move from a question to prioritisation',
        ask: 'What needs my attention today?',
        showLabel: 'Show something like',
        show: [
          'Students who haven\'t confirmed attendance',
          'Students with overdue fees',
          'Onboarding items still pending',
          'Sessions that need attention',
        ],
        note: 'The important thing is not the dashboard. It\'s: “Tell me what I need to do.”',
      },
      {
        title: 'Take action',
        ask: 'Draft a WhatsApp message to the students who haven\'t confirmed attendance.',
        note: 'SvargAI drafts it. Then: Review → Approve → Send.',
      },
      {
        title: 'Introduce the learning loop',
        say: 'And this is where we\'d like to learn with you. If your coaches or admins keep asking SvargAI questions it can\'t answer today, those questions become the next capabilities we build.',
      },
    ],
    close: 'We\'d like to run this with your team for two weeks, using the questions they actually ask every day, and see how much useful work SvargAI can take off their plate.',
  },

  {
    id: 'multi-service-wellness',
    industry: 'Fitness, physiotherapy & sports medicine',
    thesis: 'Connect information across services',
    whoYouMeet: 'The centre manager or owner — whoever is answerable for members leaving',
    alreadyRun: 'GymShim, Zenoti, a gym CRM — built to run one service, not five',
    seen: 'Vesoma Sports Medicine',
    elevator: [
      'You already have a system, and it does a good job managing your gym operations.',
      'But you are more than a gym — you have fitness, physiotherapy, nutrition, hydro and recovery. So information about the same person can be spread across different services.',
      'SvargAI helps your team ask questions that bring that information together — for example, “Which rehab patients haven\'t returned to training?”',
      'Instead of someone checking different records and putting the answer together manually, SvargAI finds the people who need attention and helps your team take the next step.',
    ],
    steps: [
      {
        title: 'Start with the cross-service problem',
        say: 'Imagine I\'m managing the centre and I want to know who needs attention.',
        ask: 'Show me the rehab patients who haven\'t returned to training.',
        showLabel: 'Show',
        show: ['Name', 'Rehab programme', 'Last session', 'Training status', 'Coach / physio', 'Reason for attention'],
      },
      {
        title: 'Narrow the result',
        ask: 'Show me the patients who completed rehab but haven\'t returned to training.',
        note: 'Now you\'re demonstrating that SvargAI can reason across the information, rather than simply retrieve a list.',
      },
      {
        title: 'Take action',
        ask: 'Draft a WhatsApp message asking these patients how their recovery is going and inviting them for a training assessment.',
        note: 'Review → Approve → Send.',
      },
      {
        title: 'Expand the idea',
        say: 'What other questions could we answer?',
        showLabel: 'Examples',
        show: [
          'Which members use recovery services but aren\'t training regularly?',
          'Who finished physiotherapy but hasn\'t returned?',
          'Which members haven\'t been contacted recently?',
          'Who might need follow-up this week?',
        ],
      },
    ],
    close: 'This is the kind of workflow we\'d like to test with you — one question your team currently has to answer manually, and we\'ll see whether SvargAI can take that work off their plate.',
  },

  {
    id: 'mature-operator',
    industry: 'Where the admin software is already good',
    thesis: 'Turn history into decisions',
    whoYouMeet: 'The person answerable for outcomes, not for operations',
    alreadyRun: 'A mature vertical platform, well adopted, genuinely doing its job',
    seen: 'Rohan Bopanna Tennis Academy (Sportzy)',
    lead: 'Use this wherever the incumbent is mature and well liked. Do not argue about admin — it is solved, and saying otherwise ends the meeting. The wedge is the information that sits above routine administration: development over years, and reporting to whoever funds it.',
    elevator: [
      'You already use a system to run the academy, and it does a good job. We\'re not looking to replace it.',
      'We\'re interested in the questions that require more than today\'s attendance or payment report — things like, “Are our athletes actually progressing?” or “What happened to the children supported through our scholarship programme?”',
      'Those answers can involve attendance, coaches, programmes and history.',
      'SvargAI helps you ask those questions in plain English, find the people who need attention, and then take the next action.',
    ],
    steps: [
      {
        title: 'Start with the responsibility',
        say: 'You have sixty sponsored children. Imagine you\'re preparing the next scholarship review.',
        ask: 'Which scholarship students may need attention?',
        showLabel: 'Show',
        show: ['Student', 'Attendance', 'Recent participation', 'Programme', 'Coach', 'Reason for attention'],
      },
      {
        title: 'Show the positive side',
        say: 'Don\'t only show problems.',
        ask: 'Which scholarship students have shown the most progress this term?',
        note: 'Now you\'re demonstrating that the system isn\'t merely a problem detector. It can help answer: “What is happening with our people?”',
      },
      {
        title: 'Turn it into a deliverable',
        ask: 'Prepare a term update for the scholarship sponsors.',
        note: 'SvargAI prepares the report. They review → approve → send.',
      },
      {
        title: 'Expand beyond the first question',
        say: 'Then show where this could go.',
        showLabel: 'Examples',
        show: [
          'Which athletes are falling behind?',
          'Which have improved the most over the last year?',
          'Who may be ready for the next programme?',
          'Who hasn\'t had a coach review recently?',
        ],
      },
    ],
    close: 'We don\'t want to change your existing process. We\'d like to test one question with one group and see whether SvargAI can make that work significantly easier.',
  },

  {
    id: 'coaching-centre',
    industry: 'Coaching, test-prep & activity centres',
    thesis: 'Find the ones about to leave, before they do',
    whoYouMeet: 'The owner — one person, decides alone, pays monthly',
    alreadyRun: 'Classplus, Teachmint, a batch-management tool, or a register and WhatsApp',
    seen: 'Not yet pitched — the segment with school-shaped pain and no school procurement',
    lead: 'The best first conversation of the four: the same administrative load as a school, on an owner who can say yes in the room. No committee, no trustee, no academic-year window.',
    elevator: [
      'You already have something for batches and fees, and we\'re not asking you to replace it.',
      'What it can\'t tell you is which students are quietly on their way out — the ones whose attendance slipped three weeks ago, who stopped replying on WhatsApp, and whose fee is now late. That answer sits across three places and nobody has time to join it up.',
      'SvargAI reads them together and tells you who to call today, and why.',
    ],
    steps: [
      {
        title: 'Start where the money leaks',
        say: 'Most centres find out somebody has left when the fee does not arrive.',
        ask: 'Which students are at risk of dropping out?',
        showLabel: 'Show',
        show: ['Student and batch', 'Attendance trend', 'Last reply', 'Fee status', 'Why they are on the list'],
      },
      {
        title: 'Make it about one batch',
        ask: 'What\'s going on with the Saturday batch?',
        note: 'Narrowing to something they recognise is what turns a demo into their data.',
      },
      {
        title: 'Take action',
        ask: 'Draft a message to the parents of the students who have missed two or more classes.',
        note: 'Review → Approve → Send.',
      },
      {
        title: 'Introduce the learning loop',
        say: 'Whatever your staff keep asking it that it cannot do yet becomes the next thing we build for you.',
      },
    ],
    close: 'Give us two weeks and one question — the students you are worried about — and we\'ll see whether it finds them earlier than you do today.',
  },

  {
    id: 'school',
    industry: 'Schools — single campus, owner-run',
    thesis: 'The question the ERP has no module for',
    whoYouMeet: 'The principal or the owner. If it is a trust or a chain, this is a longer sale',
    alreadyRun: 'Entab, Teachmint, Campus 365, LEAD — an ERP that already claims to reduce admin',
    seen: 'Not yet pitched — see the caution before booking one',
    lead: 'Do not lead with administrative burden: that is precisely what every school ERP sells, and you will spend the meeting comparing features with an incumbent of three years. Qualify hard first — can one person in this building say yes? A committee makes this a two-quarter conversation, and child data raises the cost of a wrong number.',
    elevator: [
      'You already have a school management system, and we\'re not here to replace it.',
      'The question we\'re interested in is the one it has no module for: which children are quietly slipping — attendance drifting, fees behind, and a class teacher who has noticed something.',
      'That answer sits across four parts of your system and nobody joins them up, because nobody owns all four.',
      'SvargAI reads them together and gives you the children to look at this week, with the reason for each.',
    ],
    steps: [
      {
        title: 'Start with the child, not the admin',
        say: 'Your ERP is good at recording. This is about noticing.',
        ask: 'Which children may need attention this week?',
        showLabel: 'Show',
        show: ['Child and class', 'Attendance trend', 'Fee status', 'What the teacher recorded', 'Why they are on the list'],
      },
      {
        title: 'Show that it can explain itself',
        ask: 'Why is this child on the list?',
        note: 'Every figure is computed from their records and traceable to the rows it came from. In a school this matters more than anywhere: a wrong number about a child, sent to a parent, ends the relationship.',
      },
      {
        title: 'Turn it into the conversation they already have',
        ask: 'Prepare a note for the class teacher for each of these children.',
        note: 'Review → Approve → Send. The teacher gets a starting point, not an instruction.',
      },
      {
        title: 'Expand carefully',
        say: 'What else would you want to ask?',
        showLabel: 'Examples',
        show: [
          'Which classes have attendance falling this term?',
          'Which families are behind on fees and also disengaged?',
          'Who has improved the most since the last assessment?',
        ],
      },
    ],
    close: 'One class, one term, one question. If it does not find children earlier than your current process, we stop.',
  },
];

function renderPitchStep(s, i) {
  return `
    <li class="sg-pstep">
      <div class="sg-pstep__n">${i + 1}</div>
      <div class="sg-pstep__body">
        <h4 class="sg-pstep__title">${esc(s.title)}</h4>
        ${s.say ? `<p class="sg-pstep__say">“${esc(s.say)}”</p>` : ''}
        ${s.ask ? `<p class="sg-pstep__ask"><span>Ask</span>${esc(s.ask)}</p>` : ''}
        ${s.show ? `
          <p class="sg-pstep__showlab">${esc(s.showLabel || 'Show')}</p>
          <ul class="sg-pstep__show">${s.show.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${s.note ? `<p class="sg-pstep__note">${esc(s.note)}</p>` : ''}
      </div>
    </li>`;
}

function renderPitch(p) {
  return `
    <article class="sg-pitch" id="pitch-${esc(p.id)}">
      <header class="sg-pitch__head">
        <div>
          <p class="sg-pitch__thesis">${esc(p.thesis)}</p>
          <h3 class="sg-pitch__co">${esc(p.industry)}</h3>
          ${p.seen ? `<p class="sg-pitch__seen"><span>Seen here</span>${esc(p.seen)}</p>` : ''}
        </div>
        <div class="sg-pitch__meta">
          <p class="sg-pitch__inc"><span>Already running</span>${esc(p.alreadyRun)}</p>
          ${p.whoYouMeet ? `<p class="sg-pitch__inc"><span>Who you meet</span>${esc(p.whoYouMeet)}</p>` : ''}
        </div>
      </header>

      ${p.lead ? `<p class="sg-pitch__lead">${esc(p.lead)}</p>` : ''}

      <section class="sg-pitch__sec">
        <h4 class="sg-pitch__lab">Elevator pitch</h4>
        <blockquote class="sg-pitch__lift">
          ${p.elevator.map(x => `<p>${esc(x)}</p>`).join('')}
        </blockquote>
      </section>

      <section class="sg-pitch__sec">
        <h4 class="sg-pitch__lab">Demonstration path</h4>
        <ol class="sg-psteps">${p.steps.map(renderPitchStep).join('')}</ol>
      </section>

      <section class="sg-pitch__sec">
        <h4 class="sg-pitch__lab">Close</h4>
        <p class="sg-pitch__close">“${esc(p.close)}”</p>
      </section>
    </article>`;
}

/**
 * The structure first, then the three variations on it.
 *
 * Put the flow at the top because it is the thing to remember: a twenty-minute
 * product tour is what these meetings default to, and the flow is what stops
 * that happening.
 */
/**
 * Who we sell to, and why they buy — in three moves.
 *
 * The problem we claim exists, the organisations where that problem is
 * expensive, and how we get into the room. They are one argument: the ICP is
 * only meaningful as "where the problem in the first block costs money", and
 * the GTM is only meaningful as "lead with that problem, not with AI".
 *
 * ── The rule this page enforces on itself ──────────────────────────────────
 *
 * It is read during a live conversation, so anything it overstates is
 * overstated out loud to a customer. The four verbs we pitch — detect,
 * understand, act, learn — therefore carry what is actually built next to
 * them, and two of the four are not built today. A seller who knows that
 * demonstrates the two that are and sells the rest as roadmap; a seller who
 * does not promises software that does not exist and loses the second meeting.
 *
 * Everything else is written as a HYPOTHESIS, deliberately and visibly. Not
 * "this is our ICP" but "this is what we believe, and here is what would
 * change our mind" — the same discipline the product holds itself to when it
 * says what an answer rests on.
 *
 * The instruments — the validation matrix, the score — stay one click down,
 * because they are used during a conversation rather than remembered.
 */
function renderIcpView() {
  const el = document.getElementById('sg-icp');
  if (!el) return;

  /**
   * The pitch, with its build state attached.
   *
   * "not yet" is not a criticism of the roadmap. It is the difference between
   * a demonstration and a promise, on a page somebody reads mid-call.
   */
  const SPINE = [
    ['Detect', 'yes', 'Watchers run on a schedule and evaluate their condition in code.'],
    ['Understand', 'part', 'A finding carries the records behind it, but not yet why it matters.'],
    ['Act', 'no', 'Nothing a delivered application runs can send anything outward.'],
    ['Learn', 'no', 'Findings are diffed into new, still true and resolved &mdash; but nothing changes its own behaviour from that yet.'],
  ];

  const TODAY   = ['Data', 'Reports', 'Someone notices', 'Investigates', 'Acts'];
  const INSTEAD = ['Data', 'Signals', 'Svarg detects', 'Explains', 'Acts early'];

  /** What must be true of a business for early detection to be worth money. */
  const CRITERIA = [
    'The problem recurs &mdash; it is not a one-off',
    'The early signals already exist in their systems',
    'Those signals sit in more than one source',
    'A person connects the dots by hand today',
    'It gets significantly more expensive when found late',
    'There is a clear action once it is identified',
    'The outcome can be measured',
  ];

  /** Two qualifiers that are about us rather than them — and are how deals die. */
  const QUALIFIERS = [
    ['Buying access', 'Can we reach whoever approves a pilot?'],
    ['Deployment friction', 'Can we be running on their data in days, not quarters?'],
  ];

  /** The shape to listen for, as a sequence, so it is recognisable in a call. */
  const IDEAL = [
    'Multiple systems',
    'Signals distributed across them',
    'A human has to connect the dots',
    'The problem is found late',
    'Cost &middot; revenue &middot; customer &middot; operational impact',
  ];

  const HYPOTHESES = [
    ['Problem', 'businesses discover important problems too late, because nobody continuously connects the signals that are already sitting across the systems they run.'],
    ['ICP', 'the organisations where this costs the most are mid-market, with high-volume recurring operational workflows, and a small team finding problems reactively.'],
    ['Product', 'Svarg can watch those systems continuously and surface what is starting to go wrong, without the organisation replacing anything it already runs.'],
    ['Business value', 'customers pay when a problem found early is measurably cheaper than the same problem found late &mdash; in rupees, hours or a customer who stayed.'],
  ];

  /*
   * Buyer, user and the person who signs are three different people.
   *
   * What each of them CARES about is written in the vocabulary of the problem
   * being sold — being surprised, finding out late, firefighting. It used to
   * be written in the vocabulary of the administration ICP: workload, staff
   * productivity, coordination. Those are real concerns and the wrong ones to
   * open on, because none of them is what the product now claims to fix.
   */
  const PERSONAS = [
    ['Primary &mdash; buyer', 'Operations Head',
      'Being surprised &middot; escalations that arrive already late &middot; no view across systems &middot; the same fire twice &middot; explaining upwards what nobody caught'],
    ['Secondary &mdash; economic', 'Founder / Business Owner',
      'Revenue that leaked before anyone noticed &middot; customers lost quietly &middot; how much of this is happening that we cannot see'],
    ['User', 'Operations Executive',
      'Reads it every morning. Never the buyer, and the one who decides whether it survives week two &mdash; a list that is wrong twice is a list nobody opens again.'],
  ];

  const GTM = [
    ['Identify', 'Find a recurring problem that companies currently discover too late.'],
    ['Prove', 'Connect the systems they already run, and show Svarg finds it earlier than their current process does.'],
    ['Execute', 'Move past detection &mdash; recommend the intervention, then carry it out.'],
    ['Repeat', 'Deploy the same problem, solved the same way, at a similar company.'],
    ['Expand', 'Once Svarg owns one problem inside an organisation, take the adjacent ones.'],
  ];

  /*
   * The matrix is the criteria list turned into questions, in the same order,
   * one row per criterion. It used to be a second instrument with its own
   * vocabulary — firmographics, operational intensity, team structure — left
   * over from the administration ICP, which meant the page asked a prospect to
   * be two different things on two different screens. One instrument, asked
   * out loud, is worth more than two that half-agree.
   */
  const MATRIX = [
    ['Recurrence', 'Does this problem come back, or was it a one-off?', 'How many times this year'],
    ['Signal availability', 'Does the information that would have warned you already exist?', 'Which system holds it'],
    ['Fragmentation', 'Is it spread across more than one system or channel?', 'ERP + Excel + WhatsApp'],
    ['Manual effort', 'Who joins those up today, and how?', 'The person and the actual steps'],
    ['Lateness', 'How late do you find out?', 'Days, weeks, or never'],
    ['Cost of lateness', 'What does finding out late cost?', 'Rupees, hours, a lost customer'],
    ['Actionability', 'Once you know, is the next action obvious?', 'The named action'],
    ['Measurability', 'Could we show the improvement in a number?', 'The number, and who owns it'],
    ['Buying access', 'Can we reach whoever approves a pilot?', 'Name and role'],
    ['Deployment friction', 'Can we be running on your data in days?', 'Days / weeks / months'],
  ];

  const SCORE = [
    ['A', 'Recurrence', 'How often does this problem come back?'],
    ['B', 'Signal availability', 'Do the early signals already exist digitally?'],
    ['C', 'Fragmentation', 'How many systems and channels hold them?'],
    ['D', 'Manual effort', 'How much human dot-joining remains?'],
    ['E', 'Cost of lateness', 'How much worse is it when found late?'],
    ['F', 'Measurability', 'Can the improvement be shown in a number?'],
    ['G', 'Accessibility', 'Can we reach whoever approves a pilot?'],
    ['H', 'Deployment complexity', 'How hard is the integration and security?'],
  ];

  const CLUSTERS = [
    ['A', 'Sports &amp; coaching', 'Sports academies &middot; coaching centres &middot; training businesses',
      'One live application with real data. The recurring problem to test: a student drifts out and nobody notices in time.'],
    ['B', 'Distribution', 'Electronic component distributors &middot; industrial distributors &middot; B2B trading',
      'The largest list and the least evidence. The recurring problem to test: an enquiry or quotation goes cold between email, WhatsApp and the ERP.'],
    ['C', 'Operational services', 'Clinics &amp; wellness &middot; service centres &middot; specialty services',
      'Knowledge base written, first demonstration run. The recurring problem to test: a course of treatment is abandoned part-way and is only noticed at renewal.'],
  ];

  /*
   * sg-chain, NOT sg-flow: the Pitches tab already owns .sg-flow as a section
   * wrapper with its own __steps and __step children. Reusing the name here
   * turned that section into a wrapping flex row and put a border on every one
   * of its steps — a collision that only shows up on the other tab.
   */
  const chain = (steps, mod) => `<ol class="sg-chain${mod ? ' sg-chain--' + mod : ''}">`
    + steps.map((s) => `<li>${s}</li>`).join('') + '</ol>';

  el.innerHTML = `
    <section class="sg-who">

      <ol class="sg-who__ladder">
        <li class="on"><span>Problem</span>what we claim is true</li>
        <li><span>ICP</span>where it is worth money</li>
        <li><span>GTM</span>how we get in the room</li>
      </ol>

      <div class="sg-who__block sg-who__block--lead">
        <p class="sg-who__label">The problem &mdash; <em>businesses are reactive by default</em></p>
        <p class="sg-who__statement">Businesses already hold enormous amounts of data across CRM, ERP,
          operational software, spreadsheets, email and chat. <b>The signals that a problem is starting
          are scattered across those systems.</b> By the time somebody notices the pattern, the problem
          has already happened.</p>

        <p class="sg-who__label">What happens today</p>
        ${chain(TODAY)}

        <p class="sg-who__label">What should happen</p>
        ${chain(INSTEAD, 'good')}

        <p class="sg-who__statement sg-who__statement--quiet">Businesses discover important problems too
          late because <b>nobody continuously connects the signals</b> across the systems they already
          run.</p>
      </div>

      <p class="sg-who__label">What Svarg sells &mdash; find problems before they become costly</p>
      <ol class="sg-spine">
        ${SPINE.map(([verb, state, note]) => `
          <li class="sg-spine__step is-${state}">
            <p class="sg-spine__verb">${verb}<span class="sg-spine__tag">${
              state === 'yes' ? 'built' : state === 'part' ? 'partly' : 'not yet'}</span></p>
            <p class="sg-who__note">${note}</p>
          </li>`).join('')}
      </ol>
      <p class="sg-who__note"><b>Two of the four are not built.</b> This page is read during live
        conversations, so it says so here rather than letting somebody find out in the room. Demonstrate
        detect and understand; sell act and learn as what comes next, with a date.</p>

      <div class="sg-who__block sg-who__block--lead">
        <p class="sg-who__label">ICP &mdash; <em>start where early detection has measurable value</em></p>
        <p class="sg-who__statement">Mid-market organisations with <b>high-volume, recurring operational
          workflows</b>, where emerging problems are currently found reactively.</p>
        <p class="sg-who__note">We are not targeting businesses because they hold data or run several
          systems. Nearly everybody does. We target them because of what the list below makes true.</p>
      </div>

      <p class="sg-who__label">What has to be true of them</p>
      <ul class="sg-crit">${CRITERIA.map((c) => `<li>${c}</li>`).join('')}</ul>

      <p class="sg-who__label">And two that are about us</p>
      <table class="sg-who__attrs">
        <tbody>${QUALIFIERS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody>
      </table>
      <p class="sg-who__note">A perfect problem at a company we cannot reach, or cannot deploy into
        before the quarter ends, is not an opportunity. These two are how otherwise-good deals die.</p>

      <p class="sg-who__label">The shape to listen for</p>
      ${chain(IDEAL, 'down')}
      <p class="sg-who__note">Better than &ldquo;SMB&rdquo;, &ldquo;mid-market&rdquo; or
        &ldquo;enterprise&rdquo; as a definition, because every line of it is observable in a first
        conversation &mdash; a size band is not.</p>

      <p class="sg-who__label">What we believe, and would test</p>
      <div class="sg-who__grid">
        ${HYPOTHESES.map(([name, body]) => `
          <div class="sg-who__card">
            <h3>${name} hypothesis</h3>
            <p><span class="sg-who__we">We believe</span> ${body}</p>
          </div>`).join('')}
      </div>

      <p class="sg-who__label">Persona &mdash; buyer, user and owner are three people</p>
      <div class="sg-who__grid">
        ${PERSONAS.map(([role, who, cares]) => `
          <div class="sg-who__card">
            <h3>${role}</h3>
            <p class="sg-who__persona">${who}</p>
            <p class="sg-who__note">${cares}</p>
          </div>`).join('')}
      </div>

      <div class="sg-who__block sg-who__block--lead">
        <p class="sg-who__label">GTM &mdash; <em>win one problem, then expand</em></p>
        <p class="sg-who__statement">Svarg does not enter the market as
          &ldquo;AI for every business problem&rdquo;.</p>
        <ol class="sg-gtm">
          ${GTM.map(([name, body], i) => `
            <li><span class="sg-who__k">${i + 1}</span>
              <h4>${name}</h4><p>${body}</p></li>`).join('')}
        </ol>
      </div>

      <p class="sg-who__label">The motion</p>
      ${chain(['Industry', 'recurring problem', 'evidence', 'pilot', 'measurable outcome'], 'good')}
      <p class="sg-who__label">Rather than</p>
      ${chain(['Industry', 'generic AI pitch', 'demo', 'custom project'], 'bad')}

      <div class="sg-who__block sg-who__block--lead">
        <p class="sg-who__label">The opening question</p>
        <p class="sg-who__statement sg-who__ask">&ldquo;What problems in your business do you usually
          discover only after they have already happened?&rdquo;</p>
        <p class="sg-who__note">It opens the conversation on business impact rather than on AI, and the
          answer is the qualification &mdash; a prospect who cannot name one is not in the ICP, however
          well the firmographics fit.</p>
      </div>

      <div class="sg-who__card sg-who__card--no">
        <h3>Not this &mdash; four problems to walk away from</h3>
        <p>A problem that happened once. A problem whose warning signs were never written down
          anywhere. A problem nobody can act on once they know. A problem whose improvement cannot
          be shown in a number.</p>
        <p class="sg-who__note">Each fails one of the seven, and each is a pilot that ends with
          everyone agreeing it was interesting. The exclusion used to be written by function
          &mdash; no sales, no engineering, no marketing &mdash; which this page can no longer say:
          a quotation going cold between the inbox and the ERP is a sales workflow, and it is
          cluster B&rsquo;s test problem.</p>
      </div>

      <details class="sg-who__more">
        <summary>The validation instrument &mdash; what to ask in every conversation</summary>
        <table class="sg-who__matrix">
          <thead><tr><th>Dimension</th><th>Question</th><th>Evidence</th></tr></thead>
          <tbody>${MATRIX.map(([d, q, e]) =>
            `<tr><th>${d}</th><td>${q}</td><td class="sg-who__ev">${e}</td></tr>`).join('')}</tbody>
        </table>
      </details>

      <details class="sg-who__more">
        <summary>Scoring a prospect &mdash; 1 to 5 on each</summary>
        <table class="sg-who__matrix">
          <tbody>${SCORE.map(([k, name, q]) =>
            `<tr><th><span class="sg-who__k">${k}</span> ${name}</th><td>${q}</td></tr>`).join('')}</tbody>
        </table>
        <p class="sg-who__formula">Fit = A + B + C + D + E + F + G &minus; H</p>
        <p class="sg-who__note">Not a scientific formula and not pretending to be one. It is a
          learning tool: its value is that two people score the same prospect differently and then
          have to say why.</p>
      </details>

      <details class="sg-who__more">
        <summary>Where to look first &mdash; three clusters, and the problem to test in each</summary>
        <p class="sg-who__note"><b>Do not choose the industry first. Choose the recurring problem
          first.</b> A cluster is only somewhere to go looking for one; it is not the target. Start
          with two or three, find the recurring problem inside each, and see whether the same problem
          appears at company after company.</p>
        <div class="sg-who__clusters">
          ${CLUSTERS.map(([k, name, list, why]) => `
            <div class="sg-who__cluster">
              <h4><span class="sg-who__k">${k}</span> ${name}</h4>
              <p>${list}</p>
              <p class="sg-who__note">${why}</p>
            </div>`).join('')}
        </div>

        <p class="sg-who__label">What would actually count as validation</p>
        <ul class="sg-who__bar">
          <li class="weak">&ldquo;Ten companies said AI is interesting.&rdquo; &mdash; evidence of nothing</li>
          <li>8 of 12 academies described the same problem, found late</li>
          <li>9 of 12 had it, 6 called it painful, 4 agreed to a pilot, 2 paid</li>
          <li class="best">7 of 10 distributors had essentially the same problem in a different
            industry &mdash; which would mean the problem travels, and the industry never mattered</li>
        </ul>
      </details>

    </section>`;
}

function renderPitches() {
  const el = document.getElementById('sg-pitches');
  if (!el) return;
  el.innerHTML = `
    <section class="sg-flow">
      <h3 class="sg-flow__title">The demonstration structure</h3>
      <p class="sg-flow__sub">Use this in every meeting. Not a product tour — five moves, in order.</p>
      <ol class="sg-flow__steps">
        ${PITCH_FLOW.map((f, i) => `
          <li class="sg-flow__step">
            <span class="sg-flow__n">${i + 1}</span>
            <div>
              <p class="sg-flow__name">${esc(f.step)}</p>
              <p class="sg-flow__say">${esc(f.say)}</p>
            </div>
          </li>`).join('')}
      </ol>
    </section>

    <div class="sg-pitches">${PITCHES.map(renderPitch).join('')}</div>`;
}
