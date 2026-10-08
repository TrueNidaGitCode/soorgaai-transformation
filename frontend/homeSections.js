/**
 * Svarg — Home page sections below the hero
 * (design_handoff_landing_page: Who it's for, AI agents, Your own system,
 * Partners). Plain DOM, no framework: each section owns one wire* function,
 * and every timer respects prefers-reduced-motion.
 *
 * The watcher wording on the rule cards and in the console is taken from
 * backend/trunida-backend/eame-template/services/agentCatalogue.js — the
 * page shows rules the product actually runs, phrased for a reader.
 */

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Icons (Lucide 0.460, inlined so the page needs no icon font) ───────
const ICONS = {
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'mail': '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  'ticket': '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  'lock': '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'calendar-clock': '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  'message-square-warning': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v2"/><path d="M12 13h.01"/>',
  'eye': '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  'list-checks': '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  'repeat': '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  'app-window': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 4v4"/><path d="M2 8h20"/><path d="M6 4v4"/>',
  'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  'key-round': '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-.76c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
};

const ico = (name) =>
  `<svg class="lh-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fillIcons(root = document) {
  root.querySelectorAll('i[data-ico]').forEach((el) => { el.outerHTML = ico(el.dataset.ico); });
}

// Pills: red for the urgent, amber for the watch-list, teal for fine.
function tone(v) {
  if (/High|Raised 3|late|\+ Gone/.test(v)) return 'high';
  if (/Watch|Raised 2|No reply|^Renewal Due$|days$/.test(v)) return 'watch';
  return 'ok';
}
const pill = (v) => `<span class="lh-pill lh-pill--${tone(v)}"><span></span>${esc(v)}</span>`;

// "[Account] in [Activity log] …" → text with bordered field tokens.
const ruleHtml = (s) => s.split(/(\[[^\]]+\])/).filter(Boolean)
  .map((t) => (t.startsWith('[') ? `<span class="lh-token">${esc(t.slice(1, -1))}</span>` : esc(t))).join('');

// ── 2. Who it's for ───────────────────────────────────────────────────
const CHIPS = [
  { label: 'Going Quiet', icon: 'moon', sub: 'Find customers who’ve stopped engaging, before they leave.',
    tableTitle: 'Svarg · Going quiet', tableMeta: 'From CRM, Product, Billing, Support',
    cols: '1.5fr 1fr .9fr .8fr 1.9fr .9fr .9fr', headers: ['Account', 'Owner', 'Last activity', 'Source', 'Signals', 'Usage trend', 'Risk'], hl: 6,
    rows: [['Northwind Logistics', 'Sam Ortiz', '34 days', 'CRM', 'No reply to last 2 emails', '−41%', 'High'], ['Brightline Retail', 'Ana Lee', '22 days', 'Support', 'Last ticket closed unhappy', '−18%', 'Watch'], ['Copperleaf Studio', 'Raj Patel', '3 days', 'Product', 'Weekly logins steady', '+6%', 'OK'], ['Harbor & Finch', 'Sam Ortiz', '41 days', 'Billing', 'Card update ignored', '−52%', 'High'], ['Meridian Health Co.', 'Ana Lee', '15 days', 'CRM', 'Skipped quarterly review', '−12%', 'Watch'], ['Tallgrass Foods', 'Raj Patel', '2 days', 'Product', 'New seats added', '+14%', 'OK']],
    ruleTitle: 'Agent: Gone Quiet', rules: [{ name: 'Gone Quiet', text: '[Account] in [Activity log] who used to be active weekly and have had no [Activity date] for 3× their usual gap.' }],
    outHeaders: ['Account', 'Risk', 'Next step'], outCols: '1.3fr .8fr 1.2fr', outPill: 1,
    outRows: [['Northwind Logistics', 'High', 'Call owner today'], ['Harbor & Finch', 'High', 'Call owner today'], ['Brightline Retail', 'Watch', 'Check-in email'], ['Copperleaf Studio', 'OK', 'No action']] },
  { label: 'Renewals at Risk', icon: 'calendar-clock', sub: 'Know which renewals need attention while there’s still time.',
    tableTitle: 'Svarg · Renewals', tableMeta: 'From Billing, CRM, Support',
    cols: '1.5fr .8fr .9fr .8fr .9fr 1fr 1.6fr', headers: ['Account', 'Plan', 'Renewal date', 'Seats used', 'Open tickets', 'Last contact', 'Flagged by'], hl: 6,
    rows: [['Brightline Retail', 'Growth', 'Oct 14', '18 / 40', '3', '26 days ago', 'Renewal Due + Gone Quiet'], ['Northwind Logistics', 'Scale', 'Oct 18', '72 / 80', '0', '5 days ago', 'Renewal Due'], ['Harbor & Finch', 'Starter', 'Oct 19', '4 / 10', '2', '41 days ago', 'Renewal Due + Gone Quiet'], ['Meridian Health Co.', 'Scale', 'Oct 20', '51 / 80', '1', '9 days ago', 'Renewal Due'], ['Copperleaf Studio', 'Growth', 'Nov 30', '36 / 40', '1', '3 days ago', '—'], ['Tallgrass Foods', 'Growth', 'Jan 12', '40 / 40', '0', '2 days ago', '—']],
    // Two agents pointing at one account — not a combined "health" score,
    // which no single agent computes today.
    ruleTitle: 'Two agents on each account', rules: [{ name: 'Renewal Due', text: 'Rows in [Subscriptions] whose [Renewal date] falls in the next 14 days.' }, { name: 'Gone Quiet', text: 'The same [Account] has had no [Activity date] for 3× its usual gap.' }],
    outHeaders: ['Account', 'Days to renewal', 'Flagged by'], outCols: '1.2fr .8fr 1.5fr', outPill: 2,
    outRows: [['Brightline Retail', '7 days', 'Renewal Due + Gone Quiet'], ['Northwind Logistics', '11 days', 'Renewal Due'], ['Harbor & Finch', '12 days', 'Renewal Due + Gone Quiet'], ['Meridian Health Co.', '13 days', 'Renewal Due']] },
  { label: 'Unresolved Issues', icon: 'message-square-warning', sub: 'Catch complaints and requests your team hasn’t closed.',
    tableTitle: 'Svarg · Open issues', tableMeta: 'From Support, Email, CRM',
    cols: '1.4fr 1fr 1.5fr .9fr .9fr 1fr 1.4fr', headers: ['Account', 'Contact', 'Issue', 'Times raised', 'Promised by', 'Status', 'Flag'], hl: 6,
    rows: [['Brightline Retail', 'J. Moreno', 'Invoice amount wrong', '3', '—', 'Open', 'Raised 3×'], ['Northwind Logistics', 'K. Adams', 'Export not working', '1', '—', 'Awaiting reply', 'No reply 4 days'], ['Meridian Health Co.', 'L. Chen', 'Custom report', '1', 'Sep 28', 'In progress', 'Promise 9 days late'], ['Harbor & Finch', 'D. Shah', 'Can’t log in', '2', '—', 'Open', 'Raised 2×'], ['Copperleaf Studio', 'P. Wu', 'Add new user', '1', 'Oct 9', 'In progress', 'On track'], ['Tallgrass Foods', 'M. Reyes', 'Training session', '1', 'Oct 15', 'Scheduled', 'On track']],
    ruleTitle: 'Three agents', rules: [{ name: 'Repeat Complaint', text: '[Contact] appearing more than once in [Tickets].' }, { name: 'Unanswered Enquiry', text: 'No [Reply] after 2 days.' }, { name: 'Promise Overdue', text: 'Past [Due date] and not [Status] done.' }],
    outHeaders: ['Account', 'Flag'], outCols: '1fr 1fr', outPill: 1,
    outRows: [['Brightline Retail', 'Raised 3×'], ['Northwind Logistics', 'No reply 4 days'], ['Meridian Health Co.', 'Promise 9 days late'], ['Harbor & Finch', 'Raised 2×']] },
];

const CHIP_MS = 6000;
const CHIP_FADE_MS = 260;

function renderChip(c) {
  const markCrop = '<span class="lh-markcrop lh-markcrop--sm"><img src="assets/logo-nav.png" alt=""></span>';
  const head = c.headers.map((h, k) => `<div class="lh-tbl__th${k === c.hl ? ' is-hl' : ''}">${esc(h)}</div>`).join('');
  const rows = c.rows.map((r, i) => `<div class="lh-tbl__tr" style="grid-template-columns:${c.cols};--d:${(0.08 + i * 0.05).toFixed(2)}s">${
    r.map((v, k) => (k === c.hl
      ? `<div class="lh-tbl__td is-hl">${pill(v)}</div>`
      : `<div class="lh-tbl__td${k === 0 ? ' is-key' : ''}"><span>${esc(v)}</span></div>`)).join('')}</div>`).join('');
  document.getElementById('cs-table').innerHTML = `
    <div class="lh-tbl__bar">${markCrop}<span class="lh-tbl__title">${esc(c.tableTitle)}</span><span class="lh-tbl__meta">${esc(c.tableMeta)}</span><span class="lh-tbl__live"><span></span>Live</span></div>
    <div class="lh-tbl__head" style="grid-template-columns:${c.cols}">${head}</div>
    <div class="lh-tbl__body">${rows}<div class="lh-tbl__fade"></div></div>`;

  document.getElementById('cs-rule').innerHTML = `
    <div class="lh-card__head"><span class="lh-card__icon">${ico('eye')}</span><span>${esc(c.ruleTitle)}</span></div>
    <div class="lh-rules">${c.rules.map((r) => `<div><p class="lh-rule__name">${esc(r.name)}</p><p class="lh-rule__text">${ruleHtml(r.text)}</p></div>`).join('')}</div>`;

  const outHead = c.outHeaders.map((h) => `<div>${esc(h)}</div>`).join('');
  const outRows = c.outRows.map((r) => `<div class="lh-out__tr" style="grid-template-columns:${c.outCols}">${
    r.map((v, k) => (k === c.outPill ? `<div>${pill(v)}</div>` : `<div class="${k === 0 ? 'is-key' : ''}">${esc(v)}</div>`)).join('')}</div>`).join('');
  document.getElementById('cs-out').innerHTML = `
    <div class="lh-card__head"><span class="lh-card__icon">${ico('list-checks')}</span><span>Sample outputs</span></div>
    <div class="lh-out__th" style="grid-template-columns:${c.outCols}">${outHead}</div>${outRows}`;

  document.getElementById('cs-sub').textContent = c.sub;
}

export function wireWhoItsFor() {
  const chipsEl = document.getElementById('cs-chips');
  const stage = document.getElementById('cs-stage');
  const panel = document.getElementById('cs-panel');
  const sub = document.getElementById('cs-sub');
  if (!chipsEl || !stage) return;

  chipsEl.innerHTML = CHIPS.map((c, k) =>
    `<button type="button" class="lh-chip" data-k="${k}" aria-pressed="${k === 0}">${ico(c.icon)}${esc(c.label)}<span class="lh-chip__bar"></span></button>`).join('');
  const chips = [...chipsEl.querySelectorAll('.lh-chip')];

  let current = 0;
  let elapsed = 0;
  let paused = false;
  let fading = false;
  renderChip(CHIPS[0]);

  const setBar = () => chips.forEach((b, k) => {
    b.querySelector('.lh-chip__bar').style.width = k === current ? `${(elapsed / CHIP_MS) * 100}%` : '0%';
  });

  function pick(k) {
    elapsed = 0;
    if (k === current) { setBar(); return; }
    chips.forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
    current = k;
    if (REDUCED()) { renderChip(CHIPS[k]); setBar(); return; }
    fading = true;
    stage.dataset.state = 'out';
    sub.classList.add('is-out');
    setBar();
    setTimeout(() => {
      renderChip(CHIPS[k]);
      void stage.offsetWidth; // let the new rows start from their "out" pose
      stage.dataset.state = 'in';
      sub.classList.remove('is-out');
      fading = false;
    }, CHIP_FADE_MS);
  }

  chips.forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.k))));
  panel.addEventListener('mouseenter', () => { paused = true; });
  panel.addEventListener('mouseleave', () => { paused = false; });
  chipsEl.addEventListener('focusin', () => { paused = true; });
  chipsEl.addEventListener('focusout', () => { paused = false; });

  if (REDUCED()) return; // no auto-advance; chips still switch on click
  setInterval(() => {
    if (paused || fading || document.hidden) return;
    elapsed += 100;
    if (elapsed >= CHIP_MS) pick((current + 1) % CHIPS.length);
    else setBar();
  }, 100);
}

// ── 3. AI agents console ──────────────────────────────────────────────
const AGENTS = [
  { name: 'Gone Quiet', icon: 'moon', rule: 'No activity for 3× their usual gap', src: 'CRM', n: 3,
    records: [['Northwind Logistics', 'last login 34 days ago', 'CRM', 'Oct 6'], ['Harbor & Finch', 'no reply to last 2 emails', 'Email', 'Oct 5'], ['Brightline Retail', 'missed check-in call', 'Calls', 'Sep 30']] },
  { name: 'Renewal Due', icon: 'calendar-clock', rule: 'Renewal date in the next 14 days', src: 'CRM', n: 4,
    records: [['Brightline Retail', 'renews Oct 14, 18 of 40 seats used', 'CRM', 'Oct 7'], ['Northwind Logistics', 'renews Oct 18', 'CRM', 'Oct 7'], ['Meridian Health Co.', 'renewal reminder unopened', 'Email', 'Oct 3']] },
  { name: 'Unanswered Enquiry', icon: 'mail', rule: 'No reply after 2 days', src: 'Email', n: 3,
    records: [['Northwind Logistics', 'export question, 4 days unanswered', 'Email', 'Oct 3'], ['Tallgrass Foods', 'pricing question, 3 days', 'Email', 'Oct 4'], ['Copperleaf Studio', 'callback request not returned', 'Calls', 'Oct 5']] },
  { name: 'Repeat Complaint', icon: 'repeat', rule: 'Same contact raising the issue more than once', src: 'Calls', n: 2,
    records: [['Brightline Retail', 'invoice issue, raised 3rd time', 'Calls', 'Oct 6'], ['Harbor & Finch', 'login issue, raised 2nd time', 'Email', 'Oct 2']] },
];
const AGENT_MS = 2500;
const AGENT_READ_MS = 1000;

export function wireAgentConsole() {
  const list = document.getElementById('agent-list');
  if (!list) return;

  list.innerHTML = AGENTS.map((g) => `
    <div class="lh-agent">
      <div class="lh-agent__row">
        <span class="lh-agent__icon">${ico(g.icon)}</span>
        <div class="lh-agent__text"><p class="lh-agent__name">${esc(g.name)}</p><p class="lh-agent__rule">${esc(g.rule)}</p></div>
        <span class="lh-agent__status"><span></span><b>${g.n} found</b></span>
      </div>
      <div class="lh-agent__drawer"><div class="lh-agent__records">
        <p class="lh-agent__rec-h">Records it read</p>
        ${g.records.map(([acc, det, src, date]) => `<div class="lh-agent__rec"><span class="lh-agent__rec-t"><b>${esc(acc)}</b> · ${esc(det)}</span><span class="lh-agent__src">${esc(src)}</span><span class="lh-agent__date">${esc(date)}</span></div>`).join('')}
      </div></div>
    </div>`).join('');

  const rows = [...list.querySelectorAll('.lh-agent')];
  const show = (k, reading) => rows.forEach((el, i) => {
    const on = i === k;
    el.classList.toggle('is-on', on);
    el.classList.toggle('is-reading', on && reading);
    el.querySelector('.lh-agent__status b').textContent = on && reading ? `Reading ${AGENTS[i].src}…` : `${AGENTS[i].n} found`;
  });

  show(0, false);
  // Phones and reduced motion: row 1 stays open, nothing moves.
  if (REDUCED() || window.matchMedia('(max-width: 767px)').matches) return;

  let active = 0;
  const cycle = () => {
    if (document.hidden) return;
    show(active, true);
    setTimeout(() => show(active, false), AGENT_READ_MS);
  };
  cycle();
  setInterval(() => { active = (active + 1) % AGENTS.length; cycle(); }, AGENT_MS);
}

// ── 4. Your own system: the robot build ───────────────────────────────
const BRICKS = [
  ['Cob', 'Plan', 'Maps your workflow and key signals', '#2dd4bf'],
  // Aria chooses and runs the model, Arth connects the data: the order and
  // names the app has used since 11 September 2026.
  ['Aria', 'Run', 'The model and infrastructure, ready', '#22d3ee'],
  ['Arth', 'Connect', 'Connects your data where it already lives', '#34d399'],
  ['Eame', 'Build', 'Your application and its AI agents', '#5eead4'],
  ['Yusu', 'Fit in', 'Plugs into the tools you already use', '#67e8f9'],
];
const BUILD_STEPS = 26;      // 5 bricks × 5 moves, then "ready"
const BUILD_STEP_MS = 440;
const BUILD_START_MS = 600;
const STACK_TOP = [426, 362, 298, 234, 170]; // final y of each brick, Cob at the bottom
const SHELF_X = 1050;
const STACK_X = 520;
const SCENE_W = 1312;

const brickHtml = ([name, role, desc, color], studs) => `
  <div class="lh-brick" style="--c:${color}">
    <div class="lh-brick__studs">${'<span></span>'.repeat(studs)}</div>
    <span class="lh-brick__name">${esc(name)}</span>
    <span class="lh-brick__role">${esc(role)}</span>
    <span class="lh-brick__desc">${esc(desc)}</span>
  </div>`;

// Where everything sits at a given step — a straight port of the design's
// state machine: lower to the shelf, grab, lift, travel, lower, release.
function buildPose(step) {
  let rx = SHELF_X; let arm = 30; let carry = -1; let pad = 0; let placed = 0;
  if (step >= 1) {
    const i = Math.min(4, Math.floor((step - 1) / 5));
    const k = (step - 1) - i * 5;
    placed = i; pad = i;
    if (step >= BUILD_STEPS) { placed = 5; pad = -1; }
    else if (k === 0) { arm = 152; }
    else if (k === 1) { arm = 30; carry = i; pad = -1; }
    else if (k === 2) { rx = STACK_X; carry = i; pad = -1; }
    else if (k === 3) { rx = STACK_X; arm = STACK_TOP[i] - 90; carry = i; pad = -1; }
    else { placed = i + 1; pad = i + 1 < 5 ? i + 1 : -1; }
  }
  return { rx, arm, carry, pad, placed };
}

export function wireBuildScene() {
  const fit = document.getElementById('build-fit');
  const scene = document.getElementById('build-scene');
  const mobileBricks = document.getElementById('build-bricks-m');
  if (mobileBricks) mobileBricks.innerHTML = BRICKS.map((b) => brickHtml(b, 6)).join('');
  if (!fit || !scene) return;

  const bricksEl = document.getElementById('build-bricks');
  bricksEl.innerHTML = BRICKS.map((b) => brickHtml(b, 8)).join('');
  const bricks = [...bricksEl.children];
  const robot = document.getElementById('build-robot');
  const arm = document.getElementById('robot-arm');
  const claw = document.getElementById('robot-claw');
  const status = document.getElementById('build-status');
  const frame = document.getElementById('build-frame');
  const links = document.getElementById('build-links');

  // Scale the fixed canvas to its column, like the hero diagram.
  const rescale = () => fit.style.setProperty('--lh-build-scale', Math.min(1, fit.clientWidth / SCENE_W).toFixed(4));
  rescale();
  if ('ResizeObserver' in window) new ResizeObserver(rescale).observe(fit);
  else window.addEventListener('resize', rescale);

  function apply(step) {
    const { rx, arm: a, carry, pad, placed } = buildPose(step);
    bricks.forEach((el, i) => {
      let left = 790; let top = 242; let op = 0; let z = 1;
      if (i < placed) { left = STACK_X - 260; top = STACK_TOP[i]; op = 1; }
      else if (i === carry) { left = rx - 260; top = 80 + a + 19; op = 1; z = 5; }
      else if (i === pad) { op = 1; }
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.opacity = op;
      el.style.zIndex = z;
      el.classList.toggle('is-carried', i === carry);
    });
    robot.style.left = `${rx}px`;
    robot.classList.toggle('is-done', step >= BUILD_STEPS);
    arm.style.height = `${a}px`;
    claw.style.top = `${54 + a}px`;
    claw.classList.toggle('is-gripping', carry >= 0);
    links.classList.toggle('is-on', step >= 1);
    scene.classList.toggle('is-done', step >= BUILD_STEPS);
    frame.classList.toggle('is-on', step >= BUILD_STEPS);
    if (step === 0) status.textContent = 'Svarg agent · ready to build your app';
    else if (step >= BUILD_STEPS) status.textContent = 'Your retention app is ready';
    else {
      const b = BRICKS[Math.min(4, Math.floor((step - 1) / 5))];
      status.textContent = `Placing ${b[0]} · ${b[2]}`;
    }
  }

  if (REDUCED()) { scene.classList.add('is-static'); apply(BUILD_STEPS); return; }
  apply(0);

  // Plays once. Three triggers, whichever comes first: the observer, a
  // scroll check (some embedded browsers never fire the observer), and a
  // fallback if the section is already on screen at load.
  let built = false;
  const run = () => {
    if (built) return;
    built = true;
    for (let i = 0; i < BUILD_STEPS; i++) setTimeout(() => apply(i + 1), BUILD_START_MS + i * BUILD_STEP_MS);
  };
  const inView = () => {
    const r = fit.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    return r.top < vh * 0.75 && r.bottom > vh * 0.25;
  };
  const onScroll = () => { if (!built && inView()) { run(); window.removeEventListener('scroll', onScroll); } };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { run(); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(fit);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  setTimeout(onScroll, 1500);
}

// ── 5. Partners: dashes flow into the node once ───────────────────────
export function wirePartners() {
  const band = document.getElementById('partners');
  if (!band) return;
  if (REDUCED() || !('IntersectionObserver' in window)) { band.classList.add('is-on', 'is-static'); return; }
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { band.classList.add('is-on'); io.disconnect(); }
  }, { threshold: 0.3 });
  io.observe(band);
}

export function initHomeSections() {
  fillIcons();
  wireWhoItsFor();
  wireAgentConsole();
  wireBuildScene();
  wirePartners();
}
