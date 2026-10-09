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
  kinds: new Set(['real']), view: 'icp',
  /** Which industry the funnel is being read for. 'all' or a segment id. */
  industry: 'all',
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
  return (rows || []).filter(r => (!r.kind || state.kinds.has(r.kind))
    && (state.industry === 'all' || segmentOf(r) === state.industry));
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

/* ── The funnel, by industry ────────────────────────────────────────────────
 *
 * Every row carries an industry typed by whoever added it, in whatever words
 * they used: "Electronics Manufacturing Services", "PCB Manufacturing",
 * "Test & Measurement". Thirty-odd spellings of about five businesses, which
 * reads as variety and is really one pipeline wearing many labels.
 *
 * So the rows are grouped rather than listed, and the grouping is the point.
 * The first time this ran it said what a hundred rows could not: the funnel
 * holds sixty-three electronics and industrial companies, thirty-nine with no
 * industry at all, and nobody in the segment being sold to.
 *
 * ── Rules it keeps ─────────────────────────────────────────────────────────
 *
 * Nothing is hidden by being unrecognised: a row whose words match no group
 * lands in Other, and a row with no industry lands in Not set. Both are shown
 * with their counts, because a silent filter that quietly drops a real
 * prospect is worse than a bucket nobody likes the look of.
 *
 * And the segment being sold to is always shown, even at zero. A chip reading
 * "Clinics & Wellness 0" is the most useful thing on this screen.
 */
/*
 * Grouped by customer relationship since 7 October 2026 — the five B2C
 * categories and the one B2B vertical the Target Audience tab is organised
 * into, with the same ids, so a lead filtered here is the same group whose
 * interviews are filed there.
 *
 * Order matters: the first match wins. High-value repeat services come
 * before Recurring Services, because "dental clinic" is the occasional,
 * high-ticket visit, not a course of sessions; academies and coaching are
 * Education & Memberships, whatever the sport.
 */
const FUNNEL_SEGMENTS = [
  { id: 'highvalue', group: 'B2C', name: '4 High-Value Repeat Services', always: true,
    is: /dental|dentist|auto ?service|car service|garage|automobile service|home service|premium health|hospital(?!ity)|diagnostic|eye care|dermatolog/i },
  { id: 'clinics', group: 'B2C', name: '1 Recurring Services', always: true,
    is: /clinic|wellness|physio|rehab|therap|spa\b|salon|beauty|health|fitness|gym|yoga|pilates|nutrition|medic/i },
  { id: 'education', group: 'B2C', name: '2 Education &amp; Memberships', always: true,
    is: /academy|academies|sport|cricket|tennis|football|badminton|coaching|athlet|school|edtech|education|tuition|learning|college|university|institute|music|dance|membership/i },
  { id: 'subscription', group: 'B2C', name: '3 Subscription &amp; Repeat Purchase', always: true,
    is: /subscription|d2c|direct.to.consumer|meal|food|\bpets?\b|pet care|consumable|grocery|e-?commerce|repeat purchase/i },
  { id: 'hospitality', group: 'B2C', name: '5 Hospitality &amp; Leisure', always: true,
    is: /hotel|resort|hospitality|travel|tour|club|leisure|experience|restaurant|cafe|homestay/i },
  { id: 'engineering', group: 'B2B', name: 'Engineering &amp; industrial', always: true,
    is: /engineering|project|epc|electronic|semiconductor|pcb|embedded|automation|robot|sensor|metrology|machine|instrument|component|power|material|chemical|cable|connector|smt|solder|manufactur|eda|iot|vision|energy|warehouse|wire|surface treatment|test|media|tool/i },
  { id: 'other', name: 'Other' },
  { id: 'unset', name: 'Not set' },
];
/** Which group a row falls in. Never null: everything lands somewhere. */
function segmentOf(row) {
  const text = String(row?.industry || '').trim();
  if (!text) return 'unset';
  for (const s of FUNNEL_SEGMENTS) if (s.is && s.is.test(text)) return s.id;
  return 'other';
}

/**
 * The industry row.
 *
 * One choice at a time rather than a set of toggles like the kinds above it:
 * the question this answers is "what does the funnel look like for THIS
 * industry", and reaching that by switching five others off is not an answer.
 */
function renderIndustryFilter() {
  const el = document.getElementById('sg-inds');
  if (!el) return;

  const all = TABS.flatMap(t => (state.signals[t.key] || []))
    .filter(r => !r.kind || state.kinds.has(r.kind));
  const totals = {};
  for (const r of all) totals[segmentOf(r)] = (totals[segmentOf(r)] || 0) + 1;

  const shown = FUNNEL_SEGMENTS.filter(s => totals[s.id] || s.always)
    .sort((a, b) => (a.group ? 0 : 1) - (b.group ? 0 : 1) || String(a.group || '').localeCompare(String(b.group || ''))
      || a.name.localeCompare(b.name));
  // A label before the first chip of each group: B2C, B2B, then the rest.
  const label = (s, i) => (s.group && s.group !== (shown[i - 1] || {}).group
    ? `<span class="sg-kinds__label">${s.group}</span>` : '');

  el.innerHTML = `<span class="sg-kinds__label">Industry</span>`
    + `<button type="button" data-ind="all" class="sg-ind${state.industry === 'all' ? ' sg-ind--on' : ''}">`
    + `All <span class="sg-kind__n">${all.length}</span></button>`
    + shown.map((s, i) => `${label(s, i)}
      <button type="button" data-ind="${s.id}"
              class="sg-ind${state.industry === s.id ? ' sg-ind--on' : ''}${s.always ? ' sg-ind--focus' : ''}">
        ${s.name} <span class="sg-kind__n">${totals[s.id] || 0}</span>
      </button>`).join('');

  el.querySelectorAll('.sg-ind').forEach(b => {
    b.addEventListener('click', () => {
      state.industry = b.dataset.ind;
      renderIndustryFilter(); renderTabs(); renderStage();
    });
  });
}

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
      // The industry counts are counts of what the kind filter left, so they
      // are redrawn with it.
      renderKindFilter(); renderIndustryFilter(); renderTabs(); renderStage();
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
        title="Click to edit the contact, the route in, and what happens next">${nextStepLabel(r)}</td>
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
    <!--
      Who they are, editable.

      A warm introduction is usually added from a phone number and nothing
      else — the motion declares phone and not email for exactly that reason —
      so the address, the name and the company all arrive later, after the
      person has replied. Until this existed the only way to correct any of
      them was to delete the lead and add it again, which threw away the
      status, the route in and the date it was first recorded.
    -->
    <div class="sg-l-who">
      <label>Name <input type="text" class="sg-l-name" value="${esc(r.name || '')}" placeholder="Who they are"></label>
      <label>Phone <input type="tel" class="sg-l-phone" value="${esc(r.phone || '')}" placeholder="Their number"></label>
      <label>Email <input type="email" class="sg-l-email" value="${esc(r.email || '')}" placeholder="Once you have one"></label>
      <label>Company <input type="text" class="sg-l-company" value="${esc(r.company || '')}" placeholder="Where they work"></label>
      <label>Role <input type="text" class="sg-l-role" value="${esc(r.role || '')}" placeholder="What they do"></label>
      <label>How you know them
        <input type="text" class="sg-l-rel" value="${esc(r.relationship || '')}" placeholder="Former colleague, friend&hellip;">
      </label>
    </div>
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
            // Who they are. Sent on every save rather than only when changed:
            // the server writes a field only when it is defined, and working
            // out what moved in the browser is a second opinion about the
            // record that can disagree with the first.
            name:         box.querySelector('.sg-l-name').value.trim(),
            phone:        box.querySelector('.sg-l-phone').value.trim(),
            email:        box.querySelector('.sg-l-email').value.trim(),
            company:      box.querySelector('.sg-l-company').value.trim(),
            role:         box.querySelector('.sg-l-role').value.trim(),
            relationship: box.querySelector('.sg-l-rel').value.trim(),
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
    renderIndustryFilter();
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
  // The page opens on the ICP tab (7 October 2026). Shown now rather than when
  // the funnel data arrives: the ICP tab does not wait on it.
  setView(state.view);
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
  const play    = view === 'playbook';
  const iview   = view === 'interview';
  const aud     = view === 'audience';

  document.getElementById('sg-kinds').hidden = !funnel;
  document.getElementById('sg-inds').hidden = !funnel;
  document.getElementById('sg-tabs').hidden = !funnel;
  document.getElementById('sg-stage').hidden = !funnel;
  document.getElementById('nl-panel').hidden = !funnel;
  document.getElementById('sg-reports').hidden = !reports;
  document.getElementById('sg-pitches').hidden = !pitches;
  document.getElementById('sg-icp').hidden = !icp;
  document.getElementById('sg-playbook').hidden = !play;
  document.getElementById('sg-interview').hidden = !iview;
  document.getElementById('sg-audience').hidden = !aud;

  document.getElementById('sg-subtitle').textContent = icp
    ? 'Who this is for, and who it is not. Every hour spent outside this is an hour that teaches nothing about the product.'
    : aud
    ? 'One segment, five companies, one table. The same problem at company after company is what makes an ICP — and the empty columns are as much of the evidence as the full one.'
    : iview
    ? 'Fifteen minutes on a clock. Two to set up, eleven to listen, two to say what Svarg is — and the last two only if the eleven produced something.'
    : play
    ? 'Ten steps, in order. The ICP tab says what we believe; this says what would confirm it — and each step has a number attached, so it is possible to be honest about where we actually are.'
    : funnel
    ? 'Five stages, in the order a customer moves through them. Only Outreach is typed in — the rest are records the product already writes. Each account appears once, at the furthest stage it has reached, so the counts add up.'
    : reports
      ? 'Read-only. Which organisations have someone using this, and which cold emails turned into accounts.'
      : 'What to say in the room. Every pitch concedes the incumbent first — all three prospects already run software, and a pitch that ignores it is heard as an attack.';

  for (const [id, on] of [['sg-view-icp', icp], ['sg-view-playbook', play], ['sg-view-interview', iview], ['sg-view-audience', aud], ['sg-view-pitches', pitches], ['sg-view-funnel', funnel], ['sg-view-reports', reports]]) {
    const b = document.getElementById(id);
    b.classList.toggle('sg-view--on', on);
    b.setAttribute('aria-selected', String(on));
  }

  if (reports) renderReports();
  if (pitches) renderPitches();
  if (icp) renderIcpView();
  if (play) renderPlaybook();
  if (iview) renderInterview();
  if (aud) renderAudience();
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
  document.getElementById('sg-view-playbook').addEventListener('click', () => setView('playbook'));
  document.getElementById('sg-view-interview').addEventListener('click', () => setView('interview'));
  document.getElementById('sg-view-audience').addEventListener('click', () => setView('audience'));
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

  /*
   * ── The focus, rewritten on 6 October 2026 ───────────────────────────────
   *
   * This page used to sell "find problems before they become costly", with a
   * problem statement about records disagreeing with what happened. That was
   * broad enough to mean any costly business problem, which is the platform
   * pitch the GTM below tells us not to make. On 6 October the focus became
   * retention and growth; on 7 October the owner narrowed it to RETENTION
   * ONLY, because explaining two outcomes to a customer is one too many.
   * Growth (upgrades, unbilled work) comes later. "Businesses are reactive by
   * default" stays as WHY the problem exists; it is not the product category.
   */

  /**
   * The pitch, stage by stage, with its build state attached.
   *
   * "not yet" is not a criticism of the roadmap. It is the difference between
   * a demonstration and a promise, on a page somebody reads mid-call.
   */
  const SPINE = [
    ['Detect', 'yes', 'Watchers run on a schedule and evaluate their condition in code: who stopped coming, who went quiet, who keeps missing appointments, whose complaints repeat.'],
    // Explain, Recommend and the rest since 6 October 2026: every customer
    // found carries a card from Detect to Learn (eame-template customerSpine.js).
    ['Explain', 'yes', 'Every finding says why it matters in the customer&rsquo;s terms &mdash; written per watcher, in code, alongside the records behind it.'],
    ['Recommend', 'yes', 'Every customer found gets a next step: call them, offer a time to come back, pass it to a senior person.'],
    ['Act', 'part', 'The team marks the step they took, and a follow-up can be drafted from the finding&rsquo;s facts. Svarg never sends anything; a person does.'],
    ['Measure', 'part', 'A step counts as worked when the watcher stops finding the problem afterwards. Customers retained over months, and the revenue kept, are not measured yet.'],
    ['Learn', 'part', 'Once two steps have each been tried three times in a business, the recommendation follows whichever worked more. No customer has enough outcomes yet.'],
  ];

  const TODAY   = ['Customer activity', 'Data', 'Reports', 'Someone notices', 'Investigates', 'Acts'];
  const INSTEAD = ['Customer activity', 'Signals', 'Svarg detects', 'Explains', 'Recommends', 'Acts', 'Measures'];

  /** What must be true of a business for retention signals to be worth money. */
  const CRITERIA = [
    'The problem recurs, because customers do &mdash; they buy, visit or renew repeatedly',
    'The early signals already exist digitally &mdash; of a customer starting to drift away',
    'Those signals sit in more than one system',
    'A person connects them by hand today, when anyone does',
    'It gets more expensive when found late &mdash; a customer lost, a renewal missed',
    'There is a clear action once the customer is identified',
    'Whether it worked can be measured, in customers kept',
  ];

  /** Two qualifiers that are about us rather than them — and are how deals die. */
  const QUALIFIERS = [
    ['Buying access', 'Can we reach whoever approves a pilot?'],
    ['Deployment friction', 'Can we be running on their data in days or weeks, not quarters?'],
  ];

  /** The shape to listen for, as a sequence, so it is recognisable in a call. */
  const IDEAL = [
    'Recurring customers',
    'Their behaviour leaves signals in several systems',
    'A person joins those signals by hand',
    'A customer drifts away before anyone notices',
    'A clear next action, and a number that moves',
  ];

  /*
   * We believe, and would test. The problem hypothesis names the outcome
   * (customers lost) and keeps "reactive by default" as the cause.
   */
  const HYPOTHESES = [
    ['Problem', 'businesses lose customers because they are reactive by default: customer behaviour leaves signals across the systems they already run, nobody joins them continuously, and the pattern is noticed after the customer has gone.'],
    ['ICP', 'the businesses where this costs the most have recurring customer relationships, meaningful value per customer, and enough digital customer activity that a customer drifting away can be seen in data they already hold.'],
    ['Product', 'Svarg can watch customer signals across those systems, identify who needs attention and explain why &mdash; and, next, recommend the intervention, help carry it out and measure whether it worked.'],
    ['Business value', 'customers pay when the difference is measurable: customers kept, churn reduced, renewals saved, a response that comes days earlier.'],
  ];

  /*
   * Buyer, user and the person who signs are three different people, and
   * which titles they hold varies by company -- a clinic's buyer is its
   * operations head, a SaaS company's is customer success, an engineering
   * services firm's is its delivery head. The pains are written in the
   * vocabulary of losing customers, which is what is sold.
   */
  const PERSONAS = [
    ['Buyer', 'Operations, Customer Success or Revenue head',
      'Customers lost quietly &middot; unexpected churn &middot; renewals missed &middot; no single view of a customer across systems &middot; teams reacting too late'],
    ['Economic buyer', 'Founder, business owner, business-unit or revenue leader',
      'Churn &middot; customer lifetime value &middot; renewals lost &middot; not knowing which customers are quietly leaving'],
    ['User', 'Operations, customer success, account management or the front desk',
      'Too many customers to watch &middot; checking several systems by hand &middot; deciding whom to call &middot; repetitive follow-up &middot; finding out too late. Reads it every morning, and decides whether it survives week two.'],
  ];

  const GTM = [
    ['Identify', 'Find one recurring retention problem that companies discover too late.'],
    ['Prove', 'Connect the systems they already use and show Svarg finds the at-risk customer earlier, or more reliably, than they do today.'],
    ['Act', 'Move past detection: recommend the intervention, and then help carry it out.'],
    ['Measure', 'Prove the outcome in their numbers: customers retained, churn reduced, renewals saved, response rate, time saved.'],
    ['Repeat', 'Find the same problem at similar companies, solved the same way.'],
    ['Expand', 'Once Svarg owns one retention problem inside an organisation, take the adjacent ones &mdash; growth among them, later.'],
  ];

  /*
   * sg-chain, NOT sg-flow: the Pitches tab already owns .sg-flow as a section
   * wrapper with its own __steps and __step children. Reusing the name here
   * turned that section into a wrapping flex row and put a border on every one
   * of its steps — a collision that only shows up on the other tab.
   */
  const chain = (steps, mod) => `<ol class="sg-chain${mod ? ' sg-chain--' + mod : ''}">`
    + steps.map((s) => `<li>${s}</li>`).join('') + '</ol>';

  const built = SPINE.filter(([, s]) => s === 'yes').length;
  const part = SPINE.filter(([, s]) => s === 'part').length;
  const not = SPINE.filter(([, s]) => s === 'no').length;

  /*
   * Three sub-tabs since 7 October 2026: Problem, ICP, GTM — the order the
   * argument runs in. All three are drawn and two are hidden, so switching is
   * instant and the page reads as one document for anybody searching it.
   *
   * One pattern in every panel, so nothing competes: an opening statement in
   * the one box, then plain sections, each a heading, a line of text and at
   * most one list or chain. The long instruments fold away.
   */
  const sec = (title, body) => `
    <section class="sg-who__sec">
      <h3 class="sg-who__h">${title}</h3>
      ${body}
    </section>`;
  const lead = (label, statement, rest = '') => `
    <div class="sg-who__lead">
      <p class="sg-who__label">${label}</p>
      <p class="sg-who__statement">${statement}</p>
      ${rest}
    </div>`;
  const SUBS = [
    ['problem', 'Problem', 'what we claim is true'],
    ['icp', 'ICP', 'where it is worth money'],
    ['gtm', 'GTM', 'how we get in the room'],
  ];
  const on = SUBS.some(([k]) => k === icpSub) ? icpSub : 'problem';

  el.innerHTML = `
    <section class="sg-who">

      <div class="sg-who__tabs" role="tablist" aria-label="ICP sections">
        ${SUBS.map(([k, name, what]) => `
          <button type="button" role="tab" class="sg-who__tab${k === on ? ' is-on' : ''}"
                  data-icpsub="${k}" aria-selected="${k === on}">
            <span>${name}</span>${what}
          </button>`).join('')}
      </div>

      <div class="sg-who__panel" data-panel="problem"${on === 'problem' ? '' : ' hidden'}>
        ${lead('The problem &mdash; <em>businesses lose customers because they are reactive by default</em>',
          `Customer behaviour creates signals in the systems a business already uses &mdash; the CRM,
          the booking system, the phone, WhatsApp, the ledger. <b>Those signals are fragmented, and nobody
          joins them continuously.</b> By the time the business notices, the customer may already have
          gone.`)}

        ${sec('Today, and what should happen', `
          <p class="sg-who__p">Today</p>
          ${chain(TODAY)}
          <p class="sg-who__p">Instead</p>
          ${chain(INSTEAD, 'good')}
          <p class="sg-who__note">One way it shows: twenty appointments a month recorded as No Show all
            <b>look the same in the records</b> &mdash; and the ones from customers starting to drift away
            are noticed only when those customers do not come back.</p>`)}

        ${sec('What Svarg sells &mdash; keep the customers you already have', `
          <ol class="sg-spine">
            ${SPINE.map(([verb, state, note]) => `
              <li class="sg-spine__step is-${state}">
                <p class="sg-spine__verb">${verb}<span class="sg-spine__tag">${
                  state === 'yes' ? 'built' : state === 'part' ? 'partly' : 'not yet'}</span></p>
                <p class="sg-who__note">${note}</p>
              </li>`).join('')}
          </ol>
          <p class="sg-who__note"><b>${built} of the ${SPINE.length} are built, ${part} are partly built,
            and ${not} are not built.</b> This page is read during live conversations, so it says so here
            rather than letting somebody find out in the room. Demonstrate detection, the reason and the
            next step on a real customer; show act, measure and learn as working but new &mdash; no customer
            has a measured result from them yet.</p>`)}

        ${sec('What we believe, and would test', `
          <div class="sg-who__grid">
            ${HYPOTHESES.map(([name, body]) => `
              <div class="sg-who__card">
                <h4>${name}</h4>
                <p><span class="sg-who__we">We believe</span> ${body}</p>
              </div>`).join('')}
          </div>
          <p class="sg-who__note"><b>Evidence would be</b> several companies independently describing the
            same retention problem, the signals already existing digitally, the problem found
            late today, the intervention clear, and the improvement measurable in money.</p>`)}
      </div>

      <div class="sg-who__panel" data-panel="icp"${on === 'icp' ? '' : ' hidden'}>
        ${lead('ICP &mdash; <em>the customer relationship, not the company size</em>',
          `Businesses with <b>recurring customer relationships, meaningful customer value, and enough
          digital customer activity</b> that a customer starting to drift away can be seen in data
          they already hold.`,
          `<p class="sg-who__note">SMB, mid-market and enterprise are labels for segmenting, not the
            definition. The definition is the relationship and the five things below.</p>`)}

        ${sec('What has to be true of them', `<ul class="sg-crit">${CRITERIA.map((c) => `<li>${c}</li>`).join('')}</ul>`)}

        ${sec('And two that are about us', `
          <table class="sg-who__attrs">
            <tbody>${QUALIFIERS.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody>
          </table>
          <p class="sg-who__note">A perfect problem at a company we cannot reach, or cannot deploy into
            quickly, is not an opportunity. These two are how otherwise-good deals die.</p>`)}

        ${sec('The shape to listen for', `
          ${chain(IDEAL, 'down')}
          <p class="sg-who__note">Every line of it is observable in a first conversation &mdash; a size
            band is not.</p>`)}

        ${sec('Who is in the room &mdash; buyer, economic buyer and user are three people', `
          <div class="sg-who__grid">
            ${PERSONAS.map(([role, who, cares]) => `
              <div class="sg-who__card">
                <h4>${role}</h4>
                <p class="sg-who__persona">${who}</p>
                <p class="sg-who__note">${cares}</p>
              </div>`).join('')}
          </div>`)}

        ${sec('Walk away from', `
          <div class="sg-who__card sg-who__card--no">
            <p>A customer problem that happened once. One whose warning signs were never written down
              anywhere. One nobody can act on once they know. One whose improvement cannot be shown in a
              number. And a problem outside retention, however costly &mdash; growth included: upgrades, cross-sell
              and unbilled work come later, and pitching them now makes Svarg two products to explain.</p>
            <p class="sg-who__note">Each fails one of the seven, and each is a pilot that ends with
              everyone agreeing it was interesting.</p>
          </div>`)}
      </div>

      <div class="sg-who__panel" data-panel="gtm"${on === 'gtm' ? '' : ' hidden'}>
        ${lead('GTM &mdash; <em>win one customer problem, then expand</em>',
          `Svarg does not enter the market as &ldquo;AI for every business problem&rdquo;. It starts with
          <b>one measurable retention problem in one repeatable customer segment.</b>`)}

        ${sec('Six steps', `
          <ol class="sg-gtm">
            ${GTM.map(([name, body], i) => `
              <li><span class="sg-who__k">${i + 1}</span>
                <h4>${name}</h4><p>${body}</p></li>`).join('')}
          </ol>`)}

        ${sec('The motion', `
          ${chain(['One retention problem', 'evidence', 'pilot', 'measured outcome', 'the same problem at a similar company'], 'good')}
          <p class="sg-who__p">Rather than</p>
          ${chain(['Industry', 'generic AI pitch', 'demo', 'custom project'], 'bad')}`)}

        ${sec('The opening question', `
          <p class="sg-who__ask">&ldquo;Which customers do you usually realise you&rsquo;re losing only
            after it&rsquo;s too late?&rdquo;</p>
          <p class="sg-who__note">Then: &ldquo;How do you find out today, and how long after it
            starts?&rdquo; It opens on customers and money rather than AI, and the answer is the
            qualification &mdash; a prospect who cannot name a customer they lost late is not in the ICP.</p>`)}

        ${sec('How to say it &mdash; one sentence a non-technical buyer finishes for you', `
          <p class="sg-who__ask">Svarg connects the systems you already use to find the customers
            you are at risk of losing &mdash; and tells your team what to do next.</p>
          <p class="sg-who__note">What it is not: another CRM, dashboard or reporting tool, a
            churn-prediction model, a lead-scoring tool, a chatbot, or &ldquo;AI for every business
            problem&rdquo;. Svarg is <b>an intelligence and action layer on top of them</b>.</p>
          <details class="sg-who__more sg-who__more--inline">
            <summary>What each phrase may claim today</summary>
            <p class="sg-who__note"><b>&ldquo;The systems you already use&rdquo;</b> means whatever Svarg
              can read: an upload, a database connection, or Zoho CRM, LeadSquared, Clinicea,
              cloud telephony, inbound WhatsApp, Confluence, GitHub and Jira, plus events sent from the
              customer&rsquo;s own app (an events API, for a business whose customers use its product). LeadSquared was built from its
              published API and has not yet read a real account, so say it connects, not that it has been
              proven to. Clinicea is the same, and it needs Clinicea&rsquo;s paid API add-on; another CRM or
              phone provider is still an export or a database.</p>
            <p class="sg-who__note"><b>&ldquo;Tells your team what to do next&rdquo;</b> is the board, a
              morning email, and a card per customer with why it matters and the next step &mdash; written
              by the AI service, which needs the model provider funded. A person sends any message.</p>
            <p class="sg-who__note"><b>&ldquo;Connects&rdquo;</b>: each check reads one or two systems,
              and every finding about the same customer is shown together on one card. A single check that
              reasons across all of a customer&rsquo;s systems at once &mdash; joining signals ACROSS
              agents into one judgement &mdash; is still not built. See the spine on the Problem tab.</p>
          </details>`)}

        ${sec('What would count as validation', `
          <ul class="sg-who__bar">
            <li class="weak">&ldquo;Ten companies said AI is interesting.&rdquo; &mdash; evidence of nothing</li>
            <li>8 of 12 clinics described customers drifting out unnoticed, found late</li>
            <li>9 of 12 had it, 6 called it costly, 4 agreed to a pilot, 2 paid &mdash; and the pilot kept customers it would have lost</li>
            <li class="best">7 of 10 distributors had essentially the same retention problem in a different
              industry &mdash; which would mean the problem travels, and the industry never mattered</li>
          </ul>`)}
      </div>

    </section>`;

  // Wired once: the panel element outlives every redraw.
  if (!el.dataset.subWired) {
    el.dataset.subWired = '1';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-icpsub]');
      if (!b) return;
      icpSub = b.dataset.icpsub;
      try { localStorage.setItem('sg-icp-sub', icpSub); } catch { /* private window: fine */ }
      renderIcpView();
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    });
  }
}

