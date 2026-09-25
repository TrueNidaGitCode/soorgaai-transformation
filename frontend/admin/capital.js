/**
 * Svarg — Capital
 *
 * The investor deck, as a page, with the proof slide reading from the live
 * databases instead of from whatever was true the day it was typed.
 *
 * ── Why the numbers are fetched ────────────────────────────────────────────
 *
 * Every figure here was hand-typed once, from a query run once. That is
 * honest for a day and a lie by the end of the month: watchers keep running,
 * findings keep being raised and resolved, and a deck that says 285 when the
 * database says 400 has stopped being evidence and become decoration. So the
 * page asks — GET /api/admin/capital/proof — and prints what comes back, with
 * the timestamp it was measured at.
 *
 * ── What the deck claims, and what this admin copy adds ───────────────────
 *
 * The slides are the deck's own words. One thing is added that the deck
 * cannot carry, because this copy is read by the people building the thing
 * rather than by an investor: where a claim on a slide is ahead of what is
 * built, or ahead of what has been validated, it is marked. Two of the five
 * verbs on the solution slide are not built the way the slide implies, and
 * the beachhead on slide 05 is not the industry the sales pages are actually
 * interviewing. Both are said here rather than discovered in a room.
 */

const API_BASE = window.CONFIG.API_BASE;

/** Filled by the one request this page makes. */
let proof = null;
let proofError = '';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-GB') : '—');
const money = (n) => (typeof n === 'number' ? '$' + (n < 1 ? n.toFixed(2) : n.toFixed(0)) : '—');

/* ── The deck ───────────────────────────────────────────────────────────────
 *
 * Eleven slides, in the deck's order and its words. Each renders itself; the
 * proof slide is the only one that waits for data.
 */

function slide(n, kicker, body, opts = {}) {
  return `
    <section class="ck-slide${opts.cover ? ' ck-slide--cover' : ''}">
      <header class="ck-slide__head">
        <span class="ck-slide__n">${n}</span>
        <span class="ck-slide__k">${kicker}</span>
      </header>
      ${body}
    </section>`;
}

/** A claim that is ahead of what exists. Admin copy only. */
function flag(text) {
  return `<p class="ck-flag"><span>Not on the investor copy</span>${text}</p>`;
}

function cover() {
  return slide('SVARGAI &middot; PRE-SEED', '2026', `
    <div class="ck-cover">
      <p class="ck-logo">svarg</p>
      <h1 class="ck-h1">AI agents that find problems<br>before they become costly</h1>
      <p class="ck-lede"><em>Multiple AI agents.</em> / <em>Your existing data.</em> / <em>Earlier action.</em></p>
      <p class="ck-sub">Detect emerging problems across your existing systems &mdash; before they
        turn into delays, leakage or lost revenue.</p>
    </div>`, { cover: true });
}

function problem() {
  const chips = ['Schedules', 'Tasks', 'Resources', 'Dependencies', 'Approvals', 'Changes', 'Execution updates'];
  const costs = [['Schedule delays', 'Idle resources'], ['Rework', 'Overtime'], ['Missed milestones', 'Cost overruns']];
  return slide('01', 'The problem', `
    <h2 class="ck-h2">Important problems are discovered too late</h2>
    <ol class="ck-chain">
      <li>Small signals</li><li>Emerging problem</li><li>Late discovery</li>
      <li class="is-bad">Costly outcome</li>
    </ol>
    <div class="ck-two">
      <div>
        <p class="ck-strong">Engineering teams already have the data.</p>
        <p class="ck-chips">${chips.map((c) => `<span>${c}</span>`).join('')}</p>
        <p class="ck-body">But these signals live across different systems and workflows. A project
          can still look &ldquo;on track&rdquo; while the signals of a future delay are already there.</p>
        <p class="ck-quote"><b>The problem isn&rsquo;t lack of data.</b><br>
          <em>It&rsquo;s that nobody continuously connects the signals.</em></p>
      </div>
      <div class="ck-panel">
        <p class="ck-eyebrow">For engineering teams, this can mean</p>
        <table class="ck-grid2"><tbody>
          ${costs.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}
        </tbody></table>
        <p class="ck-accent">The earlier the problem is detected, the more options the team has to act.</p>
      </div>
    </div>`);
}