/** Which ICP sub-tab is open, remembered per browser. */
let icpSub = (() => { try { return localStorage.getItem('sg-icp-sub') || 'problem'; } catch { return 'problem'; } })();


/* ── The B2B playbook ───────────────────────────────────────────────────────
 *
 * The ICP tab states a hypothesis. This is the method that would confirm or
 * kill it, and the two are deliberately adjacent: a belief with no test beside
 * it hardens into a fact nobody checked.
 *
 * Rewritten 6 October 2026, and narrowed to retention only on 7 October. It opens on the thesis
 * (businesses are reactive by default; the signals are scattered and nobody
 * connects them early enough), then the same ten steps, then what the steps
 * produce: the product evolution, the motion, the strategic rule and the
 * final principle.
 *
 * It is written as ten numbered steps because the order is the content. Step 9
 * — the same problem at five companies — is worthless before step 2 has found
 * the problem in the customer's own words, and step 6 builds the wrong thing
 * if step 3 let an enthusiastic non-buyer into the roadmap. Numbering here is
 * not decoration; skipping is the failure mode it exists to prevent.
 *
 * Three steps carry a count — 5–7 hypotheses, 30–40 interviews, 3–5 pilots —
 * and they are shown as counts rather than buried in prose, because a target
 * that is never written down is one nobody can be behind on.
 */
/**
 * The ten steps, by name.
 *
 * Shared for the same reason the conditions are: the playbook renders them as
 * its steps and the target audience table renders them as its rows, and a step
 * called something slightly different on the second screen is a second step.
 * The order is the order they are run in.
 */
const PLAYBOOK_STEPS = [
  'Find the Acute Retention Problem',
  'Find the Acute ICP',
  'Separate Acute ICP from Vanity Users',
  'Embed Yourself in the ICP',
  'Run Reverse Problem Sessions',
  'Build the Smallest Possible Solution',
  'Run Design-Partner Pilots',
  'Prove Economic Value',
  'Validate Repeatability',
  'Convert the Niche into a Product Wedge',
];

/**
 * Step 1 of the playbook: what makes a problem acute.
 *
 * Module-level and shared, because two screens ask these questions — the
 * playbook, where they are the filter, and the target audience table, where
 * each one is a row that companies are scored against.
 *
 * They were written twice and drifted immediately: "Signals are spread across
 * multiple systems" became "Signals in more than one place" on the table, and
 * a condition that is worded differently in two places is two conditions. The
 * whole value of the table is that five companies answered the SAME
 * questions, so they live here, once.
 *
 * Eight since 6 October 2026: "The outcome can be measured" joined, because a
 * retention problem whose result cannot be counted cannot be sold
 * as arithmetic (step 8).
 *
 * The keys are the table's column data; the order is the order they are asked
 * in, and the table depends on it.
 */
const ACUTE_CONDITIONS = [
  ['frequency', 'It happens frequently'],
  ['signals', 'Warning signals already exist'],
  ['spread', 'Signals are spread across multiple systems'],
  ['manual', 'Someone currently connects the dots manually'],
  ['late', 'The problem is discovered too late'],
  ['cost', 'Late discovery has a measurable cost'],
  ['action', 'There is a clear action once detected'],
  ['measurable', 'The outcome can be measured'],
];