/**
 * The five verbs, with what is behind each.
 *
 * `built` is the admin annotation: the deck says all five, and three of them
 * run today. Act drafts and stops — the application holds no mail credentials
 * — and Learn is not built at all.
 */
const STEPS = [
  ['01', 'Observe', 'Connect existing systems and data.', 'yes'],
  ['02', 'Detect', 'Identify unusual changes, patterns and combinations of signals.', 'yes'],
  ['03', 'Understand', 'Determine what problem may be emerging and why.', 'part'],
  ['04', 'Act', 'Bring it to the person who can intervene.', 'part'],
  ['05', 'Learn', 'Measure the outcome and improve detection.', 'no'],
];

function solution() {
  const LABEL = { yes: 'runs today', part: 'partly built', no: 'not built' };
  return slide('02', 'The solution', `
    <h2 class="ck-h2">SvargAI continuously looks for what is starting to go wrong</h2>
    <p class="ck-body ck-body--wide">SvargAI runs multiple AI agents on top of the data and systems
      you already use. <b>Each agent watches a different set of signals.</b></p>
    <ol class="ck-steps">
      ${STEPS.map(([n, name, what, state], i) => `
        <li class="ck-step is-${state}${i === STEPS.length - 1 ? ' is-last' : ''}">
          <p class="ck-step__n">${n}</p>
          <p class="ck-step__name">${name}</p>
          <p class="ck-step__what">${what}</p>
          <p class="ck-step__state">${LABEL[state]}</p>
        </li>`).join('')}
    </ol>
    <p class="ck-accent">&#8635; Every outcome feeds back into detection.</p>
    ${flag('Three of the five run today. <b>Act</b> writes the follow-up and stops &mdash; a person '
      + 'sends it, because the application holds no mail credentials by design. <b>Learn</b> is not '
      + 'built: findings are diffed into new, still true and resolved, but nothing changes its own '
      + 'behaviour from that yet. Demonstrate the three; sell the other two with a date.')}`);
}

function practice() {
  const agents = [
    ['Schedule Agent', 'Tracks planned vs actual progress'],
    ['Dependency Agent', 'Identifies downstream impact'],
    ['Resource Agent', 'Watches resource availability'],
    ['Change Agent', 'Tracks changes affecting delivery'],
    ['Execution Agent', 'Looks at actual project activity'],
  ];
  return slide('03', 'The solution in practice', `
    <h2 class="ck-h2">Example: engineering schedule</h2>
    <div class="ck-two">
      <table class="ck-rows"><tbody>
        ${agents.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}
      </tbody></table>
      <div class="ck-panel ck-panel--lit">
        <p class="ck-eyebrow">Together</p>
        <p class="ck-said">&ldquo;The project is currently on schedule, but multiple signals indicate
          that the electrical installation milestone is at risk.&rdquo;</p>
        <p class="ck-body">Why &rarr; Impact &rarr; Who needs to act &rarr; What can be done</p>
      </div>
    </div>
    ${flag('The five agents named here are an illustration, not a shipped set. What ships is a '
      + 'catalogue of twenty-nine watchers chosen against the customer&rsquo;s own words, and none of '
      + 'them reads a project schedule yet &mdash; the connectors today are a database, file uploads, '
      + 'Confluence, Jira and inbound WhatsApp.')}`);
}

function tools() {
  const used = ['Project planning', 'Scheduling', 'Resource management', 'Documents',
    'Communication', 'Execution', 'Reporting'];
  return slide('04', 'Why existing tools aren’t enough', `
    <h2 class="ck-h2">The data already exists. The problem is connecting it.</h2>
    <div class="ck-two">
      <div>
        <p class="ck-eyebrow">Engineering teams already use</p>
        <ul class="ck-list">${used.map((u) => `<li>${u}</li>`).join('')}</ul>
      </div>
      <div>
        <div class="ck-ask"><span>Existing systems answer</span><b>&ldquo;What is happening?&rdquo;</b></div>
        <div class="ck-ask"><span>Dashboards answer</span><b>&ldquo;What happened?&rdquo;</b></div>
        <div class="ck-ask is-lit"><span>SvargAI is designed to answer</span>
          <b>&ldquo;What is starting to go wrong &mdash; and who needs to know now?&rdquo;</b></div>
        <p class="ck-body">Existing systems remain the system of record.
          <b>SvargAI becomes the intelligence layer across them.</b></p>
      </div>
    </div>`);
}