function renderPlaybook() {
  const el = document.getElementById('sg-playbook');
  if (!el) return;

  /** A sequence where the order carries meaning, arrows drawn rather than typed. */
  const seq = (steps, mod) => `<ol class="sg-pb__seq${mod ? ' sg-pb__seq--' + mod : ''}">`
    + steps.map((s) => `<li>${s}</li>`).join('') + '</ol>';

  const list = (items, mod) => `<ul class="sg-pb__list${mod ? ' sg-pb__list--' + mod : ''}">`
    + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';

  /** Something said out loud — either the wrong sentence or the right one. */
  const say = (text, good) => `<p class="sg-pb__say is-${good ? 'yes' : 'no'}">&ldquo;${text}&rdquo;</p>`;

  const label = (t) => `<p class="sg-pb__label">${t}</p>`;

  /** What exists today, said beside the stage it limits. */
  const today = (t) => `<p class="sg-pb__today"><b>Today</b> ${t}</p>`;

  // The filter itself; the keys beside each one belong to the table.
  const ACUTE = ACUTE_CONDITIONS.map(([, condition]) => condition);

  const HYPOTHESES_KEEP = [
    'Customers gradually reduce usage and nobody notices.',
    'Customers stop attending or engaging before they actually leave.',
    'Customers miss appointments or sessions repeatedly and eventually disappear.',
    'Complaints or unresolved issues accumulate before the customer churns.',
    'Customers approach renewal with declining engagement, and the team finds the risk too late.',
    'Customers go inactive across several systems, and nobody connects those signals.',
  ];
  const ASK = [
    'How do you know a customer is becoming inactive?',
    'How do you know a customer is likely to leave?',
    'What signals do you look at, and where do they live?',
    'Who checks them, and how often?',
    'What happens when nobody checks?',
    'How early could you realistically know?',
    'What does a lost customer cost?',
    'What happens after you identify the problem &mdash; how are customers contacted today?',
    'What software is involved?',
  ];

  const BUCKETS = [
    ['&#128293;', 'Acute', 'fire', [
      'Experiences the problem frequently',
      'Already has a workaround',
      'Feels the economic impact',
      'Someone is responsible for the problem',
      'Wants to solve it now',
      'Has the signals, and can act once it is detected',
      'Willing to test with real data',
    ]],
    ['&#128993;', 'Adjacent', 'amber', [
      'The problem exists, but',
      'frequency is low or impact moderate',
      'the workaround is acceptable',
      'nobody owns it strongly; little urgency',
      'May become customers later &mdash; do not build the company around them',
    ]],
    ['&#128308;', 'Vanity', 'red', [
      'Likes AI and likes the Svarg concept',
      'Wants dashboards and experimentation',
      'Asks for many custom features',
      'Enjoys interesting customer insights',
      'Excellent feedback, zero revenue',
    ]],
  ];

  const WHERE = ['LinkedIn', 'WhatsApp groups', 'Slack &amp; Discord', 'Reddit',
    'Industry associations', 'Conferences and trade events', 'Customer-success communities',
    'Sales and revenue communities', 'Operations communities', 'Vertical-specific communities'];

  const LISTEN = [
    'We keep losing customers because&hellip;',
    'We only realise they are unhappy when&hellip;',
    'Nobody follows up after&hellip;',
    'We have no idea which customers are going cold.',
    'Our team spends hours checking&hellip;',
    'The CRM has the data, but&hellip;',
    'We know there is an opportunity, but&hellip;',
    'By the time we know, it is too late.',
    'The customer suddenly stopped coming.',
  ];

  const CAPTURE = ['Exact language', 'Workflow', 'Systems used', 'Signals available',
    'Current workaround', 'Person responsible', 'Consequence', 'Timing', 'Action taken'];

  const LOOK = ['CRM', 'Attendance', 'App usage', 'Payments', 'Support', 'WhatsApp', 'Email',
    'Phone calls', 'Appointments', 'Spreadsheets'];

  const TODAY_FLOW = ['Customer activity', 'Signals appear', 'Stored in different systems',
    'Someone notices one signal', 'Someone checks another system', 'Someone connects the dots',
    'Customer is identified', 'Someone decides what to do', 'Customer is contacted', 'Outcome happens'];

  /*
   * The product workflow, with what is built today beside each stage. The
   * pasted playbook says "do not pretend this exists before it does"; these
   * lines are that rule applied to our own page. Same states as the ICP tab.
   */
  const WORKFLOW = [
    ['Connect', 'Connect the systems the customer already uses: CRM, appointments, usage, payments, support, communication.',
      '', 'Zoho CRM, LeadSquared, Clinicea, Jira, WhatsApp Business, phone systems, events from your own app, a database and file uploads.'],
    ['Detect', 'Find customers showing the pattern.',
      'Customer attendance dropped 40% over the last month.',
      'Watchers run on a schedule and evaluate their condition in code.'],
    ['Explain', 'Show why Svarg believes this customer needs attention.',
      'Attendance dropped from 8 sessions a month to 3. Last interaction 18 days ago. Two recent appointments missed.',
      'The AI writes why it matters for each customer, from the records behind the finding.'],
    ['Recommend', 'Tell the team what should happen.',
      'Contact the customer this week and check whether they are facing an issue.',
      'The AI writes the next step for each customer, from what has worked in that business.'],
    ['Act', 'Eventually: notify the right person, create a task, draft the message, trigger a workflow, update the CRM.',
      '',
      'Partly. Svarg drafts the message, notifies the owner in a morning digest and records the step the team took. It does not send, create tasks or update the CRM.'],
    ['Measure', 'Did the action work? Returned, renewed, stayed active &mdash; or churned anyway.',
      '',
      'Partly. A step counts as worked when the records stop showing the problem. Rupees retained are not measured yet.'],
  ];

  const PILOT = [
    'Connect real systems',
    'Use real customer data',
    'Run the detection continuously',
    'Identify actual customers',
    'Have the customer take actual action',
    'Measure what happens',
  ];

  const METRICS_KEEP = ['Customers detected at risk', 'How early they were detected', 'Number acted on',
    'Action rate', 'Recovery or save rate', 'Revenue retained', 'False positives', 'Time saved by the team'];

  const ECON_KEEP = [
    ['Customers monitored', '200', '200'],
    ['Customers showing risk', 'Unknown', '32'],
    ['Average detection time', 'After disengagement', '18 days earlier'],
    ['Customers acted on', '8', '27'],
    ['Customers recovered', '3', '14'],
    ['Revenue at risk identified', 'Unknown', '&#8377;X'],
    ['Revenue retained', 'Unknown', '&#8377;Y'],
  ];
  const table = (rows) => `<table class="sg-pb__econ">
      <thead><tr><th>Metric</th><th>Before Svarg</th><th>With Svarg</th></tr></thead>
      <tbody>${rows.map(([m, b, w]) => `<tr><td>${m}</td><td>${b}</td><td>${w}</td></tr>`).join('')}</tbody>
    </table>`;

  const SAME = ['Same customer problem', 'Same business process', 'Similar signals', 'Similar buyer',
    'Similar user', 'Similar intervention', 'Similar economic value', 'Similar deployment pattern'];

  const WEDGES = [
    ['Retention', 'Svarg helps multi-location clinics identify patients drifting away from treatment before they disappear, using appointment, attendance and CRM signals.'],
    ['Retention', 'Svarg helps coaching academies identify students whose engagement is declining before they drop out, using attendance, communication and payment signals.'],
    ['Retention', 'Svarg helps subscription businesses identify customers who are skipping or slowing their orders before they cancel.'],
    ['B2B', 'Svarg helps distributors identify repeat accounts that are quietly ordering less before they stop, using CRM, ERP and communication signals.'],
  ];

  const STEPS = [
    {
      title: PLAYBOOK_STEPS[0],
      aim: 'Start with one specific customer problem that hurts enough to buy.',
      target: '5&ndash;7 problem hypotheses',
      body: label('Do not start with')
        + say('We want to solve customer retention.', false)
        + `<p class="sg-pb__note">Too broad. Generate hypotheses, then find the one that is both
           frequent and economically painful &mdash; you do not need to pursue all of them.</p>`
        + label('Problem hypotheses')
        + list(HYPOTHESES_KEEP)
        + label('A strong problem usually has') + list(ACUTE, 'check')
        + seq(['Customer starts drifting', 'Nobody notices', 'Customer leaves'])
        + `<p class="sg-pb__rule">These conditions are not merely product requirements. <b>They are ICP
           qualification criteria.</b> If most are missing, the problem may be interesting but is unlikely
           to become a strong Svarg business.</p>`,
    },
    {
      title: PLAYBOOK_STEPS[1],
      aim: 'Find who experiences one of those problems most intensely.',
      target: '30&ndash;40 interviews',
      body: label('Do not start with')
        + say('Our ICP is mid-market companies.', false)
        + label('Follow one line')
        + seq(['Who', 'Customer workflow', 'Problem', 'Why too late', 'Economic impact', 'Action'])
        + `<p class="sg-pb__note">Not thirty generic interviews: test specific hypotheses with the people
           who own or live the workflow.</p>`
        + label('Ask') + list(ASK)
        + label('The ICP should eventually sound like')
        + say('Companies with <b>X recurring customer workflow</b>, where <b>Y retention problem</b> '
            + 'happens frequently, and <b>Z person</b> currently detects it manually using <b>A, B and C systems</b>.', true)
        + label('For example')
        + say('Multi-location service businesses where customers gradually disengage from a recurring service, '
            + 'with signals spread across CRM, appointment and communication systems, currently detected '
            + 'manually by operations or customer-success teams.', true)
        + label('Not') + say('SMB service businesses.', false),
    },
    {
      title: PLAYBOOK_STEPS[2],
      aim: 'Not everyone interested in Svarg is the customer. Sort every conversation into three buckets.',
      body: '<div class="sg-pb__buckets">'
        + BUCKETS.map(([dot, name, tone, points]) => `
            <div class="sg-pb__bucket is-${tone}">
              <h4><span class="sg-pb__dot">${dot}</span>${name}</h4>
              ${list(points)}
            </div>`).join('')
        + '</div>'
        + `<p class="sg-pb__rule"><b>Build for &#128293; Acute.</b> The question is not whether they like
           Svarg.</p>`
        + say('Are they already paying a cost because they discover this customer problem too late?', true),
    },
    {
      title: PLAYBOOK_STEPS[3],
      aim: 'Spend time where target customers already talk about their work.',
      body: label('Where') + list(WHERE)
        + '<p class="sg-pb__rule">Initially, do not sell. Listen.</p>'
        + label('Listen for')
        + `<div class="sg-pb__heard">${LISTEN.map((l) => `<p>&ldquo;${l}&rdquo;</p>`).join('')}</div>`
        + label('Capture') + list(CAPTURE)
        + `<p class="sg-pb__note">Do not translate their problem into AI language too early. Understand the
           <b>business language</b> first.</p>`,
    },
    {
      title: PLAYBOOK_STEPS[4],
      aim: 'Watch how the problem is found today, before showing Svarg.',
      body: say('Show me how you currently know that a customer is at risk of leaving.', true)
        + label('Then watch where they look') + list(LOOK)
        + label('Do not accept') + say('We usually know.', false)
        + label('Ask') + say('Show me.', true)
        + label('Map the current process')
        + seq(TODAY_FLOW, 'down')
        + `<p class="sg-pb__note">The opportunity for Svarg is the manual gap in this process.</p>`
        + label('Then introduce Svarg')
        + `<div class="sg-pb__swap">
             <p class="sg-pb__swap-from">Today, your team manually connects these signals.</p>
             <p class="sg-pb__swap-to">Svarg continuously connects them for you.</p>
           </div>`
        + seq(['Signals', 'Detect', 'Explain', 'Recommend', 'Act', 'Measure'], 'good'),
    },
    {
      title: PLAYBOOK_STEPS[5],
      aim: 'One problem, one customer segment, one owner, one measurable outcome.',
      body: '<p class="sg-pb__rule">Do not build a broad &ldquo;Customer Intelligence Platform&rdquo;.</p>'
        + label('For example') + say('Detect customers whose engagement is declining before they disappear.', true)
        + label('Not') + say('AI-powered customer retention.', false)
        + label('The product workflow')
        + `<ol class="sg-pb__flow">${WORKFLOW.map(([stage, what, eg, now]) => `
            <li>
              <h4>${stage}</h4>
              <p>${what}</p>
              ${eg ? `<p class="sg-pb__eg">${eg}</p>` : ''}
              ${today(now)}
            </li>`).join('')}</ol>`
        + `<p class="sg-pb__rule"><b>Do not pretend a stage exists before it does.</b> Detection is the
           strongest foundation; say the rest as it is.</p>`,
    },
    {
      title: PLAYBOOK_STEPS[6],
      aim: 'Three to five companies with the same customer problem &mdash; not five interested in Svarg.',
      target: '3&ndash;5 companies',
      body: label('Pilot structure') + list(PILOT)
        + label('The objective is not') + say('The customer liked the demo.', false)
        + label('It is')
        + say('Svarg found a customer at risk that the business would otherwise have discovered later '
            + '&mdash; or missed entirely.', true)
        + label('Measure') + list(METRICS_KEEP, 'check')
        + `<p class="sg-pb__rule">Do not optimise for the number of &ldquo;insights&rdquo;.
           <b>Optimise for customer outcomes.</b></p>`,
    },
    {
      title: PLAYBOOK_STEPS[7],
      aim: 'The sales story becomes arithmetic.',
      body: label('Not')
        + `<div class="sg-pb__nots">
             <p>&ldquo;Our AI is sophisticated.&rdquo;</p>
             <p>&ldquo;We have 40 agents.&rdquo;</p>
             <p>&ldquo;We use advanced models.&rdquo;</p>
           </div>`
        + label('Instead')
        + say('You were losing or missing <b>X</b>. We identified <b>Y</b> earlier. Your team acted on '
            + '<b>Z</b>. The resulting value was <b>&#8377;N</b>.', true)
        + label('Retention example') + table(ECON_KEEP)
        + `<p class="sg-pb__note">Illustrative &mdash; the real numbers come from pilots. Be conservative with
           attribution: if Svarg found an opportunity and the customer did not act, do not count its whole
           value as revenue Svarg generated.</p>`,
    },
    {
      title: PLAYBOOK_STEPS[8],
      aim: 'Does the same problem repeat across companies? This is where a company and a consulting project part.',
      body: `<div class="sg-pb__repeat">
           ${['A', 'B', 'C', 'D', 'E'].map((c) => `
             <div class="sg-pb__co"><span>Company ${c}</span><p>same problem &middot; signals &middot; owner &middot; intervention</p></div>`).join('')}
         </div>`
        + label('Look for') + list(SAME, 'check')
        + `<p class="sg-pb__note">If every company needs a completely different solution, it may be an AI
           consulting business rather than a product.</p>`
        + label('The key question')
        + say('Can we solve this problem for the next customer without rebuilding Svarg?', true),
    },
    {
      title: PLAYBOOK_STEPS[9],
      aim: 'Only after steps 1&ndash;9: one sentence, specific enough to be wrong.',
      body: `<p class="sg-pb__wedge">Svarg helps <em>specific customer segment</em> identify
           <em>specific retention problem</em> before <em>specific costly outcome</em>,
           using signals already available across their existing systems.</p>`
        + label('Not')
        + `<div class="sg-pb__nots">
             <p>&ldquo;AI platform for enterprises.&rdquo;</p>
             <p>&ldquo;AI for proactive business intelligence.&rdquo;</p>
             <p>&ldquo;Connect your data and find insights.&rdquo;</p>
           </div>`
        + label('Examples, not assumptions about the final ICP')
        + `<div class="sg-pb__wedges">${WEDGES.map(([k, w]) => `
            <p><span class="sg-pb__tag">${k}</span>${w}</p>`).join('')}</div>`
        + `<p class="sg-pb__note">The real wedge is filled from steps 1&ndash;9 &mdash; not from a whiteboard.</p>`,
    },
  ];

  /*
   * What the ten steps produce. Each stage carries today's state, from the
   * same facts as the ICP tab's spine, so the page read before a call never
   * promises a stage that is not there.
   */
  const EVOLUTION = [
    ['Detect', 'Something is happening.', 'Customer engagement dropped significantly.', 'Built.'],
    ['Understand', 'This is why it matters.', 'Reduced usage, two missed appointments, no reply to the last interaction.', 'Built &mdash; written by the AI per customer.'],
    ['Recommend', 'This is what you should do.', 'Contact the customer and check whether something is preventing them.', 'Built &mdash; written by the AI per customer.'],
    ['Act', 'Let Svarg help execute it.', 'Create task &rarr; draft message &rarr; update CRM &rarr; notify owner.', 'Partly &mdash; drafts and records; does not send, create tasks or update the CRM.'],
    ['Learn', 'Did the action work?', 'Customer returned &rarr; risk resolved. Or no response &rarr; escalate.', 'Partly &mdash; counts which steps worked; no customer has enough outcomes yet.'],
  ];

  const MOTION = [
    ['Identify', 'Find an acute retention problem.'],
    ['Prove', 'Show it happens repeatedly and that early signals exist.'],
    ['Detect', 'Use existing business data to find the customer earlier.'],
    ['Understand', 'Explain why that customer needs attention.'],
    ['Recommend', 'Tell the team what to do.'],
    ['Act', 'Help execute the intervention.'],
    ['Measure', 'Measure the customer or revenue outcome.'],
    ['Repeat', 'Solve the same problem for more companies.'],
    ['Productize', 'Turn the repeated workflow into a repeatable product.'],
    ['Expand', 'Once the wedge is strong, move into adjacent retention problems &mdash; and, later, growth.'],
  ];

  const LADDER = [
    ['Retention', 'Customer disengagement', 'Coaching academies', 'Student attendance',
      'Attendance + payment + communication', 'Intervention', 'Student retained'],
    ['Retention', 'Missed appointments', 'Same or adjacent segment', 'Appointments',
      'Appointment + CRM + communication', 'Intervention', 'Customer retained'],
    ['Retention', 'Renewal at risk', 'Same segment', 'Renewals',
      'Usage + payments + communication', 'Intervention', 'Renewal kept'],
  ];

  el.innerHTML = `
    <section class="sg-pb">
      <div class="sg-pb__lead">
        <p class="sg-pb__kicker">Svarg B2B Playbook &mdash; Retention</p>
        <p class="sg-pb__thesis">Businesses are reactive by default.</p>
        <p class="sg-pb__note">They have customer data across CRM, communication tools, operational
          systems, payments, attendance, usage, support and spreadsheets. The problem is not that they
          have no data. It is that <b>important customer signals are scattered, and nobody continuously
          connects them early enough.</b></p>
        <p class="sg-pb__note"><b>Retention:</b> customers start drifting away, and the business notices
          too late. Growth &mdash; upgrades, cross-sell &mdash; comes later, once one retention problem is won.</p>
        ${seq(['Data', 'Signals', 'Detection', 'Understanding', 'Recommendation', 'Action', 'Measurement'], 'good')}
        <p class="sg-pb__note">Not a churn predictor and not a CRM: <b>an intelligence and action layer on
          top of the systems businesses already use.</b> The ICP tab says what we believe; the ten steps
          below are what would prove it, read in order &mdash; the order is the content.</p>
      </div>

      <ol class="sg-pb__steps">
        ${STEPS.map((s, i) => `
          <li class="sg-pb__step">
            <div class="sg-pb__head">
              <span class="sg-pb__n">${i + 1}</span>
              <div class="sg-pb__title">
                <h3>${s.title}</h3>
                <p class="sg-pb__aim">${s.aim}</p>
              </div>
              ${s.target ? `<span class="sg-pb__target">${s.target}</span>` : ''}
            </div>
            <div class="sg-pb__body">${s.body}</div>
          </li>`).join('')}
      </ol>

      <div class="sg-pb__part">
        <h3>The Svarg product evolution</h3>
        <ol class="sg-pb__evo">${EVOLUTION.map(([stage, line, eg, now]) => `
          <li>
            <h4>${stage}</h4>
            <p class="sg-pb__evo-line">&ldquo;${line}&rdquo;</p>
            <p class="sg-pb__eg">${eg}</p>
            ${today(now)}
          </li>`).join('')}</ol>
        <p class="sg-pb__note">Over time Svarg gets better at knowing <b>which signals matter, which
          customers matter, what action works and when to act.</b></p>
      </div>

      <div class="sg-pb__part">
        <h3>The overall motion</h3>
        <ol class="sg-pb__motion">${MOTION.map(([word, line]) => `
          <li><b>${word}</b><span>${line}</span></li>`).join('')}</ol>
      </div>

      <div class="sg-pb__part">
        <h3>The strategic rule</h3>
        <p class="sg-pb__rule"><b>Do not sell &ldquo;retention&rdquo; as the first product.</b>
          It is the strategic territory; the product wedge is much narrower.</p>
        ${seq(['Territory', 'Problem', 'ICP', 'Workflow', 'Signal', 'Action', 'Outcome'])}
        ${LADDER.map((row, i) => `
          ${label(i === 0 ? 'For example' : 'Then, once that works')}
          ${seq(row, i === LADDER.length - 1 ? 'good' : '')}`).join('')}
        <p class="sg-pb__note">That is how Svarg becomes <b>horizontal without starting horizontal.</b></p>
      </div>

      <div class="sg-pb__part sg-pb__part--final">
        <h3>The final principle</h3>
        ${say('Find a market that needs AI.', false)}
        ${say('Find a recurring customer problem where businesses already have the signals, discover the '
          + 'problem too late, lose money because of that delay, and have a clear action they could take '
          + 'if they knew earlier.', true)}
        <p class="sg-pb__note">Then make Svarg the system that continuously closes that gap.</p>
        ${seq(['Data', 'Signals', 'Svarg', 'Early detection', 'Better action', 'Better customer outcome'], 'good')}
      </div>
    </section>`;
}

/* ── The ICP interview ──────────────────────────────────────────────────────
 *
 * Fifteen minutes, on a clock, because the failure mode of this conversation
 * is always the same one: the seller starts explaining. Two minutes to set up,
 * eleven to listen, two to say what Svarg is — and the last two only if the
 * eleven produced something.
 *
 * Rewritten 6 October 2026, retention only since 7 October: the goal is to find out
 * whether the business already has a recurring customer retention
 * problem that it discovers too late. The opener asks about customers, the
 * key question asks when they realise a customer was drifting or an
 * opportunity had passed, and the page ends on the matrix every interview
 * fills, the interviewer's mental model, the two patterns to expect and the
 * one rule.
 *
 * The questions are written to be read out loud word for word, so they are
 * rendered as speech rather than as bullet points. What each one is FOR is set
 * beside it in small type, because the answer has to be written into the ICP
 * tab's validation matrix afterwards and a question whose purpose the asker
 * has forgotten comes back as an opinion instead of an incident.
 *
 * Every dimension tag here names a row of that matrix. One instrument, asked
 * out loud — the same discipline the ICP tab holds itself to.
 */
function renderInterview() {
  const el = document.getElementById('sg-interview');
  if (!el) return;

  /** A line read out word for word. */
  const say = (t) => `<p class="sg-iv__say">&ldquo;${t}&rdquo;</p>`;

  /** A stage direction: what to do, not what to say. */
  const beat = (t) => `<p class="sg-iv__beat">${t}</p>`;

  /** A rule that holds for the whole block. */
  const rule = (t) => `<p class="sg-iv__rule">${t}</p>`;

  const note = (t) => `<p class="sg-iv__note">${t}</p>`;

  const label = (t) => `<p class="sg-iv__label">${t}</p>`;

  /** Things to listen for, as chips: recognised in the room, never read out. */
  const chips = (items) => `<ul class="sg-iv__costs">${items.map((c) => `<li>${c}</li>`).join('')}</ul>`;

  /** What a good answer sounds like — heard, not said. */
  const heard = (items) => `<div class="sg-iv__heard">${items.map((h) => `<p>&lsquo;${h}&rsquo;</p>`).join('')}</div>`;

  /**
   * One question, with the matrix row it fills.
   *
   * `key` marks the single question the whole interview turns on: an answer
   * to it is a prospect who discovers problems late, which is the hypothesis.
   */
  const ask = (q, { n = '', tests = '', key = false, after = '' } = {}) => `
    <div class="sg-iv__q${key ? ' is-key' : ''}">
      ${n ? `<span class="sg-iv__qn">${n}</span>` : ''}
      <div class="sg-iv__qbody">
        ${key ? '<p class="sg-iv__keytag">The question the interview turns on</p>' : ''}
        <p class="sg-iv__qtext">&ldquo;${q}&rdquo;</p>
        ${tests ? `<p class="sg-iv__tests"><span>Fills</span>${tests}</p>` : ''}
        ${after}
      </div>
    </div>`;

  /*
   * The lists below are written so the same script works in any business: a
   * customer is whoever is in front of you, and naming one trade's customer
   * would make every other room hear it as somebody else's script.
   */
  const KEEP_TRACK = ['Customers becoming inactive', 'Customers not returning', 'Missed appointments',
    'Declining usage', 'Complaints', 'Renewals', 'Follow-ups', 'Customers going quiet',
    'Customers who should be contacted', 'Customers who may leave'];

  const SIGNALS = ['Attendance dropped', 'Usage declined', 'Appointments missed', 'Complaints increased',
    'Payment behaviour changed', 'Response time changed', 'Fewer purchases', 'Fewer enquiries',
    'More support requests', 'Repeated requests', 'Communication stopped'];

  const SOURCES = ['CRM', 'ERP', 'Appointment system', 'Attendance system', 'Billing', 'Email', 'Phone',
    'WhatsApp', 'Support system', 'Spreadsheets', 'Product usage', 'Multiple databases'];

  const DETECTED = ['The manager checks the report.', 'Someone calls them.', 'The sales person notices.',
    'The front office checks the list.', 'We review it every week.', 'Someone tells me.',
    'I look at the CRM and then check another system.'];

  const ACTIONS = ['We would call them.', 'We would speak to the customer.', 'We would offer another service.',
    'We would assign someone to follow up.', 'We would intervene before they stop coming.',
    'We would offer a time to come back.', 'We would resolve the complaint.', 'We would change their plan.'];

  /** What late discovery is allowed to cost — rupees are not the only answer. */
  const COSTS_KEEP = ['Lost customers', 'Lost renewals', 'Lost revenue', 'Unused capacity',
    'Reduced lifetime value', 'Staff time spent recovering customers', 'Customer dissatisfaction',
    'Refunds', 'Lost future purchases'];

  /*
   * The four questions since 6 October 2026, from ICP_QUESTIONS — the same
   * list the Target Audience tab files the answers under, so what is asked
   * here and what is recorded there cannot drift apart.
   */
  const [Q1, Q2, Q3, Q4] = ICP_QUESTIONS.map(([, q]) => q);

  const BLOCKS = [
    {
      from: '0', to: '2', title: 'Set the context',
      body: rule('Do not pitch Svarg yet.')
        + say('I&rsquo;ll keep this very short. I&rsquo;m working on a product that helps '
            + 'businesses identify customer problems and opportunities earlier using signals they '
            + 'already have. Before I show you anything, I wanted to understand how your '
            + '<em class="sg-iv__slot">[team]</em> currently keeps track of customers who need attention.')
        + note('The blank is the only thing that changes between businesses &mdash; operations, '
             + 'customer success, the front office, sales, the branch team, the service team. '
             + 'Everything else in the fifteen minutes is asked word for word of everybody.')
        + beat('Then go straight to the first question. Do not explain retention or churn, and do not '
             + 'give examples unless they genuinely cannot answer.'),
    },
    {
      from: '2', to: '7', title: 'The problem, and the last time it happened',
      body: rule('Four questions in the whole interview. These are the first two.')
        + ask(Q1, {
          n: '1', tests: 'Recurrence &middot; Lateness', key: true,
          after: '<p class="sg-iv__note">You want the <b>moment of discovery</b>, not an opinion about '
               + 'churn. If they give several problems, take the one that sounds most frequent, most '
               + 'costly or most important to them &mdash; and stay with it.</p>',
        })
        + label('Listen for') + chips(KEEP_TRACK)
        + ask(Q2, {
          n: '2', tests: 'Signal availability &middot; Fragmentation',
          after: '<p class="sg-iv__note">A real customer, a real event, a real sequence. If they cannot '
               + 'remember one, write that down: <b>an incident is stronger evidence than a belief.</b> '
               + 'If there was no earlier information at all, that matters too &mdash; do not force '
               + 'it.</p>',
        })
        + label('Listen for actual signals') + chips(SIGNALS)
        + label('And where they sat') + chips(SOURCES)
        + note('The strongest answer sounds like: &ldquo;The attendance was in one system, complaints '
             + 'were in another, and the sales team knew the customer had stopped responding.&rdquo; '
             + 'That is the problem Svarg is looking for.'),
    },
    {
      from: '7', to: '11', title: 'How it is found today',
      body: rule('One problem. Do not go back to the others they mentioned.')
        + ask(Q3, { n: '3', tests: 'Manual effort &middot; Actionability' })
        + heard(DETECTED)
        + note('The strongest signal is <b>a person manually joining several pieces of information</b>. '
             + 'If their system already says &ldquo;customer X is at risk&rdquo;, ask what happens after '
             + 'it tells them. There may still be a problem, but it is a different one &mdash; do not '
             + 'manufacture it.'),
    },
    {
      from: '11', to: '13', title: 'What knowing earlier is worth',
      body: rule('Let them describe the impact, and do not push for rupees &mdash; or ask them to invent numbers.')
        + ask(Q4, { n: '4', tests: 'Actionability &middot; Cost of lateness &middot; Measurability' })
        + heard(ACTIONS)
        + note('&ldquo;We would know&rdquo; is not enough: detection is worth something only with an '
             + 'action behind it &mdash; detect, decide, act, outcome.')
        + chips(COSTS_KEEP)
        + note('The strongest answer is one they already measure: &ldquo;We lose around 15 customers a '
             + 'month&rdquo; beats &ldquo;it probably costs us a lot&rdquo;. File all four answers on the '
             + 'Target Audience tab &mdash; the playbook fills from them.'),
    },
    {
      from: '13', to: '15', title: 'Introduce Svarg',
      body: rule('Only if the eleven minutes produced something. No recurring problem, no early signal '
               + 'or no action: thank them and stop &mdash; a pitch into nothing teaches you nothing '
               + 'about the market.')
        + say('What you&rsquo;re describing is actually very close to the problem we&rsquo;re '
            + 'exploring with Svarg.')
        + label('Then thirty seconds, no more')
        + say('Svarg looks at signals across the systems you&rsquo;re already using, identifies '
            + 'patterns that indicate a customer may be at risk of leaving, explains why it thinks '
            + 'that, and helps the team act earlier.')
        + label('Stop. Do not add')
        + chips(['AI agents', 'Autonomous workflows', 'Dozens of models', 'Dashboards',
          'Technical architecture', 'Integrations', 'Future roadmap'])
        + note('Detect, explain and the recommended step can be demonstrated today. &ldquo;Helps the team '
             + 'act&rdquo; means a drafted message and a next step that a person takes &mdash; '
             + 'nothing is sent outward yet, and the ICP tab says so in the same words. Do not let the '
             + 'sentence grow in the room.')
        + label('Then tie it to what they just told you')
        + say('In your case, if the problem is <em class="sg-iv__slot">X</em>, and the signals are '
            + 'coming from <em class="sg-iv__slot">A + B + C</em>, the idea would be for Svarg to '
            + 'identify that pattern before your team normally discovers it.')
        + note('Not a generic demo: their own incident, their customer, their signals, their workflow.')
        + label('One closing question')
        + '<p class="sg-iv__close">&ldquo;Would it be useful if we looked at this specific problem'
        + ' using your actual workflow?&rdquo;</p>'
        + rule('Then stop. Do not turn the last two minutes into a product demo.'),
    },
  ];

  /*
   * The matrix every interview fills. Rows named as the ICP tab names them
   * where the two overlap; Problem, Incident, Buyer/User and Access are what
   * the interviewer records beside them.
   */
  const MATRIX = [
    ['Problem', 'What specific customer problem occurs?'],
    ['Recurrence', 'How often does it happen?'],
    ['Lateness', 'When do they realise?'],
    ['Incident', 'Can they describe a recent real case?'],
    ['Signal availability', 'Did warning signals exist beforehand?'],
    ['Fragmentation', 'Where do those signals live?'],
    ['Manual effort', 'Who connects the dots today?'],
    ['Actionability', 'What would they do if they knew earlier?'],
    ['Cost of lateness', 'What happens when they discover it late?'],
    ['Measurability', 'Can the impact be measured?'],
    ['Buyer / User', 'Who owns the problem and the action?'],
    ['Access', 'Can you get to the required systems and data?'],
    ['Deployment friction', 'How difficult would it be to connect?'],
  ];

  const CHAIN = ['Customer behaviour changes', 'A signal appears', 'The signal exists somewhere in the business',
    'Nobody connects it', 'The customer keeps drifting away',
    'The business notices later', 'There was a clear action they could have taken earlier',
    'Late discovery has a measurable economic impact'];

  const seq = (steps) => `<ol class="sg-iv__chain">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;

  el.innerHTML = `
    <section class="sg-iv">
      <div class="sg-iv__lead">
        <p class="sg-iv__kicker">Svarg ICP Interview &mdash; Retention</p>
        <p class="sg-iv__headline">Two minutes to set up, eleven to listen, two to say what Svarg is.</p>
        <p class="sg-iv__note">The failure mode of this conversation is always the same one: the
          seller starts explaining. The clock is there to stop that. Read the questions as written
          &mdash; each one fills a row of the validation matrix, and a question whose purpose you have
          forgotten comes back as an opinion instead of evidence.</p>
        <p class="sg-iv__note"><b>The goal is not to convince them Svarg is useful.</b> It is to find
          out whether they already have a <b>recurring customer retention problem that they
          discover too late.</b></p>
        <p class="sg-iv__note"><b>One script, every business.</b> Nothing spoken below names an
          industry, and only the opening blank changes from meeting to meeting. That is what makes the
          answers comparable &mdash; which is the whole test on the playbook tab.</p>
      </div>

      <ol class="sg-iv__blocks">
        ${BLOCKS.map((b) => `
          <li class="sg-iv__block">
            <div class="sg-iv__head">
              <span class="sg-iv__clock">${b.from}&ndash;${b.to}<em>min</em></span>
              <h3>${b.title}</h3>
            </div>
            <div class="sg-iv__body">${b.body}</div>
          </li>`).join('')}
      </ol>

      <div class="sg-iv__part">
        <h3>What you are actually measuring</h3>
        <p class="sg-iv__note">Every interview should produce the same matrix.</p>
        <table class="sg-iv__matrix">
          <thead><tr><th>Dimension</th><th>What you need to learn</th></tr></thead>
          <tbody>${MATRIX.map(([d, w]) => `<tr><td>${d}</td><td>${w}</td></tr>`).join('')}</tbody>
        </table>
      </div>

      <div class="sg-iv__part">
        <h3>The interviewer&rsquo;s mental model</h3>
        <div class="sg-iv__pair">
          <div><p class="sg-iv__label">Not</p><p class="sg-iv__not">I need to prove Svarg solves retention.</p></div>
          <div><p class="sg-iv__label">But</p><p class="sg-iv__but">I need to discover whether this business has a
            recurring customer problem it could have detected earlier.</p></div>
        </div>
        ${label('The chain you are listening for')}
        ${seq(CHAIN)}
        <p class="sg-iv__note">That is the Svarg opportunity.</p>
      </div>

      <div class="sg-iv__part sg-iv__part--rule">
        <h3>The one rule</h3>
        <p class="sg-iv__rule">If you hear yourself explaining Svarg before minute 13: stop.</p>
        <p class="sg-iv__note">The first eleven minutes are for discovering whether the problem exists.
          The quality of the pitch at minute 13 depends entirely on what you learned in minutes 2&ndash;11.</p>
        <ul class="sg-iv__provides">
          <li>The customer provides the problem.</li>
          <li>The customer provides the evidence.</li>
          <li>The customer provides the signals.</li>
          <li>The customer provides the action.</li>
          <li><b>You only provide Svarg.</b></li>
        </ul>
      </div>
    </section>`;
}

/* ── Target audience ────────────────────────────────────────────────────────
 *
 * One segment, five companies, one table. This is where the interview tab's
 * answers land, and it is the instrument the playbook's step 9 calls the gate:
 * the same problem at company after company, or no ICP.
 *
 * ── Why it is mostly empty, and stays that way ─────────────────────────────
 *
 * Four of the five columns have nothing in them. That is the finding, not a
 * gap in the page: one clinic with a problem is a customer, and this screen
 * exists to stop that being read as a market. The empty columns are as much
 * of the evidence as the full one.
 *
 * ── Filling it in ─────────────────────────────────────────────────────────
 *
 * Add the next company by writing its name, who was met and its answers into
 * the same keys. Nothing else changes: the rows, the order and the states are
 * shared, which is the point — five interviews answering slightly different
 * questions cannot be compared, and comparison is the whole exercise.
 *
 * States: 'yes' evidenced in the interview · 'open' asked and not established
 * · 'claim' stated by them and not yet arithmetic · '' not asked yet.
 */
/* ── The verticals being tested ─────────────────────────────────────────────
 *
 * One table per industry, each one a column short of an ICP until five
 * companies have answered the same questions.
 *
 * ── Why a second vertical is not a second product ─────────────────────────
 *
 * The strongest thing a second industry can do is not widen the pipeline. It
 * is to test whether the problem found in the first one TRAVELS — the ICP tab
 * says so outright: seven of ten distributors with essentially the same
 * problem in a different industry would mean the problem is the asset and the
 * industry never mattered.
 *
 * So the second vertical starts with the clinic's problem written down as a hypothesis
 * and nothing else. Not one cell is filled: no interviews have happened, and
 * a plausible example typed here in advance is indistinguishable from
 * evidence by the third conversation.
 */
/*
 * Grouped by the customer relationship, not by industry (7 October 2026):
 * five B2C categories, and Engineering as B2B. A category is the kind of
 * relationship a business has with its customers — a course of visits, a
 * term, a subscription, an occasional high-value service, a stay — because
 * that decides which signals exist and how a customer drifts away.
 *
 * Recurring Services is the clinics vertical renamed: its id stays 'clinics',
 * so Vesoma, The Wellness Co. and iSPAN stay with it. `overlay` names the
 * knowledge base overlay its delivered applications are built on, or null
 * where none exists yet. The four new categories' hypotheses are drafts:
 * nobody in them has been interviewed.
 */
const VERTICALS = [
  {
    id: 'clinics',
    group: 'B2C',
    n: 1,
    name: 'Recurring Services',
    examples: 'Clinics, wellness, gyms, salons, spas, physiotherapy',
    overlay: 'Clinics &amp; Wellness',
    hypothesis: 'Clinics and wellness businesses lose clients part-way through a course of '
      + 'treatment because the signs that a client is drifting &mdash; missed appointments, longer gaps, '
      + 'unanswered messages &mdash; sit across the booking system, the phone and WhatsApp, and nobody joins '
      + 'them. The cost is revenue: a client who stops, a package not renewed.',
    note: 'Narrowed on 7 October 2026, by decision, to retention only: growth &mdash; upgrades and '
      + 'unbilled work &mdash; is a second thing to explain and comes later. What carries it now: The Wellness '
      + 'Co. &mdash; a converted customer drifting over three months &mdash; is retention exactly; whether it '
      + 'costs them anything is still unasked. Vesoma &mdash; about twenty appointments a month recorded as '
      + 'No Show; which of those clients are drifting away is our inference, not something they reported, and '
      + 'it is the next thing to ask them. The problem Vesoma did report &mdash; treated patients left marked '
      + 'No Show, packages used past what was sold &mdash; is growth, and now outside the wedge. iSPAN: '
      + 'last-minute cancellations sit near retention; lead conversion is acquisition, outside it.',
  },
  /*
   * Engineering & Project Operations replaced Automotive on 5 October 2026.
   *
   * Automotive was a column with the right problem in it and the wrong name:
   * the companies worth calling first are product, embedded and industrial
   * engineering firms, and most of them are not automotive. Nobody had been
   * interviewed under it, so nothing was lost.
   *
   * It has its own knowledge base overlay since 5 October 2026: attention
   * areas (Schedule first), opportunity discovery, and the sources that put
   * Jira and the plan folder on the Data page. A vertical whose overlay has
   * another name would say so in `overlay`; this one needs none.
   */
  {
    id: 'education',
    group: 'B2C',
    n: 2,
    name: 'Education &amp; Memberships',
    examples: 'Coaching centres, academies, music and dance schools, sports academies',
    overlay: 'Sports Academies',
    hypothesis: 'Untested. Academies and schools lose students part-way through a term &mdash; and the '
      + 'renewal of the next term or batch &mdash; because attendance, fee payments and parent messages sit '
      + 'in different places and nobody joins them until the fee is not paid.',
    note: 'Drafted on 7 October 2026; nobody in this category has been interviewed. The closest evidence is '
      + 'the cricket academy we built for, which is not an interview. What to test first: whether a falling '
      + 'attendance shows up before a missed renewal, and whether anybody would act on it.',
  },
  {
    id: 'subscription',
    group: 'B2C',
    n: 3,
    name: 'Subscription &amp; Repeat Purchase',
    examples: 'D2C subscriptions, food subscriptions, pet care, consumables',
    overlay: null,
    hypothesis: 'Untested. Subscription and repeat-purchase brands lose customers who skip, pause or slow '
      + 'their reorders, because order history, support and '
      + 'messages sit apart and churn shows up only as a cancelled subscription.',
    note: 'Drafted on 7 October 2026; nobody has been interviewed. The risk to test early: one commerce '
      + 'platform may already hold most of the signals and flag churn itself, which would leave little for '
      + 'anybody to join by hand.',
  },
  {
    id: 'highvalue',
    group: 'B2C',
    n: 4,
    name: 'High-Value Repeat Services',
    examples: 'Auto service, dental, premium healthcare, home services',
    overlay: null,
    hypothesis: 'Untested. High-value repeat services lose the next visit &mdash; the service due, the '
      + 'follow-up treatment, the annual check &mdash; because the due date lives in one system and the '
      + 'conversation in another, and the customer books elsewhere before anybody calls.',
    note: 'Drafted on 7 October 2026; nobody has been interviewed. Close to Recurring Services, with fewer, '
      + 'larger visits: the question is whether one missed visit is worth enough to chase, and whether the '
      + 'due date is recorded anywhere at all.',
  },
  {
    id: 'hospitality',
    group: 'B2C',
    n: 5,
    name: 'Hospitality &amp; Leisure',
    examples: 'Hotels, resorts, travel, clubs, experiences',
    overlay: null,
    hypothesis: 'Untested. Hotels, clubs and experiences lose repeat guests and members between visits, '
      + 'and miss renewals, because stays, spend and feedback sit in separate systems and nobody '
      + 'acts on them before the guest books elsewhere.',
    note: 'Drafted on 7 October 2026; nobody has been interviewed. The weakest fit on frequency: a guest may '
      + 'come once a year, so whether there is an early signal at all is the first thing to find out. Clubs '
      + 'and memberships are the likelier start.',
  },
  {
    id: 'engineering',
    group: 'B2B',
    overlay: 'Engineering &amp; Project Operations',
    name: 'Engineering &amp; Project Operations',
    hypothesis: 'Untested. Account retention: in an engineering services firm the '
      + 'client is the customer, and the account &mdash; or the next statement of work &mdash; is lost when a '
      + 'project slips while the committed date stands, because nobody joins the schedule, the work and the '
      + 'testing in time.',
    note: 'Nothing here is filled in, and nothing should be until somebody has been '
      + 'asked. Reframed on 6 October 2026 as account retention, so it sits inside the wedge: a missed '
      + 'milestone matters because of the client it costs. Run as three experiments below, because a '
      + 'product-engineering firm, a plant-engineering firm and a manufacturer may describe three different '
      + 'ways of losing a client. What the product can already read in a plan and in Jira: work behind its '
      + 'planned progress, a milestone at risk, hours over the estimate, work blocked or unowned. What it '
      + 'cannot yet: tell that a committed date was never moved while the work slipped, or join those findings '
      + 'into one client account at risk.',
  },
];

/**
 * The four questions, asked word for word in every interview.
 *
 * Since 6 October 2026 these are the interview: the ICP Interview tab reads
 * them out, and the Target Audience tab files each company's answers under
 * them. The AI then fills the ten-step playbook from the answers (see
 * backend services/icpInterviewService.js, whose QUESTIONS are this list).
 */
const ICP_QUESTIONS = [
  ['problem', 'What is one customer problem that happens repeatedly, but your team usually notices too late?'],
  ['example', 'Take the most recent example. What happened before you noticed it, and where was that information?'],
  ['detection', 'Who notices it today, how do they notice it, and what do they do once they know?'],
  ['value', 'If you had known about it earlier, what would you have done—and what would it have saved or earned you?'],
];

let audienceVertical = 'clinics';

/*
 * The interviews for the vertical on screen, read from the server. They used
 * to be written into this file by hand, a cell at a time; they are now four
 * answers each, and the playbook below is filled from them.
 */
let icp = { vertical: '', interviews: [], wedge: null, loading: false, error: '' };
let icpCounts = {};

async function loadIcp(vertical) {
  icp = { ...icp, vertical, loading: true, error: '' };
  try {
    const [data, counts] = await Promise.all([
      api(`/icp?vertical=${encodeURIComponent(vertical)}`),
      api('/icp/counts').catch(() => ({ counts: icpCounts })),
    ]);
    icp = { vertical, interviews: data.interviews || [], wedge: data.wedge || null, loading: false, error: '' };
    icpCounts = counts.counts || {};
  } catch (err) {
    icp = { vertical, interviews: [], wedge: null, loading: false, error: err.message };
  }
  if (audienceVertical === vertical) renderAudience();
}

function setAudienceVertical(id) {
  audienceVertical = VERTICALS.some((v) => v.id === id) ? id : 'clinics';
  loadIcp(audienceVertical);
  renderAudience();
}

function renderAudience() {
  const el = document.getElementById('sg-audience');
  if (!el) return;
  if (icp.vertical !== audienceVertical && !icp.loading) { loadIcp(audienceVertical); }

  /*
   * The knowledge base's own name for this industry, not a description of it.
   *
   * Every vertical here is named as an overlay is named — Clinics & Wellness,
   * Automotive — because that overlay is what a delivered application for
   * anybody in this column gets built on.
   */
  const V = VERTICALS.find((x) => x.id === audienceVertical) || VERTICALS[0];
  const SEGMENT = V.name;
  const ready = icp.vertical === audienceVertical && !icp.loading;

  /*
   * The two steps that are our work rather than a customer's answer, per
   * vertical. The third, the wedge, is found from the interviews below.
   */
  const OURS = {
    clinics: {
      embed: ['', 'Not started. Four more interviews are worth more right now than hours in '
        + 'forums &mdash; but the words they use for this are still ours, not theirs'],
      build: ['open', 'The customer has named his biggest: bookings left marked no-show when the '
        + 'patient was treated. That is the candidate to build, ahead of the over-used package and '
        + 'the treatment reminder &mdash; one of the three, or it becomes a platform for one '
        + 'customer'],
    },
    engineering: {
      embed: ['', 'Not started. Nobody here has been spoken to yet, so there is no vocabulary to '
        + 'borrow &mdash; step 2 comes first'],
      build: ['', 'Nothing to choose between. A candidate before an interview is a guess with a '
        + 'roadmap attached'],
    },
  }[audienceVertical] || {
    // A category nobody has been interviewed in yet.
    embed: ['', 'Not started. Nobody here has been spoken to yet &mdash; step 2 comes first'],
    build: ['', 'Nothing to choose between until somebody has been interviewed'],
  };

  const REPEATABILITY = [
    ['same', 'Same problem'],
    ['buyer', 'Same buyer'],
    ['workflow', 'Similar workflow'],
    ['simsignals', 'Similar signals'],
    ['simaction', 'Similar action'],
    ['roi', 'Similar ROI'],
  ];

  /**
   * All ten steps. Three shapes, and the shape says who owes the answer:
   *
   *   rows     — several questions, one row each, asked of every company.
   *   key      — one row, asked of every company.
   *   segment  — one row spanning the companies: our work, not theirs.
   *
   * Step 1 leads with the problem type, because a company is sorted by what
   * its problem is before anything else. Step 7 carries the two rows four
   * answers never reach — a pilot agreed, and Svarg catching one first —
   * which only a person can fill.
   */
  const STEPS = [
    { n: 1, title: PLAYBOOK_STEPS[0], rows: [['kind', 'Problem type'], ...ACUTE_CONDITIONS] },
    { n: 2, title: PLAYBOOK_STEPS[1], key: 'icpline' },
    { n: 3, title: PLAYBOOK_STEPS[2], key: 'bucket' },
    { n: 4, title: PLAYBOOK_STEPS[3], segment: OURS.embed },
    { n: 5, title: PLAYBOOK_STEPS[4], key: 'reverse' },
    { n: 6, title: PLAYBOOK_STEPS[5], segment: OURS.build },
    { n: 7, title: PLAYBOOK_STEPS[6], rows: [['pilot', 'Pilot agreed'], ['earlier', 'Svarg caught it before they did']] },
    { n: 8, title: PLAYBOOK_STEPS[7], key: 'economics' },
    { n: 9, title: PLAYBOOK_STEPS[8], rows: REPEATABILITY },
    { n: 10, title: PLAYBOOK_STEPS[9], wedge: true },
  ];

  /*
   * ── How the second vertical is run ────────────────────────────────────────
   *
   * Three experiments rather than one list, because "engineering" is three
   * kinds of business that may have three different problems. The companies
   * are the prospect list as researched, not anybody's evidence.
   */
  const EXPERIMENTS = {
    engineering: [
      { id: 'A', name: 'Product &amp; embedded engineering',
        hypothesis: 'A client account is put at risk when a project quietly drifts, because requirements, '
          + 'development, testing and customer commitments live in different places.',
        companies: ['Celstream', 'Zettaone', 'Brigosha', 'IAST Software', 'Sloki', 'Merraky',
          'BLR Labs'] },
      { id: 'B', name: 'Industrial &amp; project engineering',
        hypothesis: 'The client learns of a delay only after several dependent activities have already '
          + 'slipped, and the next phase goes elsewhere. The strongest of the three for SvargAI.',
        companies: ['Sidvin Outotec', 'Utthunga', 'MEC Concepts', 'Merritt Innovative',
          'Symmetric Technologies'] },
      { id: 'C', name: 'Manufacturing + engineering',
        hypothesis: 'Repeat orders are lost when orders, production, quality and delivery commitments '
          + 'fall out of sync. Possibly the larger market of the three.',
        companies: ['RDMC', 'Mechano Engineering', 'Raj Engineering Industries',
          'other Peenya manufacturers'] },
    ],
  };
  const EXP = EXPERIMENTS[audienceVertical] || [];

  /** The filter the list is built with, and who in the company is called. */
  const WHO_BY_VERTICAL = {
    engineering: [
      ['The company', ['50&ndash;500 people, in India &mdash; Bengaluru first',
        'B2B, project-based engineering', 'Five or more customer projects running at once',
        'Its own engineering and delivery teams']],
      ['Strong signals', ['Product, embedded, automotive, industrial, electronics or aerospace '
        + 'engineering', 'Engineering consulting, testing and validation',
        'Industrial automation, EPC and project engineering']],
      ['Avoid for now', ['Ten-person consultancies', 'Pure staff augmentation',
        'One large internal product', 'TCS, Infosys, Siemens &mdash; procurement would set the '
        + 'pace of the learning']],
      ['Who to contact', ['COO or Head of Operations', 'VP or Head of Engineering',
        'Delivery Head or Program Director', 'Founder or CEO, at 50&ndash;200 people',
        'PMO head, where there is a PMO', 'Not individual project managers &mdash; they may read '
        + 'it as being watched']],
    ],
  };
  const WHO = WHO_BY_VERTICAL[audienceVertical] || null;

  /*
   * Five columns at least, however many have been interviewed. The blanks
   * are honest: an empty column is a company nobody has asked yet.
   */
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const done = ready ? icp.interviews : [];
  const COMPANIES = done.map((iv) => ({ ...iv, id: iv.letter, ivId: iv.id, name: iv.company }))
    .concat(LETTERS.slice(done.length).map((id) => ({ id, name: '', met: '', when: 'Not yet', cells: {} })));

  const GLYPH = { yes: '&#10003;', open: '?', claim: '!', '': '&middot;' };

  /** A static cell written here (HTML), spanning `span` columns. */
  const value = (v, span) => {
    const wide = span > 1 ? ` colspan="${span}"` : '';
    if (!v) return `<td class="sg-ta__cell is-empty"${wide}><span class="sg-ta__mark">&middot;</span></td>`;
    return `<td class="sg-ta__cell is-${v[0] || 'empty'}"${wide}>
      <span class="sg-ta__mark">${GLYPH[v[0]] || ''}</span><span>${v[1]}</span></td>`;
  };

  /**
   * One company's cell for one row, from the server — escaped, because it is
   * written from an interview, not by this page. Hover shows the words it
   * rests on.
   */
  const cell = (c, key) => {
    if (!c.ivId) return value(null, 1);
    const v = (c.cells || {})[key];
    const state = v ? (v.state || '') : '';
    const title = v?.quote ? ` title="From the answers: &ldquo;${esc(v.quote)}&rdquo;"` : '';
    return `<td class="sg-ta__cell is-${state || 'empty'}"${title}>
      <span class="sg-ta__mark">${GLYPH[state] || '&middot;'}</span><span>${esc(v?.text || '')}</span></td>`;
  };

  const stepHead = (s) => `<span class="sg-ta__stepn">${s.n}</span>${s.title}`;

  const W = ready ? icp.wedge : null;
  const wedgeCell = () => {
    if (W?.locked) return value(['yes', `Locked: ${esc(W.locked)}`], COMPANIES.length);
    if (W?.draft?.sentence) {
      return value([W.ready ? 'open' : '', `${W.ready ? 'Ready to lock' : 'Draft, not ready'}: ${esc(W.draft.sentence)}`], COMPANIES.length);
    }
    return value(['', 'Not drafted yet. It is drafted from the interviews shared in the chat'], COMPANIES.length);
  };

  const stepRows = (s) => {
    if (s.rows) {
      return `<tr class="sg-ta__grouprow">
          <th colspan="${COMPANIES.length + 1}">${stepHead(s)}</th></tr>`
        + s.rows.map(([key, label]) => `<tr>
            <th class="sg-ta__rowhead is-sub">${label}</th>
            ${COMPANIES.map((c) => cell(c, key)).join('')}</tr>`).join('');
    }
    if (s.segment || s.wedge) {
      return `<tr class="sg-ta__steprow is-segment">
          <th class="sg-ta__rowhead">${stepHead(s)}</th>
          ${s.wedge ? wedgeCell() : value(s.segment, COMPANIES.length)}</tr>`;
    }
    return `<tr class="sg-ta__steprow">
        <th class="sg-ta__rowhead">${stepHead(s)}</th>
        ${COMPANIES.map((c) => cell(c, s.key)).join('')}</tr>`;
  };

  const head = `<thead><tr><th class="sg-ta__rowhead"></th>
      ${COMPANIES.map((c) => `
        <th class="sg-ta__co${c.name ? ' is-done' : ''}">
          <span class="sg-ta__coid">${c.id}</span>
          <span class="sg-ta__coname">${c.name ? esc(c.name) : '&mdash;'}</span>
          <span class="sg-ta__cowho">${esc(c.met || c.when || '')}</span>
        </th>`).join('')}</tr></thead>`;

  /*
   * What the next conversation has to close: every condition the answers
   * touched but did not establish, worded as the AI or the operator left it.
   * Derived, so it can never disagree with the table above it.
   */
  const LABEL_OF = Object.fromEntries([['kind', 'Problem type'], ...ACUTE_CONDITIONS]);
  const STILL_OPEN = done.flatMap((iv) => Object.keys(LABEL_OF)
    .filter((k) => iv.cells?.[k]?.state === 'open')
    .map((k) => `${iv.letter} &middot; ${esc(iv.company)} &mdash; ${LABEL_OF[k]}: ${esc(iv.cells[k].text)}`)).slice(0, 8);

  /** One interview's status line: where its playbook came from. */
  const status = (iv) => {
    if (iv.filledAt) return '<span class="sg-ta__st is-ok">Playbook filled from the four answers</span>';
    if (iv.legacy) return '<span class="sg-ta__st">Re-filed from the earlier hand-written table</span>';
    return '<span class="sg-ta__st is-warn">Not filled yet</span>';
  };

  const wedgeBlock = () => {
    const w = W;
    const groups = w?.groups || [];
    return `
      <div class="sg-ta__wedge">
        <p class="sg-ta__label">${w?.locked ? 'Wedge &mdash; locked' : 'The wedge &mdash; draft, from the interviews'}</p>
        ${w?.locked ? `<p>${esc(w.locked)}</p>` : w?.draft?.sentence ? `<p>${esc(w.draft.sentence)}</p>` : `
          <p>Svarg helps <em>&hellip;</em> identify <em>&hellip;</em> before <em>&hellip;</em>.</p>`}
        ${w && !w.locked ? `<p class="sg-ta__note">${w.ready
          ? '<b>Ready to lock.</b> Two or more companies share one evidenced problem.'
          : '<b>Not ready.</b> No problem is evidenced at two companies yet &mdash; one company&rsquo;s problem is a customer, not a market.'}
          ${w.reason ? ` ${esc(w.reason)}` : ''}</p>` : ''}
        ${groups.length ? `<ul class="sg-ta__groups">${groups.map((g) => `
          <li><b>${esc(g.problem)}</b>
            <span>${g.companies.map((l) => `<i class="${g.evidenced.includes(l) ? 'is-yes' : ''}">${esc(l)}</i>`).join('')}</span>
            ${g.kind ? `<em>${esc(g.kind)}</em>` : ''}${g.why ? `<small>${esc(g.why)}</small>` : ''}</li>`).join('')}</ul>` : ''}
        <p class="sg-ta__note">Companies are grouped by the <b>same</b> problem, not the same category. Green
          letters have the problem evidenced. It stays a draft until two companies share one.</p>
      </div>`;
  };

  el.innerHTML = `
    <section class="sg-ta">
      ${[['B2C', 'B2C &mdash; by customer relationship'], ['B2B', 'B2B']].map(([g, title]) => `
      <p class="sg-seg__group">${title}</p>
      <div class="sg-seg" role="tablist" aria-label="${g} vertical">
        ${VERTICALS.filter((v) => v.group === g).map((v) => `
          <button type="button" class="sg-seg__b${v.id === audienceVertical ? ' is-on' : ''}"
                  data-vert="${v.id}" aria-selected="${v.id === audienceVertical}">
            ${v.n ? `${v.n} ` : ''}${v.name}<span>${icpCounts[v.id] || 0} of 5 interviewed</span>
          </button>`).join('')}
      </div>`).join('')}

      <div class="sg-ta__lead">
        <p class="sg-ta__seg">${SEGMENT}<span>${done.length} of 5 interviewed</span>
          <em class="sg-ta__kb">${V.overlay ? `knowledge base overlay: ${V.overlay}` : 'no knowledge base overlay yet'}</em></p>
        ${V.examples ? `<p class="sg-ta__examples">${V.examples}</p>` : ''}
        <p class="sg-ta__hyp">${V.hypothesis}</p>
        <p class="sg-ta__note">${V.note}</p>
      </div>

      ${EXP.length ? `
      <p class="sg-ta__label">Three experiments, not one bucket</p>
      <div class="sg-ta__exps">
        ${EXP.map((x) => `
          <article class="sg-ta__exp">
            <p class="sg-ta__expid">Experiment ${x.id}</p>
            <h4 class="sg-ta__exph">${x.name}</h4>
            <p class="sg-ta__exphyp">${x.hypothesis}</p>
            <p class="sg-ta__expco">${x.companies.join(' &middot; ')}</p>
          </article>`).join('')}
      </div>
      <p class="sg-ta__note">The aim is not to sell to all of them. It is to find out whether five
        to eight of them independently describe the same &ldquo;we found out too late&rdquo;
        problem &mdash; and which experiment they came from when they do.</p>` : ''}

      ${WHO ? `
      <p class="sg-ta__label">Who we are looking for</p>
      <div class="sg-ta__who">
        ${WHO.map(([h, items]) => `
          <div class="sg-ta__whocol">
            <p class="sg-ta__whoh">${h}</p>
            <ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
          </div>`).join('')}
      </div>` : ''}

      <p class="sg-ta__label">Four questions, for every interview</p>
      <ol class="sg-ta__asks">
        ${ICP_QUESTIONS.map(([, q]) => `<li>&ldquo;${q}&rdquo;</li>`).join('')}
      </ol>
      <p class="sg-ta__note">The same four for everybody, so the answers can be compared. Share the
        questions and answers in the Claude chat after each interview; the ten-step playbook below is
        filled from them, every tick quoting the words it rests on, and the wedge is drafted across
        the companies.</p>

      <p class="sg-ta__label">Interviews</p>
      ${icp.error ? `<p class="sg-ta__st is-bad">${esc(icp.error)}</p>` : ''}
      ${!ready ? '<p class="sg-ta__note">Loading the interviews&hellip;</p>' : `
      <div class="sg-ta__ivs">
        ${done.map((iv) => `
          <article class="sg-ta__iv">
            <header>
              <span class="sg-ta__coid">${iv.letter}</span>
              <b>${esc(iv.company)}</b>
              <span class="sg-ta__cowho">${[iv.met, iv.when].filter(Boolean).map(esc).join(' &middot; ')}</span>
              ${status(iv)}
            </header>
          </article>`).join('')}
        ${done.length ? '' : '<p class="sg-ta__note">No interviews in this vertical yet.</p>'}
      </div>`}

      <p class="sg-ta__label">The four answers, company by company</p>
      <div class="sg-ta__wrap">
        <table class="sg-ta__grid sg-ta__grid--four">
          ${head}
          <tbody>
            ${ICP_QUESTIONS.map(([, q], i) => `<tr class="sg-ta__steprow">
                <th class="sg-ta__rowhead"><span class="sg-ta__stepn">${i + 1}</span>${q}</th>
                ${COMPANIES.map((c) => cell(c, `q${i + 1}`)).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>

      <p class="sg-ta__key">
        <span class="is-yes"><i>&#10003;</i>evidenced</span>
        <span class="is-open"><i>?</i>asked, not established</span>
        <span class="is-claim"><i>!</i>stated, not yet arithmetic</span>
        <span class="is-empty"><i>&middot;</i>not asked, or not done yet</span>
      </p>

      ${STILL_OPEN.length ? `
      <p class="sg-ta__label">Still open from the interviews so far</p>
      <ol class="sg-ta__asks sg-ta__open">
        ${STILL_OPEN.map((q) => `<li>${q}</li>`).join('')}
      </ol>` : ''}

      <details class="sg-ta__more" open>
        <summary>The ten-step playbook, filled from the answers</summary>
        <p class="sg-ta__note">Each company&rsquo;s cells come from its four answers. Hover a tick to see the
          words it rests on; click a cell to correct it. A corrected cell is never overwritten by the AI.</p>
        <div class="sg-ta__wrap">
          <table class="sg-ta__grid">
            ${head}
            <tbody>
              ${STEPS.map(stepRows).join('')}
            </tbody>
          </table>
        </div>
      </details>

      ${wedgeBlock()}
    </section>`;

  wireAudience(el.querySelector('.sg-ta'));
}

/** The tab's one control: which vertical is on screen. */
function wireAudience(root) {
  if (!root) return;
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vert]');
    if (b) setAudienceVertical(b.dataset.vert);
  });
}