function icp() {
  const users = [
    ['Project Manager', 'Owns schedule and delivery'],
    ['Engineering Manager', 'Owns technical execution'],
    ['Program Manager', 'Owns multiple dependencies / workstreams'],
    ['Project Controls / PMO', 'Monitors schedule, cost and progress'],
  ];
  const validate = ['How often does this happen?', 'What signals existed beforehand?',
    'Where do those signals live?', 'Who currently connects them?', 'How much does the delay cost?',
    'What action could have been taken earlier?'];
  return slide('05', 'Initial ICP — beachhead', `
    <h2 class="ck-h2">Start with engineering teams where schedule risk is expensive</h2>
    <div class="ck-two">
      <div>
        <p class="ck-eyebrow ck-eyebrow--accent">Beachhead ICP</p>
        <p class="ck-body">Engineering and project-based organisations managing complex schedules
          where delays are caused by dependencies, resources, approvals, changes and execution
          issues spread across multiple systems.</p>
      </div>
      <div>
        <p class="ck-eyebrow ck-eyebrow--accent">Primary users</p>
        <table class="ck-rows"><tbody>
          ${users.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>
    <div class="ck-two">
      <div class="ck-panel ck-panel--lit">
        <p class="ck-eyebrow">Initial problem</p>
        <p class="ck-said">&ldquo;We find out a project is going to slip only after the warning
          signals have already accumulated.&rdquo;</p>
      </div>
      <div class="ck-panel">
        <p class="ck-eyebrow">What we need to validate</p>
        <ul class="ck-list ck-list--two">${validate.map((v) => `<li>${v}</li>`).join('')}</ul>
      </div>
    </div>
    ${flag('This is not the industry the sales pages are working. The interviews, the target '
      + 'audience table and the outreach all address <b>Clinics &amp; Wellness</b>, where one company '
      + 'has been interviewed and all seven acute conditions held. Engineering schedule risk has had '
      + 'no interviews. Both cannot be the beachhead — decide which, then make the other tab agree, '
      + 'because an investor who reads both learns that the ICP is unsettled.')}`);
}

/** The one slide that waits for data. */
function validation() {
  const p = proof;
  const fig = (v, what, note) => `
    <div class="ck-fig"><p class="ck-fig__n">${v}</p><p class="ck-fig__w">${what}</p>
      ${note ? `<p class="ck-fig__note">${note}</p>` : ''}</div>`;

  const measured = !p ? `<p class="ck-body">${proofError
    ? esc(proofError) : 'Measuring&hellip;'}</p>` : `
    <div class="ck-figs">
      ${fig(num(p.built.completed), 'blueprints completed', 'A business described itself and got a specification back.')}
      ${fig(num(p.built.applications), 'applications generated', 'Each its own container and its own database.')}
      ${fig(num(p.built.deployed), 'deployed and reachable', 'Live URLs, answering today.')}
      ${fig(num(p.product.watchers), 'watchers running', 'Started from the customer’s own words.')}
      ${fig(num(p.product.findings), 'findings raised', 'Each a condition evaluated in code against real rows.')}
      ${fig(num(p.product.resolved), 'closed themselves', 'The rows changed and the next run said so.')}
      ${fig(num(p.customers.questionsAsked), 'questions asked', 'Across every delivered application, ever.')}
      ${fig(num(p.customers.findingsOpened), 'findings opened', 'The number that matters most on this page.')}
      ${fig(money(p.cost.spendUsd), 'model spend, all applications', num(p.cost.requests) + ' requests, capped at ' + money(p.cost.capUsd) + ' per application per month.')}
    </div>
    <p class="ck-measured">Measured <b>${esc(new Date(p.measuredAt).toUTCString().slice(5, 22))}</b>
      from the live databases, when this page was opened. Nothing annualised, projected or rounded up.</p>`;

  return slide('06', 'Validation &amp; proof', `
    <h2 class="ck-h2">From AI application builder &rarr; proactive problem detector</h2>
    <div class="ck-three">
      <div class="ck-panel">
        <p class="ck-eyebrow">What we have proven</p>
        <p class="ck-strong">Working AI application engine</p>
        <p class="ck-body">AI solutions can be built and deployed quickly using SvargAI.</p>
      </div>
      <div class="ck-panel">
        <p class="ck-eyebrow ck-eyebrow--accent">What we are validating now</p>
        <p class="ck-strong">Engineering schedule risk</p>
        <ul class="ck-list">
          <li>Problems discovered too late</li><li>Signals available before discovery</li>
          <li>Systems containing those signals</li><li>Actions possible if detected earlier</li>
          <li>Financial impact of delayed action</li>
        </ul>
      </div>
      <div class="ck-panel ck-panel--lit">
        <p class="ck-eyebrow">Initial hypothesis</p>
        <p class="ck-strong">Schedule problems are often visible in the data before they are visible
          to the team.</p>
      </div>
    </div>

    <p class="ck-eyebrow ck-eyebrow--accent">The engine, measured rather than asserted</p>
    ${measured}

    <p class="ck-foot"><span>Next proof point</span> 3&ndash;5 design partners &rarr; same problem
      &rarr; real data &rarr; measurable earlier detection</p>
    ${flag('&ldquo;What we have proven&rdquo; is the engine, and the figures above are what proves it. '
      + 'What is not proven and must not be implied: nobody is paying, one finding has ever been '
      + 'opened, and the interviews so far are in a different industry from the beachhead on '
      + 'slide 05.')}`);
}