/* ── Outreach, by industry ──────────────────────────────────────────────────
 *
 * The first message, before there is a meeting to have a pitch in.
 *
 * ── The one word that was changed ─────────────────────────────────────────
 *
 * The draft said "we found examples such as patients being treated but
 * recorded as No Show". We did not find them. A wellness centre told us, in a
 * fifteen-minute interview, and the difference is the whole credibility of
 * the mail: a prospect reads "we found" as "your product detected this", asks
 * how, and the answer is "he told us".
 *
 * Attributing it to the centre is also the stronger sentence. It says you have
 * already sat with somebody in their trade and listened, which is the only
 * thing a cold mail can offer that a product page cannot.
 *
 * Everything else is the same message in shorter words.
 */
const FIRST_MESSAGE = {
  'clinics': {
    subject: 'Customers who drift away &mdash; and are noticed too late',
    /*
     * Recurring Services, 7 October 2026: the owner's rewrite, opening on
     * customers drifting away (retention only since the same day). One line was changed before it
     * shipped: the draft said the centre reported patients leaving part-way
     * through their treatment, which is our inference, not what Vesoma
     * reported. The example below is what they said. The link is the lead's
     * own tracked {{link}}, not an address carrying another source's tag.
     */
    email: [
      'Hi [Name],',
      'I&rsquo;m exploring a problem in recurring-service businesses: <b>customers often show signs '
        + 'that they are starting to drift away, but the business notices only after they have gone.</b>',
      /*
       * The owner's example, 7 October 2026, with two words held to what the
       * centre said: they reported about twenty BOOKINGS a month marked No
       * Show (not twenty customers), and their own question was how many had
       * actually attended. Missing an appointment versus starting to
       * disengage is our question, so it is "the question it raises", not
       * theirs.
       */
      'For example, a wellness centre in Bengaluru found that around 20 appointments a month were being '
        + 'recorded as &ldquo;No Show&rdquo;. The question it raises is: which of these customers are '
        + 'simply missing an appointment, and which are starting to disengage and may not come back?',
      'The information to answer that may already exist across their booking, CRM and customer '
        + 'interaction data, but it isn&rsquo;t always connected.',
      'Do you face similar challenges in identifying customers who may be about to drop off?',
      'Would you be open to a <b>15-minute conversation</b> to share how you handle this today?',
      'You can learn more about what we&rsquo;re building at SvargAI: {{link}}',
    ],
    sign: ['Regards,', 'Pranesh', 'Founder &amp; CEO, SvargAI'],
    /*
     * LinkedIn and WhatsApp: the same example as the email, the deck and the
     * one-pager (7 October 2026) — about twenty appointments a month marked
     * No Show, and which of those customers are drifting away.
     */
    short: [
      'Hi [Name] &mdash; I&rsquo;m exploring a problem in recurring-service businesses: customers often '
        + 'show signs that they&rsquo;re starting to drift away, but the business notices too late.',
      'A wellness centre in Bengaluru found that around 20 appointments a month were being recorded as '
        + '&ldquo;No Show&rdquo;. The question it raises: which of those customers are simply missing an '
        + 'appointment, and which are starting to disengage?',
      'Do you face similar challenges in identifying customers who may be about to drop off? Happy to '
        + 'have a short chat.',
      'Learn more about SvargAI: {{link}}',
    ],
  },
  /*
   * Engineering: a question, not a product.
   *
   * Not "an AI platform for engineering companies" — that sells a category
   * and locks the conversation into it. It opens on the one thing every
   * delivery head has an answer to, how late they find out, and asks where
   * the warning would have been. Nobody in this vertical has been
   * interviewed, so unlike the clinic message there is no "a company told
   * us" to attribute: nothing here claims an example, a customer or a result.
   */
  /*
   * Account retention since 6 October 2026: in a services firm the client is
   * the customer, and a slipping project is how a client account -- or the
   * next statement of work -- is lost. The message opens on the client, and
   * the project is how it happens.
   */
  'engineering': {
    subject: 'When a client project starts slipping, how early do you know?',
    email: [
      'Hi [Name],',
      'When a client project starts slipping, how early do you usually know &mdash; before the client does, or after?',
      'I&rsquo;m exploring a problem across engineering services companies: the schedule, the '
        + 'engineering work, testing and the commitments made to the client are all recorded in '
        + 'different places. Each one looks fine in isolation, but nobody continuously connects them '
        + '&mdash; so a project can go quietly off track until the client notices, and the next phase '
        + 'goes elsewhere.',
      'SvargAI runs AI agents on top of the systems a team already uses and looks for those '
        + 'signals early. Before anything else, I&rsquo;d like to understand how it happens at '
        + '[Company]: which client projects do you usually realise are at risk only after the '
        + 'delivery date is affected, and where does the information that would have warned you '
        + 'actually live?',
      'Would you be open to a 15-minute call?',
      'Learn more: {{link}}',
    ],
    sign: ['Regards,', 'Pranesh', 'Founder &amp; CEO, SvargAI'],
    short: [
      'Hi [Name] &mdash; when a client project starts slipping, how early do you usually know?',
      'I&rsquo;m talking to engineering services companies about client projects that drift '
        + 'quietly: the schedule, engineering work, testing and client commitments live in different '
        + 'systems, and nobody connects them until the client notices.',
      'Which client projects do you usually realise are at risk only after the delivery date has '
        + 'moved? Happy to have a short chat.',
      'Learn more: {{link}}',
    ],
  },
};

/**
 * Who to write to first in engineering, and which experiment each is in.
 *
 * The ten from the researched list, in the order to contact them. The second
 * batch is kept beside it so the next ten are not a fresh search.
 */
const ENGINEERING_FIRST = [
  ['Celstream Technologies', 'A', 'Product engineering across many customer engagements'],
  ['Merritt Innovative Solutions', 'B', 'Prototype &rarr; testing &rarr; manufacturing &rarr; supply'],
  ['MEC Concepts India', 'B', 'Mechanical, electronics and IT teams across several industries'],
  ['Sidvin Outotec Engineering', 'B', 'Layout, mechanical, piping, civil and instrumentation on one plant'],
  ['Utthunga', 'B', 'Industrial engineering and automation on customer projects'],
  ['IAST Software Solutions', 'A', 'Automotive ECU, AUTOSAR, safety &mdash; milestones and testing'],
  ['Brigosha', 'A', 'Embedded, IoT, cloud and product engineering streams'],
  ['Merraky Engineering Solutions', 'A', 'Positions on time-to-market and engineering cost'],
  ['Symmetric Technologies', 'B', 'Project engineering, system integration and IV&amp;V'],
  ['Sloki Software Technologies', 'A', 'Automotive embedded: hardware, firmware, HIL, BMS, ADAS'],
];
const ENGINEERING_NEXT = ['Zettaone Technologies', 'Ramdisk', 'iTWINE Technologies', 'BLR Labs',
  'TalentRabbit', 'Evenion Technologies', 'RDMC', 'Mechano Engineering', 'Raj Engineering Industries'];

/** Which industries the Pitches tab is organised into. */
/*
 * Since 7 October 2026 these are the Target Audience categories, read from
 * VERTICALS rather than kept a second time: five B2C by customer
 * relationship, then B2B. A category with no first message yet says so.
 */
const PITCH_NOTE = {
  clinics: 'Where the effort is going now',
  engineering: 'Discovery &mdash; nobody interviewed yet',
};
const PITCH_SEGMENTS = [
  ...VERTICALS.map((v) => ({
    id: v.id, group: v.group, name: `${v.n ? `${v.n} ` : ''}${v.name}`, note: PITCH_NOTE[v.id] || 'No pitch yet',
  })),
  { id: 'other', name: 'Other industries', note: 'Patterns kept from earlier conversations' },
];

/**
 * Which industry a pitch pattern belongs to.
 *
 * Empty, and the Clinics tab is the messages and the presentation — which is
 * what leaves the building. The walk-through that used to sit here was
 * written before there was a deck to walk through.
 */
const PITCH_SEGMENT_OF = {};

let pitchSegment = 'clinics';

function setPitchSegment(id) {
  pitchSegment = PITCH_SEGMENTS.some((s) => s.id === id) ? id : 'clinics';
  renderPitches();
}

/**
 * Who this message is being sent to, or '' for the version with no link.
 *
 * Held here rather than in `state` because it is a property of reading this
 * tab, not of the funnel — moving away and coming back should leave you
 * looking at the message rather than at whoever you last copied it for.
 */
let fmLead = '';

/** The leads this message can be addressed to: the ones that have a link. */
function fmCandidates() {
  return (state.signals?.outreach || []).filter((r) => r.inviteLink);
}

/**
 * The message, filled in for one person.
 *
 * ── Why the link is a token and not an address ────────────────────────────
 *
 * Both messages used to end "Learn more: https://www.svargai.com/". That is
 * the one line in them that cannot do its job as written: a plain address
 * loses the ref, and the ref is the only thing that turns somebody who signs
 * up into an attributed row rather than another anonymous guest. The lead sits
 * in Outreach afterwards looking as though they never replied.
 *
 * So it is {{link}}, filled with that lead's own tracked link — the same
 * token, filled the same way, as the per-lead invite on the funnel.
 *
 * With nobody chosen it falls back to the bare site address, because a message
 * you cannot read until you have picked somebody is a message nobody will
 * read. The block says plainly that the untracked version attributes nothing.
 */