function gtm() {
  const cols = [
    ['01', 'Find the acute problem', 'Interview 30–40 engineering / project teams. Identify the problem that:',
      ['Happens frequently', 'Has existing warning signals', 'Requires connecting multiple systems',
        'Is currently discovered manually or too late', 'Has measurable cost', 'Has a clear intervention']],
    ['02', 'Prove the workflow', '3–5 design partners. Real data:', ['Detect', 'Explain', 'Act', 'Measure']],
    ['03', 'Prove repeatability', '', ['Same problem', 'Similar buyer', 'Similar signals', 'Similar action', 'Similar ROI']],
    ['04', 'Expand', 'Engineering:', ['Adjacent project workflows', 'Other industries with the same underlying problem']],
  ];
  return slide('07', 'Go-to-market', `
    <h2 class="ck-h2">Problem first. Niche second. Scale third.</h2>
    <div class="ck-four">
      ${cols.map(([n, name, lede, items], i) => `
        <div class="ck-panel${i === cols.length - 1 ? ' ck-panel--lit' : ''}">
          <p class="ck-step__n">${n}</p>
          <p class="ck-strong">${name}</p>
          ${lede ? `<p class="ck-body">${lede}</p>` : ''}
          <ul class="ck-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>
        </div>`).join('')}
    </div>
    <p class="ck-accent"><b class="ck-white">The wedge is narrow.</b> The platform remains horizontal.</p>`);
}

function model() {
  const pillars = [
    ['Platform', 'Connect existing business systems'],
    ['AI Agents', 'Deploy agents for specific problem areas'],
    ['Monitoring', 'Continuously monitor signals'],
    ['Business Value', 'Detect problems earlier and measure outcomes'],
  ];
  const tiers = [
    ['Pilot', 'Fixed implementation / validation fee'],
    ['Growth', 'Monthly SaaS based on number of monitored workflows / agents'],
    ['Enterprise', 'Custom pricing based on scale, data sources and workflows'],
  ];
  return slide('08', 'Business model', `
    <h2 class="ck-h2">SaaS priced around the value of problems detected</h2>
    <div class="ck-four ck-four--pillars">
      ${pillars.map(([k, v], i) => `
        <div class="ck-pillar${i === pillars.length - 1 ? ' is-lit' : ''}">
          <p class="ck-strong">${k}</p><p class="ck-body">${v}</p></div>`).join('')}
    </div>
    <div class="ck-two">
      <div>
        <p class="ck-eyebrow">Potential commercial structure</p>
        <table class="ck-rows"><tbody>
          ${tiers.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="ck-panel ck-panel--lit">
        <p class="ck-eyebrow">Expansion</p>
        <p class="ck-strong">One problem</p>
        <p class="ck-accent">&darr; Multiple workflows<br>&darr; Multiple teams<br>&darr; Enterprise</p>
      </div>
    </div>
    ${flag('The pricing in code today is not this. Plans sell <b>business coverage</b> &mdash; how much '
      + 'of the business is watched, how many sources, how often &mdash; with watchers unlimited '
      + 'inside it, and that was a deliberate decision against per-agent pricing. &ldquo;Monthly SaaS '
      + 'based on number of monitored workflows / agents&rdquo; is the model that was rejected. Nobody '
      + 'is being charged either way yet.')}`);
}