function fmFill(lines, lead) {
  const link = lead?.inviteLink || 'https://www.svargai.com/';
  return lines.map((l) => l
    .replace(/\{\{\s*link\s*\}\}/gi, esc(link))
    // [Name] is the bracket the subtitle tells you to fill. Filled here when
    // we know it, left standing when we do not — never silently blanked.
    .replace(/\[Name\]/g, lead?.name ? esc(lead.name) : '[Name]'));
}

/**
 * The same lines as plain text, for the clipboard.
 *
 * The copy holds HTML entities — &mdash;, &ldquo; — because it is written to
 * be read on this page. Pasting those into WhatsApp sends them literally, so
 * the clipboard gets decoded text and the screen keeps the entities.
 */
function fmPlain(lines) {
  const box = document.createElement('textarea');
  return lines.map((l) => {
    box.innerHTML = String(l).replace(/<[^>]+>/g, '');
    return box.value;
  }).join('\n\n');
}

/** The first message, laid out to be copied rather than read. */
function renderFirstMessage(seg) {
  const o = FIRST_MESSAGE[seg];
  if (!o) return '';
  const people = fmCandidates();
  const lead = people.find((r) => r.id === fmLead) || null;
  const para = (lines) => fmFill(lines, lead).map((l) => `<p>${l}</p>`).join('');

  return `
    <section class="sg-fm">
      <h3 class="sg-fm__title">The first message</h3>
      <p class="sg-fm__sub">Before there is a meeting to pitch in. Send it as written; the
        brackets are the only thing to fill.</p>

      <!--
        Who it is for, which is what makes the link worth anything.

        Choosing somebody fills their name and swaps the bare address for their
        own tracked link, so a signup that follows is attributed to this
        conversation instead of arriving as an anonymous guest.
      -->
      <div class="sg-fm__who">
        <label>Send to
          <select id="sg-fm-lead">
            <option value="">Nobody chosen — untracked link</option>
            ${people.map((r) => `<option value="${esc(r.id)}"${r.id === fmLead ? ' selected' : ''}>
              ${esc(r.name || '(no name)')}${r.company ? ` — ${esc(r.company)}` : ''}</option>`).join('')}
          </select>
        </label>
        <p class="sg-fm__whynote">${lead
          ? `Both messages carry <strong>${esc(lead.name || 'this lead')}</strong>&rsquo;s own link.
             Anyone who signs up through it is attributed to them, which is how they leave Outreach.`
          : people.length
            ? `Nobody chosen, so the messages end in the plain address. It still works &mdash; it
               just attributes nothing, and the lead sits in Outreach afterwards looking as though
               they never replied.`
            : `No lead on a link-sharing motion yet. Add one on the Funnel tab and it can be
               chosen here.`}</p>
      </div>

      <div class="sg-fm__grid">
        <article class="sg-fm__msg">
          <p class="sg-fm__kind">Email</p>
          <p class="sg-fm__subject"><span>Subject</span>${o.subject}</p>
          <div class="sg-fm__body">${para(o.email)}</div>
          <div class="sg-fm__sign">${para(o.sign)}</div>
          <button type="button" class="sg-fm__copy" data-fmcopy="email">Copy email</button>
        </article>

        <article class="sg-fm__msg">
          <p class="sg-fm__kind">WhatsApp or LinkedIn</p>
          <p class="sg-fm__subject"><span>Ends with</span>The link. Nothing after it gets read on a phone.</p>
          <div class="sg-fm__body">${para(o.short)}</div>
          <button type="button" class="sg-fm__copy" data-fmcopy="short">Copy message</button>
        </article>

        ${seg === 'engineering' ? renderOrion() : ''}

        ${seg === 'clinics' ? `
        <article class="sg-fm__msg sg-fm__msg--deck">
          <p class="sg-fm__kind">Presentation</p>
          <p class="sg-fm__subject"><span>When</span>Emailed after the call, or instead of one.</p>
          <div class="sg-fm__body">
            <p>The Recurring Services proposal &mdash; clinics, wellness, gyms, salons.
              Seven slides: a cover, the problem, what it watches, what they would see,
              how it works, what happens to their records, and what it costs.</p>
            <p>The count on slide 2 is read from the running product every time this
              page loads, and every check named beside it is looked up in the
              catalogue first \u2014 so the deck cannot promise something that is
              not there.</p>
            <p><b>Two things the deck no longer says, that you should know.</b></p>
            <p>Meera on slide 3 is an example, not a customer &mdash; say so if asked.
              Her card is two checks today, No Show and Stopped Coming, shown together
              on one customer card with the reason and the next step. The reason and the
              next step are written by the AI service and need the model provider funded;
              without it the card shows the standard wording, labelled as such.</p>
            <p>The problem story on slide 1 is told only with what a booking system holds.
              A phone promise (Promise Not Kept) needs their calls recorded on a phone
              system we read &mdash; do not add it to the story unless they have one.</p>
            <p><b>If a clinic asks exactly what reaches the AI service</b>, the
              slide gives the honest shape and this is the detail behind it.
              Answering a question sends the dataset names and columns with up to
              four example values from each column, for every connected dataset,
              and then up to twenty-five names per group to the step that writes
              the answer. Explaining a customer sends that customer&rsquo;s open
              findings and the records behind them. Reading a call sends the whole recording, then the
              whole transcript. Drafting a follow-up sends that finding\u2019s own
              evidence. Nothing is kept by the provider or by us; the credentials
              to their CRM and phone system never leave their application at all.</p>
            <p>No minimisation is claimed on the slide because none is performed
              \u2014 the catalogue covers every connected dataset, not only the
              ones a question touches. Do not offer it.</p>
          </div>
          <a class="sg-fm__go" href="#sg-deck">Read it below</a>
        </article>

        <!--
          The one-page proposal, as the PDF that was sent: a file, not a page
          drawn here, because what matters is that this is exactly what the
          customer holds. The notes under it are what the page says that the
          product does not, checked against the catalogue on 4 October 2026.
        -->
        <article class="sg-fm__msg sg-fm__msg--deck sg-fm__msg--wide">
          <div class="sg-fm__notes">
          <p class="sg-fm__kind">One-page proposal</p>
          <p class="sg-fm__subject"><span>For</span>Recurring-service businesses &mdash; after the first conversation.</p>
          <div class="sg-fm__body">
            <p>One page, in the Recurring Services framing, with the same example as the email:
              about twenty appointments a month recorded as No Show at the Bengaluru centre, and the
              question it raises &mdash; which of those customers are drifting away. Every check it
              names exists today.</p>
            <p><b>Meera is an example, not a customer.</b> The page says so. Her card is No Show and
              Stopped Coming shown together; the &ldquo;why it matters&rdquo; and the next step are
              written by the AI service, which needs the model provider funded.</p>
            <p><b>&ldquo;Did it work&rdquo;</b> means the finding stopped being true after your team
              marked a step &mdash; here, a new booking she attends. Rupees recovered are not measured
              yet; do not promise a figure.</p>
            <p>The source is <code>docs/proposals/recurring-services-one-page.html</code>; edit it and run
              <code>node scripts/make_one_pager.mjs</code> to rebuild the PDF and this preview. The
              earlier proposal written for The Wellness Co. is
              <a href="proposals/wellness-co-one-page-proposal.pdf" target="_blank" rel="noopener">still here</a>.</p>
          </div>
          <a class="sg-fm__go" href="proposals/recurring-services-one-page-proposal.pdf" target="_blank" rel="noopener">Open the PDF</a>
          <a class="sg-fm__go sg-fm__go--next" href="proposals/recurring-services-one-page-proposal.pdf"
             download="SvargAI_Proposal_Recurring_Services.pdf">Download</a>
          </div>
          <!--
            The page itself, so what is read here is what they hold. An image
            rather than the PDF in a frame: vercel.json sends X-Frame-Options:
            DENY on every path, so a framed PDF draws as an empty box. The
            image is rendered from the same HTML as the PDF.
          -->
          <a class="sg-fm__pdf" href="proposals/recurring-services-one-page-proposal.pdf" target="_blank" rel="noopener">
            <img src="proposals/recurring-services-one-page-proposal.png" loading="lazy"
                 alt="The one-page proposal for recurring-service businesses: your customers show you before they leave.">
          </a>
        </article>` : ''}
      </div>

      ${seg === 'engineering' ? renderEngineeringFirst() : ''}

    </section>`;
}

/*
 * ── The reverse demo for engineering ──────────────────────────────────────
 *
 * Project Orion is an illustration, written before any engineering company
 * has been spoken to — so the card says so, and splits it line by line into
 * what the product can show today and what it cannot.
 *
 * The line that makes it land — 71% done against 86% planned, due in ten
 * days — was not built when this card was first written, and is now: Behind
 * Plan, Milestone At Risk and Over Estimate compare two columns on one row.
 * backend/trunida-backend/scripts/make_orion_demo.mjs writes the files, and
 * __tests__/orionDemo.test.js runs the real watchers on them, so every line
 * in "can" is one the product produces.
 *
 * Two are still not built and stay in "cannot": nothing keeps a history of a
 * date, so "the date was never moved" cannot be shown; and findings are not
 * yet joined into one project. A delivery head shown either who then
 * connects their tracker and does not get it has been sold something.
 */
const ORION = {
  can: [
    ['Firmware integration: 71% done against 86% planned, due in ten days', 'Milestone At Risk'],
    ['164 hours booked against an estimate of 120', 'Over Estimate'],
    ['HIL bench blocked, 25 points behind plan', 'Blocked Work, Behind Plan'],
    ['Customer FAT readiness: nobody assigned', 'Unassigned Work'],
    ['Two high-severity validation items open against firmware', 'counted from the validation log'],
  ],
  cannot: [
    ['The milestone date never moved while the work slipped', 'no history of a date being changed'],
    ['One "Project Orion at risk" joining all of the above', 'findings are not yet joined by project'],
  ],
};

function renderOrion() {
  const row = ([what, how]) => `<li><span>${what}</span><em>${how}</em></li>`;
  return `
        <article class="sg-fm__msg sg-fm__msg--deck">
          <p class="sg-fm__kind">Reverse demo</p>
          <p class="sg-fm__subject"><span>When</span>In the first call, after they describe a slip of their own.</p>
          <div class="sg-fm__body">
            <p><b>Project Orion &mdash; a client account at risk.</b> Seen from where a delivery
              head sits: the client&rsquo;s milestone, the schedule, the hours and the testing,
              each in its own system. What is at stake is the client and the next phase, not the
              project plan. Orion is invented &mdash; say so. It is a picture of the problem, not a
              customer.</p>
          </div>
          <p class="sg-fm__lbl">It can show this today</p>
          <ul class="sg-fm__orion is-yes">${ORION.can.map(row).join('')}</ul>
          <p class="sg-fm__lbl">Not built &mdash; do not show it as working</p>
          <ul class="sg-fm__orion is-no">${ORION.cannot.map(row).join('')}</ul>
          <p class="sg-fm__whynote">The first list is real output: run
            <code>node scripts/make_orion_demo.mjs</code> in the backend and upload the folder on
            the Data page of an engineering application. The second list is what it cannot do
            yet &mdash; ask it as &ldquo;would you want to know this?&rdquo;, not as something
            the product does.</p>
        </article>`;
}

/** Who to write to first, by experiment, and the next batch. */
function renderEngineeringFirst() {
  return `
      <h3 class="sg-fm__title sg-fm__title--next">The first ten</h3>
      <p class="sg-fm__sub">From the researched list, in the order to contact them. Write to the
        COO, Head of Engineering, Delivery Head, PMO head or founder &mdash; not a project
        manager. The goal is not ten sales: it is whether five to eight of them describe the same
        &ldquo;the client found out before we did&rdquo; problem.</p>
      <ol class="sg-fm__ten">
        ${ENGINEERING_FIRST.map(([co, exp, why]) => `
          <li><b>${co}</b><span class="sg-fm__exp">Experiment ${exp}</span><em>${why}</em></li>`).join('')}
      </ol>
      <p class="sg-fm__sub">Next batch: ${ENGINEERING_NEXT.join(' &middot; ')}.</p>`;
}



/* ── The presentation ───────────────────────────────────────────────────────
 *
 * The finalised clinic proposal, as approved. Seven slides, emailed to clinic
 * owners, managers and admin leads who open it with nobody there to explain
 * it — which is why it opens on a cover rather than on a problem, and why
 * every slide states its point in one line before it shows anything.
 *
 * ── What is read rather than written ──────────────────────────────────────
 *
 * The count on slide 3. A deck goes stale the day it is exported and the
 * stale part is always the numbers, so it is counted from the running product
 * on every page load. Every check named beside it is looked up in the live
 * catalogue first, so the deck cannot name something the product does not
 * have. Everything else here is prose and is meant to be.
 *
 * ── Two things a seller should carry in their head ────────────────────────
 *
 * The approved deck drops the "Coming next" panel and the sentence "no
 * message is ever sent to a patient automatically". Both were doing work.
 *
 * Slide 4 draws one card holding an appointment, a phone call, a promise and
 * a missing follow-up. Today that is more than one finding: Promise Not Kept
 * joins the call to the CRM and gives the last two lines; the No Show comes
 * from a different check. Reading several findings as one patient is the
 * piece still being built. The card is the product's intent and a fair
 * picture of where it is going — it is not yet one row on the board, and the
 * gap is worth knowing before somebody asks.
 *
 * And "you control what information is shared and when" is a weaker claim
 * than the one it replaced. "No message is ever sent to a patient
 * automatically" is checkable, structural and true: the application holds no
 * mail credentials. It is the strongest thing on that slide and it is worth
 * saying out loud in the room even though the deck no longer prints it.
 */

/** Filled from /deck. Null until it answers; the deck renders either way. */
let deckFacts = null;

/**
 * What a clinic would call the things SvargAI looks for.
 *
 * Two per group, as approved — a slide a reader takes in at a glance beats a
 * complete list nobody finishes. Each names a real watcher by its catalogue
 * id, and an id the catalogue no longer has is dropped before it is drawn.
 */
/*
 * Retention only, since 7 October 2026: the customers a business is about to
 * lose. The slide used to show every kind of check under a count of the whole
 * catalogue, which sold breadth the ICP says not to sell. Two in each group.
 */
const CLINIC_WATCHERS = [
  { group: 'Retention — drifting away', items: [
    ['stopped-coming', 'Stopped coming mid-course'],
    ['gone-quiet', 'Customer gone quiet'],
  ] },
  { group: 'Retention — warning signs', items: [
    ['no-show', 'Did not turn up'],
    ['repeat-complaint', 'Complained more than once'],
  ] },
  { group: 'Retention — at renewal', items: [
    ['renewal-due', 'Package or plan ending soon'],
    ['expiring-soon', 'Something they bought about to expire'],
  ] },
];