function ask() {
  const cols = [
    ['Product', 'Build the first repeatable proactive-detection workflow for engineering teams.', 'Schedule risk &rarr; Detect &rarr; Explain &rarr; Act'],
    ['Validation', 'Run 30–40 problem interviews and establish the acute ICP.', ''],
    ['Design partners', 'Deploy with 3–5 engineering organisations using real project data.', ''],
    ['Commercial', 'Convert the validated workflow into the first 10 paying customers.', ''],
    ['Repeatability', 'Prove: same problem &rarr; same buyer &rarr; similar signals &rarr; similar intervention &rarr; measurable ROI', ''],
  ];
  return slide('09', 'The ask', `
    <h2 class="ck-h2">Raising <em class="ck-accent-text">$500K</em> to turn a working AI engine into a
      repeatable business</h2>
    <p class="ck-body ck-body--wide">The next 12 months are about commercial repeatability &mdash; not
      proving the technology.</p>
    <div class="ck-five">
      ${cols.map(([k, v, sub]) => `
        <div class="ck-col">
          <p class="ck-eyebrow ck-eyebrow--accent">${k}</p>
          <p class="ck-body">${v}</p>
          ${sub ? `<p class="ck-fig__note">${sub}</p>` : ''}
        </div>`).join('')}
    </div>
    <p class="ck-foot ck-foot--lit"><span>Milestone this buys</span>
      <b>A repeatable problem-detection product with measurable economic value &mdash; not just
      another AI prototype.</b></p>
    ${flag('One interview has been run, of the 30&ndash;40 this slide commits to, and it was in the '
      + 'other industry. That is the first question a careful investor asks about this slide, so have '
      + 'the answer ready rather than the number.')}`);
}

function founder() {
  const years = [['16+', 'Years in technology'], ['10+', 'Years automotive'],
    ['6+', 'Years semiconductor'], ['8+', 'Years product management']];
  return slide('10', 'Founder', `
    <h2 class="ck-h2">Pranesh Babykannan</h2>
    <p class="ck-eyebrow ck-eyebrow--accent">Founder &amp; CEO</p>
    <div class="ck-two">
      <div class="ck-years">
        ${years.map(([n, w]) => `<div><p class="ck-fig__n">${n}</p><p class="ck-fig__w">${w}</p></div>`).join('')}
      </div>
      <div>
        <p class="ck-eyebrow">Why this problem</p>
        <p class="ck-body">Years in engineering and product environments exposed a recurring problem:</p>
        <p class="ck-strong">Projects rarely fail because there is no data. They fail because
          important signals are not connected early enough to change the outcome.</p>
        <p class="ck-body">SvargAI is built around solving that gap.</p>
      </div>
    </div>
    <p class="ck-accent ck-accent--big">From data &rarr; signals &rarr; problems &rarr; action.</p>`);
}

function render() {
  const el = document.getElementById('ck-deck');
  if (!el) return;
  el.innerHTML = [cover(), problem(), solution(), practice(), tools(), icp(),
    validation(), gtm(), model(), ask(), founder()].join('');
}

/**
 * One request, and the page renders either way.
 *
 * A proof slide that cannot measure says so. It does not fall back to the
 * last numbers anybody typed, because a figure whose age is unknown is the
 * thing this page was rebuilt to remove.
 */
async function load() {
  try {
    const r = await fetch(`${API_BASE}/admin/capital/proof`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!r.ok) throw new Error(`The numbers could not be read (${r.status}).`);
    proof = await r.json();
  } catch (err) {
    proofError = err.message || 'The numbers could not be read.';
  }
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/capital.html');
    window.location.href = '/admin/login.html';
    return;
  }
  render();
  load();
});