/** The slides. Prose is written here; the one figure comes from deckFacts. */
const DECK = [
  {
    n: '00',
    kicker: 'Sales proposal',
    cover: true,
    /*
     * Recurring Services since 7 October 2026: clinics, wellness, gyms,
     * salons, spas — the customer who drifts away (retention only, 7 October).
     */
    title: 'Your Customers Show You Before They Leave.',
    titleAccent: 'Most Businesses Notice After.',
    sub: 'SvargAI reads the systems you already use to find the customers who are starting to drift away '
      + '— and tells your team who needs attention, why, and what to do next. '
      + 'No new software to learn. No workflows to replace.',
    hub: ['Bookings', 'Packages', 'Phone', 'WhatsApp', 'Payments'],
  },
  {
    n: '01',
    kicker: 'The problem',
    title: 'Your business already has the signals. Nobody is watching them together.',
    sub: 'Nothing here is broken. Every one of these was recorded properly — nobody read them '
      + 'side by side until it was too late.',
    /*
     * Every line is something a booking system already holds, so the story
     * needs no phone recording and no second system to be true.
     */
    caseTitle: 'One customer. One month.',
    case: [
      ['Bookings', 'Customer has come every week for three months.', false],
      ['Bookings', 'Misses an appointment. Recorded as No Show.', false],
      ['Bookings', 'Misses the next one too. No Show again.', false],
      ['Front desk', 'One of twenty No Shows this month. Nobody calls.', true],
    ],
    close: 'Twenty No Shows a month look the same in the records. Some of them are customers about to leave.',
  },
  {
    n: '02',
    kicker: 'What it does',
    title: 'SvargAI Watches Your Customers While Your Team Runs the Business',
    sub: 'For the customers you could lose. Nothing to replace.',
    live: 'watchers',
  },
  {
    n: '03',
    kicker: 'What you see',
    title: 'A short list of customers who need attention.',
    sub: 'Not a dashboard to go and check. An example customer:',
    finding: {
      who: 'Meera Iyer',
      verdict: 'Starting to drift',
      what: [
        ['Visits', 'Came every week for three months', false],
        ['Appointments', 'Did not turn up for the last two', false],
        ['Front desk', 'No call made since', true],
      ],
      why: 'Meera is not just missing an appointment: she came every week, and has now missed two in '
        + 'a row. Next step: call her this week and offer a time to come back.',
      evidence: [
        'Her bookings — weekly for three months, then <b>two No Shows</b> in a row',
        'No follow-up recorded since',
      ],
    },
    close: 'SvargAI shows why each customer was raised, and the next step to take.',
  },
  {
    n: '04',
    kicker: 'How it works',
    title: 'From Signals to Action — Four Steps',
    sub: '',
    ring: [
      ['SvargAI Checks', 'clock'],
      ['It Finds a Customer', 'alert'],
      ['It Explains Why, and What Next', 'page'],
      ['Your Team Decides', 'people'],
    ],
    close: 'Your team makes the final call. SvargAI checks whether it worked.',
  },
  {
    n: '05',
    kicker: 'Privacy and control',
    title: 'Your business keeps control of its data.',
    sub: '',
    /*
     * Every line here was checked against the code before it was written.
     *
     * This is the slide a clinic is right to press hardest on, because the
     * records are patients'. A reassuring sentence nobody verified is worth
     * less than nothing on it: the first one a buyer checks and finds soft is
     * the one that ends the conversation.
     *
     *   encrypted there      connectorService: AES-256-GCM, keyed per
     *                        application by CONNECTOR_ENCRYPTION_KEY
     *   cannot contact       draftService writes and stops; the container
     *                        holds no mail credential at all
     *   never receives       tenantSignalService.normaliseSignal, an
     *                        allow-list that drops anything not named
     *   not kept by us       gatewayController forwards and records tokens;
     *                        transcribeService keeps no audio
     */
    pillars: [
      ['Your systems', 'SvargAI reads only the systems you connect, and stops the moment you disconnect one.'],
      ['Your records', 'Customer records stay in your own application. The logins to your booking system, '
        + 'CRM and phone system are encrypted there, with a key used by no other business.'],
      ['Your customers', 'No message is ever sent to a customer automatically. The application holds no '
        + 'email or messaging login — it cannot contact anyone. That is how it is built, not a setting.'],
      ['Your decisions', 'SvargAI can prepare a follow-up. A person reads it and decides whether to send it.'],
    ],
    /*
     * The disclosure, said in the words it actually deserves.
     *
     * This began as "that information is sent to the AI service that does the
     * work" — true, and hiding a great deal behind "that information". A
     * clinic reading it would not guess it meant patient names and whole
     * recorded conversations, and a clinic that discovers that later stops
     * believing the other three claims on the slide.
     *
     * Traced before it was written, so each line is the code:
     *
     *   names and details   answerService sends up to 25 names per group to
     *                       the writing step, and up to 4 example values per
     *                       column to the planning step
     *   the recording       transcribeService sends the audio itself
     *   the text comes back the transcript is stored in this application,
     *                       nowhere else
     *   not stored          gatewayController forwards and records tokens;
     *                       transcribeService keeps no audio
     *
     * No minimisation is claimed, because none is performed: the catalogue
     * sent at planning time covers every connected dataset, not only the ones
     * a question touches. Saying "only what the question needs" would have
     * been the one sentence here that was not true.
     */
    seen: {
      head: 'What leaves your business, and what does not',
      points: [
        ['We never receive your customer records.',
          'Our platform is told which check ran and how often — never who it was about.'],
        ['To answer a question, or to explain a customer’s findings, customer names and appointment details go to the AI service that does the reading.',
          'It is not stored there, and it is not stored by us.'],
        ['To read a recorded call, the recording itself is sent, and the text that comes back is kept in your own application.',
          'The recording is not kept by the AI service, and not by us.'],
      ],
    },
    note: 'Recording a customer call is your decision. Switch the “this call is being '
      + 'recorded” announcement on in your phone system before you start — that announcement '
      + 'is how a customer consents, and SvargAI cannot set it for you.',
    close: 'Connect what you want. Disconnect what you want. Your team stays in control.',
  },
  {
    n: '06',
    kicker: 'Pricing',
    title: 'Simple pricing, based on how much of your business you want watched.',
    sub: '',
    plans: [
      ['Hobby', '₹0', '', false,
        'For watching a small part of the business.',
        ['1 of 5 areas watched', '1 connected system', 'Checked every day', 'Up to 3 watchers', '1 person']],
      ['Pro', '₹16,999', 'a month', true,
        'For keeping your customers under continuous watch.',
        ['3 of 5 areas watched', '5 connected systems', 'Checked every day', 'Up to 25 watchers', '5 people'],
        'or ₹1,69,990 a year'],
      ['Ultra', '₹49,999', 'a month', false,
        'For watching the business across every area.',
        ['All 5 areas watched', '10 connected systems', 'Checked every hour', 'Up to 100 watchers', 'Unlimited people'],
        'or ₹4,99,990 a year'],
      ['Enterprise', 'Talk to us', '', false,
        'For larger organisations, several teams or more than one location.',
        ['Areas and coverage agreed with you', 'Connected systems as needed',
          'As often as you need', 'Your whole team']],
    ],
    cta: {
      head: 'Want to see which of your customers SvargAI would raise?',
      body: 'Connect one or two existing systems and we’ll show you.',
      where: 'svargai.com',
    },
  },
];

/** The cover's diagram: five systems, one place they meet. */
function deckHub(names) {
  const R = 118;
  const cx = 160;
  const cy = 150;
  const at = (i) => {
    const a = (-90 + (i * 360) / names.length) * (Math.PI / 180);
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  };
  const spokes = names.map((_, i) => {
    const p = at(i);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"
      stroke="rgba(92,197,167,0.32)" stroke-width="1" stroke-dasharray="3 4"/>`;
  }).join('');
  const nodes = names.map((name, i) => {
    const p = at(i);
    const below = p.y > cy + 20;
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7"
        fill="none" stroke="#5CC5A7" stroke-width="1.6"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y + (below ? 24 : -16)).toFixed(1)}"
        text-anchor="middle" fill="rgba(255,255,255,0.62)"
        font-size="11" letter-spacing="1.6">${esc(name.toUpperCase())}</text>`;
  }).join('');
  return `
    <svg class="sg-deck__hub" viewBox="0 0 320 300" role="img"
         aria-label="Five systems — ${esc(names.join(', '))} — meeting in one place">
      <circle cx="${cx}" cy="${cy}" r="86" fill="none" stroke="rgba(92,197,167,0.12)"/>
      <circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="rgba(92,197,167,0.16)"/>
      ${spokes}
      <circle cx="${cx}" cy="${cy}" r="30" fill="rgba(92,197,167,0.12)"/>
      <circle cx="${cx}" cy="${cy}" r="19" fill="#5CC5A7"/>
      <path d="M${cx - 8} ${cy} l6 6 l10 -11" fill="none" stroke="#0d0d0f"
            stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      ${nodes}
    </svg>`;
}

/** The four marks on How it works. Line drawings, nothing decorative. */
const RING_ICON = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 4 3 20h18L12 4z"/><path d="M12 10v4M12 17h.01"/>',
  page: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  people: '<circle cx="8" cy="9" r="2.4"/><circle cx="16" cy="9" r="2.4"/><circle cx="12" cy="7" r="2.4"/>'
    + '<path d="M4 18c1-3 3-4 4-4M20 18c-1-3-3-4-4-4M8.5 18c1-3.5 2-4.5 3.5-4.5s2.5 1 3.5 4.5"/>',
};

/**
 * Slide 02: the count, then what it looks for in a clinic's own words.
 *
 * Every watcher is checked against the live catalogue before it is drawn, so
 * the number and the examples beside it are answers to the same question.
 */
function deckWatchers() {
  const f = deckFacts;
  const known = new Map();
  if (f) {
    for (const a of f.watchers.areas) for (const w of a.watchers) known.set(w.id, w.name);
  }
  const groups = CLINIC_WATCHERS.map((g) => ({
    group: g.group,
    items: g.items.filter(([id]) => !f || known.has(id)).map(([, said]) => said),
  })).filter((g) => g.items.length);
  // Counted from what is drawn, which was checked against the live catalogue
  // above -- the whole catalogue's total would count invoices and suppliers.
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return `
    ${f ? `<p class="sg-deck__count"><b>${shown}</b> retention checks available today</p>
      <p class="sg-deck__countsub">for your clinic — <b>you choose what to watch.</b></p>` : ''}
    <div class="sg-deck__groups">
      ${groups.map((g) => `
        <section>
          <p class="sg-deck__gname">${esc(g.group)}</p>
          <ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        </section>`).join('')}
    </div>`;
}

/** Slide 03: one finding, as it would arrive. */
function deckFinding(fd) {
  return `
    <div class="sg-deck__three">
      <div class="sg-deck__find">
        <p class="sg-deck__findh"><b>${esc(fd.who)}</b><span>${esc(fd.verdict)}</span></p>
        <p class="sg-deck__lbl">What happened</p>
        <ul class="sg-deck__what">
          ${fd.what.map(([where, said, bad]) => `
            <li${bad ? ' class="is-bad"' : ''}><span>${esc(where)}</span><b>${esc(said)}</b></li>`).join('')}
        </ul>
      </div>
      <div>
        <p class="sg-deck__lbl">Why it matters</p>
        <p class="sg-deck__why">${fd.why}</p>
      </div>
      <div>
        <p class="sg-deck__lbl">The evidence behind it</p>
        <ul class="sg-deck__ev">${fd.evidence.map((e) => `<li>${e}</li>`).join('')}</ul>
      </div>
    </div>`;
}

function deckSlide(sl) {
  if (sl.cover) {
    return `
      <article class="sg-deck__slide sg-deck__slide--cover">
        <div>
          <span class="sg-deck__pill">${esc(sl.kicker)}</span>
          <h4 class="sg-deck__cover-title">${esc(sl.title)}<br>
            <em>${esc(sl.titleAccent)}</em></h4>
          <p class="sg-deck__cover-sub">${esc(sl.sub)}</p>
        </div>
        ${deckHub(sl.hub)}
      </article>`;
  }

  let body = '';

  if (sl.case) {
    body += `<p class="sg-deck__caseh">${esc(sl.caseTitle)}</p>
      <ol class="sg-deck__steps">${sl.case.map(([where, said, bad], i) => `
        <li${bad ? ' class="is-bad"' : ''}>
          <span class="sg-deck__chev">${i + 1}</span>
          <p class="sg-deck__where">${esc(where)}</p>
          <p class="sg-deck__said">${esc(said)}</p>
        </li>`).join('')}</ol>`;
  }

  if (sl.live === 'watchers') body += deckWatchers();
  if (sl.finding) body += deckFinding(sl.finding);

  if (sl.ring) {
    body += `<div class="sg-deck__ring">${sl.ring.map(([label, icon], i) => `
      <div${i === sl.ring.length - 1 ? ' class="is-last"' : ''}>
        <span class="sg-deck__disc"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${RING_ICON[icon]}</svg></span>
        <p>${esc(label)}</p>
      </div>`).join('')}</div>`;
  }

  if (sl.pillars) {
    body += `<div class="sg-deck__pillars">${sl.pillars.map(([t, d], i) => `
      <article><span>0${i + 1}</span><b>${esc(t)}</b><p>${esc(d)}</p></article>`).join('')}</div>`;
  }

  if (sl.seen) {
    body += `<div class="sg-deck__seen">
      <p class="sg-deck__lbl">${esc(sl.seen.head)}</p>
      <ul>${sl.seen.points.map(([claim, detail]) => `
        <li><b>${esc(claim)}</b><span>${esc(detail)}</span></li>`).join('')}</ul>
    </div>`;
  }

  if (sl.note) body += `<p class="sg-deck__note">${esc(sl.note)}</p>`;

  if (sl.plans) {
    body += `<div class="sg-deck__plans">${sl.plans.map(([name, price, per, on, who, has, year]) => `
      <article${on ? ' class="is-on"' : ''}>
        <p class="sg-deck__pname">${esc(name)}</p>
        <p class="sg-deck__price">${esc(price)}${per ? `<span>${esc(per)}</span>` : ''}</p>
        ${year ? `<p class="sg-deck__year">${esc(year)}</p>` : ''}
        <p class="sg-deck__pwho">${esc(who)}</p>
        <ul>${has.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      </article>`).join('')}</div>
      <div class="sg-deck__cta">
        <div>
          <p class="sg-deck__ctah">${esc(sl.cta.head)}</p>
          <p class="sg-deck__ctab">${esc(sl.cta.body)}</p>
        </div>
        <span class="sg-deck__ctaw">${esc(sl.cta.where)}</span>
      </div>`;
  }

  if (sl.close) body += `<p class="sg-deck__close">${esc(sl.close)}</p>`;

  return `
    <article class="sg-deck__slide">
      <header><span class="sg-deck__pill">${esc(sl.kicker)}</span></header>
      <h4 class="sg-deck__title">${esc(sl.title)}</h4>
      ${sl.sub ? `<p class="sg-deck__sub">${esc(sl.sub)}</p>` : ''}
      ${body}
    </article>`;
}

/**
 * The deck, drawn from the slides above and whatever /deck has answered with.
 *
 * Drawn before the figure arrives and again after, so a slow answer shows a
 * deck missing one line rather than an empty panel. Nothing here waits.
 */
function renderDeck() {
  const el = document.getElementById('sg-deck');
  if (!el) return;
  el.innerHTML = `
    <section class="sg-deck">
      <h3 class="sg-deck__h">The presentation</h3>
      <p class="sg-deck__s">The finalised clinic proposal. Seven slides, emailed to a clinic owner
        who opens it with nobody there to explain it. The count on slide 2 is read from the running
        product each time this page loads, and every check named beside it is looked up in the
        catalogue first — so the deck cannot promise something that is not there.</p>
      ${DECK.map(deckSlide).join('')}
    </section>`;
}

/** Ask once per page load; the deck redraws itself when the answer lands. */
function loadDeckFacts() {
  if (deckFacts) { renderDeck(); return; }
  api('/deck')
    .then((f) => { deckFacts = f; renderDeck(); })
    .catch(() => { renderDeck(); });
}

/*
 * Pitches, by industry.
 *
 * One industry is being worked at a time — Clinics & Wellness, which is where
 * the interviews and the only full column of evidence are. The patterns from
 * earlier conversations are not deleted for that: they cost real meetings to
 * learn, and an academy that walks in next month should not find an empty
 * screen. They move one click away, under their own heading.
 */
function renderPitches() {
  const el = document.getElementById('sg-pitches');
  if (!el) return;

  const mine = PITCHES.filter((p) => (PITCH_SEGMENT_OF[p.id] || 'other') === pitchSegment);

  el.innerHTML = `
    ${[['B2C', 'B2C &mdash; by customer relationship'], ['B2B', 'B2B'], ['', 'Earlier conversations']].map(([g, title]) => `
    <p class="sg-seg__group">${title}</p>
    <div class="sg-seg" role="tablist" aria-label="${title}">
      ${PITCH_SEGMENTS.filter((s) => (s.group || '') === g).map((s) => `
        <button type="button" class="sg-seg__b${s.id === pitchSegment ? ' is-on' : ''}"
                data-seg="${s.id}" aria-selected="${s.id === pitchSegment}">
          ${s.name}<span>${s.note}</span>
        </button>`).join('')}
    </div>`).join('')}

    ${renderFirstMessage(pitchSegment) || (pitchSegment === 'other' ? '' : `
    <p class="sg-fm__sub sg-pitch__none">No first message for this category yet. It is written after the
      first interviews here, in the words those customers used &mdash; not before. The draft hypothesis
      is on the Target Audience tab.</p>`)}

    <div class="sg-pitches">${mine.map(renderPitch).join('')}</div>

    ${pitchSegment === 'clinics' ? '<div id="sg-deck"></div>' : ''}`;

  // The clinic deck, on the clinic tab only: it is a clinic proposal, and it
  // used to draw under every industry, including this one's engineering tab.
  // Drawn immediately from what is already known, and again when /deck answers.
  if (pitchSegment === 'clinics') loadDeckFacts();

  // Wired once: the panel outlives every redraw, and a second listener per
  // redraw would switch the segment twice per click.
  if (!el.dataset.segWired) {
    el.dataset.segWired = '1';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-seg]');
      if (b) setPitchSegment(b.dataset.seg);
    });
  }

  // Choosing somebody re-renders both messages with their name and link.
  const who = el.querySelector('#sg-fm-lead');
  if (who) {
    who.addEventListener('change', () => { fmLead = who.value; renderPitches(); });
  }

  /*
   * Copy the message, not the markup.
   *
   * Decoded here rather than on screen: the copy is written with entities so
   * it reads correctly on this page, and pasting &mdash; into WhatsApp sends
   * it literally. The lead is resolved again at click time so the clipboard
   * can never hold a link for somebody other than the one on screen.
   */
  el.querySelectorAll('[data-fmcopy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const o = FIRST_MESSAGE[pitchSegment];
      if (!o) return;
      const lead = fmCandidates().find((r) => r.id === fmLead) || null;
      const which = btn.dataset.fmcopy;
      const lines = which === 'email'
        ? [...fmFill(o.email, lead), '', ...fmFill(o.sign, lead)]
        : fmFill(o.short, lead);
      const text = fmPlain(lines);
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = lead ? `Copied for ${lead.name || 'them'}` : 'Copied — untracked';
      } catch {
        // A clipboard the browser refuses is not a copy. Say so rather than
        // claiming one that did not happen.
        banner('The browser refused the clipboard. Select the text above and copy it.');
        btn.textContent = 'Could not copy';
      }
      setTimeout(() => { btn.textContent = original; }, 2500);
    });
  });
}
