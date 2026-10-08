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
 * ── The wedge this deck sells ──────────────────────────────────────────────
 *
 * Rewritten on 2026-10-08 to the positioning the site and the sales pages
 * carry: customer retention only, sold to customer success teams, starting
 * with Recurring Services. The engineering-schedule wedge it used to pitch was
 * flagged here as disagreeing with the interviews; that disagreement is now
 * gone, and engineering account retention is named only as a later expansion.
 *
 * ── What this admin copy adds ──────────────────────────────────────────────
 *
 * The slides are the deck's own words. Where a claim on a slide is ahead of
 * what is built, or ahead of what has been validated, it is marked, because
 * this copy is read by the people building the thing rather than by an
 * investor. Two of the six steps are not built at all, and the retention
 * evidence is thin. Both are said here rather than discovered in a room.
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
 * Twelve slides, in the deck's order and its words. Each renders itself; the
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
      <h1 class="ck-h1">Your customers are giving you signals.<br>Know what they mean before it&rsquo;s too late.</h1>
      <p class="ck-lede"><em>AI agents.</em> / <em>Your existing systems.</em> / <em>Customers kept.</em></p>
      <p class="ck-sub">Svarg finds the customers who are quietly drifting away &mdash; and tells the team
        why, while there is still time to win them back.</p>
    </div>`, { cover: true });
}

function problem() {
  const chips = ['Bookings', 'CRM', 'Calls', 'WhatsApp', 'Payments', 'Support tickets', 'Usage'];
  const costs = [['Lost renewals', 'Lost lifetime revenue'], ['Missed win-back window', 'Cost of replacing them'],
    ['Packages left unused', 'Silent churn']];
  return slide('01', 'The problem', `
    <h2 class="ck-h2">Customers leave long before anyone notices</h2>
    <ol class="ck-chain">
      <li>Small signals</li><li>Customer drifting</li><li>Late discovery</li>
      <li class="is-bad">Customer lost</li>
    </ol>
    <div class="ck-two">
      <div>
        <p class="ck-strong">The business already has the signals.</p>
        <p class="ck-chips">${chips.map((c) => `<span>${c}</span>`).join('')}</p>
        <p class="ck-body">But they sit in different systems, read by different people. A customer
          can still look &ldquo;active&rdquo; while the signs that they are leaving are already there.</p>
        <p class="ck-quote"><b>The problem isn&rsquo;t lack of data.</b><br>
          <em>It&rsquo;s that nobody joins the signals up in time to act.</em></p>
      </div>
      <div class="ck-panel">
        <p class="ck-eyebrow">For a business whose customers come back, this means</p>
        <table class="ck-grid2"><tbody>
          ${costs.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}
        </tbody></table>
        <p class="ck-accent">Found early, a drifting customer is a phone call. Found late, they are gone.</p>
      </div>
    </div>`);
}

/**
 * The six steps the home page shows, with what is behind each.
 *
 * `built` is the admin annotation, from the state of the product on
 * 2026-10-08, read from the delivered app's code: Detect and Explain run;
 * Recommend, Act, Measure and Learn are partly there. Act drafts and stops —
 * the application holds no mail credentials by design.
 */
const STEPS = [
  ['01', 'Detect', 'Spot customers drifting away across all your systems.', 'yes'],
  ['02', 'Explain', 'Show the real signals behind every risk.', 'yes'],
  ['03', 'Recommend', 'The next best action for each customer.', 'part'],
  ['04', 'Act', 'Reach out through the tools the team already uses.', 'part'],
  ['05', 'Measure', 'Track who stayed and which actions worked.', 'part'],
  ['06', 'Learn', 'Every outcome sharpens the next recommendation.', 'part'],
];

function solution() {
  const LABEL = { yes: 'runs today', part: 'partly built', no: 'not built' };
  return slide('02', 'The solution', `
    <h2 class="ck-h2">Svarg watches for the customers who are starting to leave</h2>
    <p class="ck-body ck-body--wide">Svarg builds each customer success team its own retention
      application, on top of the systems it already uses. <b>Each AI agent watches for one kind of
      risk, and shows the records behind every alert.</b></p>
    <ol class="ck-steps">
      ${STEPS.map(([n, name, what, state], i) => `
        <li class="ck-step is-${state}${i === STEPS.length - 1 ? ' is-last' : ''}">
          <p class="ck-step__n">${n}</p>
          <p class="ck-step__name">${name}</p>
          <p class="ck-step__what">${what}</p>
          <p class="ck-step__state">${LABEL[state]}</p>
        </li>`).join('')}
    </ol>
    <p class="ck-accent">&#8635; Every outcome feeds back into Detect.</p>
    ${flag('<b>Detect</b> and <b>Explain</b> run today: the AI writes each customer&rsquo;s risk from '
      + 'their own findings, and a number not in the records rejects it. <b>Recommend</b> gives a next '
      + 'step per customer. <b>Act</b> writes the follow-up and stops &mdash; a person sends it, because '
      + 'the application holds no mail credentials by design. <b>Measure</b> counts a step as worked when '
      + 'the finding clears after it, not who stayed in the accountant&rsquo;s sense. <b>Learn</b> learns '
      + 'which step works in this business, after three tries; it does <b>not</b> yet learn new churn '
      + 'patterns &mdash; the patterns are the catalogue&rsquo;s rules.')}`);
}

function practice() {
  const agents = [
    ['No Show', 'Appointments marked as missed'],
    ['Gone Quiet', 'A regular customer who has stopped'],
    ['Renewal Due', 'A package or plan ending soon'],
    ['Unanswered Enquiry', 'A message nobody has replied to'],
    ['Repeat Complaint', 'The same customer, raising it again'],
  ];
  return slide('03', 'The solution in practice', `
    <h2 class="ck-h2">Example: a wellness clinic in Bengaluru</h2>
    <div class="ck-two">
      <table class="ck-rows"><tbody>
        ${agents.map(([a, b]) => `<tr><th>${a}</th><td>${b}</td></tr>`).join('')}
      </tbody></table>
      <div class="ck-panel ck-panel--lit">
        <p class="ck-eyebrow">The question it raises</p>
        <p class="ck-said">&ldquo;About twenty appointments a month are marked No Show. Which of those
          customers are starting to leave?&rdquo;</p>
        <p class="ck-body">Signals &rarr; Which customers &rarr; Why &rarr; Who calls them, today</p>
      </div>
    </div>
    ${flag('All five agents are real, in the catalogue&rsquo;s own names. The twenty a month is what '
      + 'the centre reported; <b>which of them are disengaging is our framing, not theirs</b> &mdash; '
      + 'it is the next thing to ask them, and the deck must not imply they said it.')}`);
}

function tools() {
  const used = ['CRM', 'Booking system', 'Phone', 'WhatsApp', 'Payments', 'Support desk', 'Spreadsheets'];
  return slide('04', 'Why existing tools aren’t enough', `
    <h2 class="ck-h2">The data already exists. Nobody is joining it up.</h2>
    <div class="ck-two">
      <div>
        <p class="ck-eyebrow">Customer success teams already use</p>
        <ul class="ck-list">${used.map((u) => `<li>${u}</li>`).join('')}</ul>
      </div>
      <div>
        <div class="ck-ask"><span>Existing systems answer</span><b>&ldquo;What is happening?&rdquo;</b></div>
        <div class="ck-ask"><span>Churn reports answer</span><b>&ldquo;Who already left?&rdquo;</b></div>
        <div class="ck-ask is-lit"><span>Svarg is designed to answer</span>
          <b>&ldquo;Who is starting to leave &mdash; and why &mdash; while there is still time?&rdquo;</b></div>
        <p class="ck-body">Existing systems stay the system of record. <b>Svarg builds the team its own
          app across them</b> &mdash; dedicated to them, and their customer records never go into an AI
          prompt.</p>
      </div>
    </div>`);
}

/**
 * The competitive field, as the founder ranks it (2026-10-08). The "why" is
 * the founder's own one-line read of each, kept word for word: the deck says
 * nothing about a competitor that we have not checked. The colour is the
 * founder's own marker (red, orange, yellow); the five-bar meter follows the
 * threat label, so two "High"s of different colour still read as equal.
 */
const THREAT_BARS = { 'Very high': 5, High: 4, 'Medium / high': 3, Medium: 2 };
const COMPETITORS = [
  ['Velaris', 'Very high', 'red', 'AI + customer signals + churn + agents'],
  ['Totango', 'High', 'red', 'Customer data + AI churn intelligence + playbooks'],
  ['Planhat', 'High', 'red', 'Health + churn + AI + automation + broader CRM/PSA'],
  ['Vitally', 'High', 'orange', 'Customer health + signals + AI + CSM workflow'],
  ['SmartKarrot', 'Medium / high', 'orange', 'Customer health + early warning + CS workflows'],
  ['ClientSuccess', 'Medium', 'orange', 'Retention + customer lifecycle'],
  ['Pylon', 'Medium', 'yellow', 'AI customer support rather than retention intelligence'],
];

function competition() {
  const edges = [
    ['Your own app, not a shared platform', 'Built and deployed for each team, around how it already works.'],
    ['From the systems already in use', 'Bookings, CRM, calls, WhatsApp and payments, joined where they are.'],
    ['Evidence on every alert', 'Each risk links to the records it came from; records never enter an AI prompt.'],
  ];
  return slide('05', 'Competition', `
    <h2 class="ck-h2">A crowded idea. A different way in.</h2>
    <div class="ck-two ck-comp">
      <div>
        <p class="ck-eyebrow">The field, ranked by threat to Svarg</p>
        <ol class="ck-ladder">
          ${COMPETITORS.map(([name, threat, tone, why], i) => `
            <li class="ck-ladder__row">
              <span class="ck-ladder__rank">${i + 1}</span>
              <span class="ck-ladder__who"><b>${name}</b><span>${why}</span></span>
              <span class="ck-ladder__threat ck-ladder__threat--${tone}">
                <span class="ck-meter" aria-hidden="true">${'<i class="on"></i>'.repeat(THREAT_BARS[threat])}${'<i></i>'.repeat(5 - THREAT_BARS[threat])}</span>${threat}
              </span>
            </li>`).join('')}
        </ol>
      </div>
      <div class="ck-panel ck-panel--lit ck-edge">
        <p class="ck-eyebrow ck-eyebrow--accent">Our edge</p>
        <p class="ck-edge__line">Don&rsquo;t wait for churn.<br>Detect the pattern before it.</p>
        <p class="ck-body">Svarg learns the behavioural patterns that precede customer churn across your
          existing systems, continuously detects those patterns in your customer base, explains the
          underlying risk, and helps your team act before revenue is lost.</p>
        <ul class="ck-edge__list">
          ${edges.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}
        </ul>
      </div>
    </div>
    ${flag('The ranking and every line about a competitor are the founder&rsquo;s read, not checked '
      + 'research &mdash; verify each company&rsquo;s current product before the meeting, because an '
      + 'investor who knows one of them will test it. The edge statement runs ahead of the product: '
      + '<b>&ldquo;learns the behavioural patterns&rdquo;</b> is not built: the patterns are the agent '
      + 'catalogue&rsquo;s fixed rules, and what Learn learns today is which follow-up works. '
      + '<b>&ldquo;helps your team act&rdquo;</b> is Act, which drafts and stops. Until pattern learning '
      + 'ships, say &ldquo;learns which actions keep your customers&rdquo; if asked.')}`);
}

/** The five business types, in the order the site and the sales pages use. */
const SEGMENTS = [
  ['Recurring Services', 'Clinics, wellness, gyms, salons, physiotherapy', 'Beachhead'],
  ['Education & Memberships', 'Academies, coaching, music and dance schools', 'Next'],
  ['Subscription & Repeat Purchase', 'D2C subscriptions, food, pet care', 'Next'],
  ['High-Value Repeat Services', 'Auto service, dental, home services', 'Next'],
  ['Hospitality & Leisure', 'Hotels, resorts, clubs, experiences', 'Next'],
];

function icp() {
  const users = [
    ['Customer success / client relations', 'Owns keeping customers'],
    ['Centre or branch manager', 'Owns the numbers at one location'],
    ['Owner / founder', 'Feels every lost renewal'],
    ['Front desk / relationship team', 'Makes the call that wins them back'],
  ];
  const validate = ['How often does a customer drift away?', 'What signals existed beforehand?',
    'Where do those signals live?', 'Who joins them up today?', 'What does a lost customer cost?',
    'What would the team do if told earlier?'];
  return slide('06', 'Initial ICP — beachhead', `
    <h2 class="ck-h2">Start where customers come back every week: Recurring Services</h2>
    <div class="ck-two">
      <div>
        <p class="ck-eyebrow ck-eyebrow--accent">Beachhead ICP</p>
        <p class="ck-body">Clinics, wellness centres, gyms, salons and physiotherapy in India &mdash;
          businesses that sell a course of visits, where a client drifting part-way through is lost
          revenue and the signs sit across the booking system, the phone and WhatsApp.</p>
        <table class="ck-rows"><tbody>
          ${SEGMENTS.map(([a, b, c]) => `<tr><th>${esc(a)}</th><td>${esc(b)} &middot; <b>${c}</b></td></tr>`).join('')}
        </tbody></table>
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
        <p class="ck-said">&ldquo;We find out a client has left only when the package isn&rsquo;t
          renewed.&rdquo;</p>
      </div>
      <div class="ck-panel">
        <p class="ck-eyebrow">What we need to validate</p>
        <ul class="ck-list ck-list--two">${validate.map((v) => `<li>${v}</li>`).join('')}</ul>
      </div>
    </div>
    ${flag('The beachhead now agrees with the sales pages: Recurring Services is where the interviews '
      + 'are, <b>3 of 5</b> done; the other four segments have none. The quote above is the problem '
      + 'as we frame it &mdash; the interviews have not said it in those words. The Wellness Co. '
      + 'described a customer drifting over three months, but what that costs them is still '
      + 'unasked.')}`);
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
      ${fig(num(p.product.watchers), 'AI agents running', 'Started from the customer’s own words.')}
      ${fig(num(p.product.findings), 'findings raised', 'Each a condition evaluated in code against real rows.')}
      ${fig(num(p.product.resolved), 'closed themselves', 'The rows changed and the next run said so.')}
      ${fig(num(p.customers.questionsAsked), 'questions asked', 'Across every delivered application, ever.')}
      ${fig(num(p.customers.findingsOpened), 'findings opened', 'The number that matters most on this page.')}
      ${fig(money(p.cost.spendUsd), 'model spend, all applications', num(p.cost.requests) + ' requests, capped at ' + money(p.cost.capUsd) + ' per application per month.')}
    </div>
    <p class="ck-measured">Measured <b>${esc(new Date(p.measuredAt).toUTCString().slice(5, 22))}</b>
      from the live databases, when this page was opened. Nothing annualised, projected or rounded up.</p>`;

  return slide('07', 'Validation &amp; proof', `
    <h2 class="ck-h2">A working engine, pointed at one problem: customers leaving</h2>
    <div class="ck-three">
      <div class="ck-panel">
        <p class="ck-eyebrow">What we have proven</p>
        <p class="ck-strong">Working application engine</p>
        <p class="ck-body">A business describes itself and gets its own deployed application, with AI
          agents running on its own data.</p>
      </div>
      <div class="ck-panel">
        <p class="ck-eyebrow ck-eyebrow--accent">What we are validating now</p>
        <p class="ck-strong">Customer retention in Recurring Services</p>
        <ul class="ck-list">
          <li>Customers who drift away</li><li>Signals visible before they leave</li>
          <li>Systems holding those signals</li><li>What the team would do if told earlier</li>
          <li>What a lost customer costs</li>
        </ul>
      </div>
      <div class="ck-panel ck-panel--lit">
        <p class="ck-eyebrow">Initial hypothesis</p>
        <p class="ck-strong">A customer who is leaving is visible in the data before they are visible
          to the team.</p>
      </div>
    </div>

    <p class="ck-eyebrow ck-eyebrow--accent">The engine, measured rather than asserted</p>
    ${measured}

    <p class="ck-foot"><span>Next proof point</span> 3&ndash;5 design partners &rarr; same problem
      &rarr; real data &rarr; customers kept that would have been lost</p>
    ${flag('&ldquo;What we have proven&rdquo; is the engine, and the figures above are what proves it. '
      + 'What is not proven and must not be implied: nobody is paying, very few findings have been '
      + 'opened by a customer, and no customer has yet been kept because Svarg flagged them.')}`);
}

function gtm() {
  const cols = [
    ['01', 'Find the acute problem', 'Five interviews in each business type, Recurring Services first. Find the problem that:',
      ['Happens every month', 'Has warning signals already recorded', 'Needs more than one system joined up',
        'Is found today too late or by hand', 'Has a cost the owner can name', 'Has a clear next step']],
    ['02', 'Prove the workflow', '3–5 design partners. Real data:', ['Detect', 'Explain', 'Act', 'Measure']],
    ['03', 'Prove repeatability', '', ['Same problem', 'Similar buyer', 'Similar signals', 'Similar action', 'Similar ROI']],
    ['04', 'Expand', 'Same retention engine:', ['The other four business types', 'Then B2B account retention, such as engineering services']],
  ];
  return slide('08', 'Go-to-market', `
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
    <p class="ck-accent"><b class="ck-white">The wedge is narrow.</b> The engine stays horizontal.</p>`);
}

/**
 * The plans as the code sells them (backend services/entitlements.js,
 * PLANS): a monthly price for business coverage, never per agent.
 */
const PLANS = [
  ['Hobby', 'Free', '1 business area, 1 data source, 3 AI agents, daily checks'],
  ['Pro', '₹16,999 / month', '3 business areas, 5 data sources, 25 AI agents, 5 people'],
  ['Ultra', '₹49,999 / month', 'Every business area, 10 data sources, 100 AI agents, hourly checks'],
  ['Enterprise', 'Custom', 'Unlimited sources and agents, custom checks'],
];

function model() {
  const pillars = [
    ['Your own app', 'Built and deployed for each customer'],
    ['AI agents', 'One per kind of risk, on their own data'],
    ['Monitoring', 'Every day, or every hour'],
    ['Customers kept', 'The outcome the plan is worth paying for'],
  ];
  return slide('09', 'Business model', `
    <h2 class="ck-h2">One monthly price for how much of the business is watched</h2>
    <div class="ck-four ck-four--pillars">
      ${pillars.map(([k, v], i) => `
        <div class="ck-pillar${i === pillars.length - 1 ? ' is-lit' : ''}">
          <p class="ck-strong">${k}</p><p class="ck-body">${v}</p></div>`).join('')}
    </div>
    <div class="ck-two">
      <div>
        <p class="ck-eyebrow">Plans</p>
        <table class="ck-rows"><tbody>
          ${PLANS.map(([a, price, what]) => `<tr><th>${a}<br><span class="ck-fig__note">${price}</span></th><td>${what}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="ck-panel ck-panel--lit">
        <p class="ck-eyebrow">Expansion</p>
        <p class="ck-strong">One business area</p>
        <p class="ck-accent">&darr; More areas and sources<br>&darr; More locations<br>&darr; Enterprise</p>
      </div>
    </div>
    ${flag('These are the plans in code today, priced on <b>business coverage</b> &mdash; how much of '
      + 'the business is watched, from how many sources, how often &mdash; and per-agent pricing was '
      + 'decided against. <b>Nobody is paying yet</b>: there is no checkout, and paid plans are set by '
      + 'hand until GST invoicing is settled.')}`);
}

function ask() {
  const cols = [
    ['Product', 'Finish the retention loop for customer success teams.', 'Detect &rarr; Explain &rarr; Recommend &rarr; Act'],
    ['Validation', 'Complete five interviews in each of the five business types.', ''],
    ['Design partners', 'Deploy with 3–5 Recurring Services businesses on their real data.', ''],
    ['Commercial', 'Convert the validated workflow into the first 10 paying customers.', ''],
    ['Repeatability', 'Prove: same problem &rarr; same buyer &rarr; similar signals &rarr; similar action &rarr; customers kept', ''],
  ];
  return slide('10', 'The ask', `
    <h2 class="ck-h2">Raising <em class="ck-accent-text">$500K</em> to turn a working AI engine into a
      repeatable retention business</h2>
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
      <b>A repeatable retention product that keeps customers a business would have lost &mdash; not
      just another AI prototype.</b></p>
    ${flag('Three interviews of the twenty-five this slide commits to are done, all in Recurring '
      + 'Services. That is the first question a careful investor asks about this slide, so have the '
      + 'answer ready rather than the number.')}`);
}

function founder() {
  const years = [['16+', 'Years in technology'], ['10+', 'Years automotive'],
    ['6+', 'Years semiconductor'], ['8+', 'Years product management']];
  return slide('11', 'Founder', `
    <h2 class="ck-h2">Pranesh Babykannan</h2>
    <p class="ck-eyebrow ck-eyebrow--accent">Founder &amp; CEO</p>
    <div class="ck-two">
      <div class="ck-years">
        ${years.map(([n, w]) => `<div><p class="ck-fig__n">${n}</p><p class="ck-fig__w">${w}</p></div>`).join('')}
      </div>
      <div>
        <p class="ck-eyebrow">Why this problem</p>
        <p class="ck-body">Years in engineering and product environments exposed a recurring problem:</p>
        <p class="ck-strong">Things rarely go wrong because there is no data. They go wrong because the
          signals are not connected early enough to change the outcome.</p>
        <p class="ck-body">Svarg applies that to the costliest version of it for most businesses: a
          customer leaving.</p>
      </div>
    </div>
    <p class="ck-accent ck-accent--big">From signals &rarr; customers at risk &rarr; customers kept.</p>`);
}

function render() {
  const el = document.getElementById('ck-deck');
  if (!el) return;
  el.innerHTML = [cover(), problem(), solution(), practice(), tools(), competition(), icp(),
    validation(), gtm(), model(), ask(), founder()].join('');
}

/**
 * One request, and the page renders either way.
 *
 * A proof slide that cannot measure says so. It does not fall back to the
 * last numbers anybody typed, because a figure whose age is unknown is the
 * thing this page was rebuilt to remove.
 */
/* ── Download as PDF ────────────────────────────────────────────────────────
 *
 * The browser's own PDF engine, so the file is real text, not a picture of
 * the page. Each slide gets a 16:9 page of its own; a slide taller than the
 * page is scaled down to fit it, and only that slide — the short ones keep
 * their size. The admin flags are hidden by the print stylesheet: the PDF is
 * the investor copy, and the flags are the one thing that must never be in it.
 */
const PAGE_W = 1280;
const PAGE_H = 720;

function fitSlidesToPages() {
  document.body.classList.add('is-printing');
  for (const s of document.querySelectorAll('.ck-slide')) {
    s.style.zoom = '';
    s.style.width = PAGE_W + 'px';
    s.style.height = 'auto';
    let z = 1;
    // Scaling lets the slide reflow wider, which makes it shorter, so settle
    // the scale over a few passes rather than in one.
    for (let i = 0; i < 4; i++) {
      s.style.width = PAGE_W / z + 'px';
      const h = s.scrollHeight;
      const next = Math.min(1, PAGE_H / h);
      if (Math.abs(next - z) < 0.005) break;
      z = next;
    }
    const place = () => {
      s.style.width = PAGE_W / z + 'px';
      s.style.height = PAGE_H / z + 'px';
      s.style.zoom = String(z);
    };
    place();
    // Then check rather than trust: shrink until it fits, with 5% headroom
    // because the print engine lays text out slightly taller than the screen.
    const natural = () => {
      s.style.height = 'auto';
      const h = s.scrollHeight;
      s.style.height = PAGE_H / z + 'px';
      return h;
    };
    while (natural() > (PAGE_H / z) * 0.95 && z > 0.45) {
      z *= 0.97;
      place();
    }
  }
}

function restoreSlides() {
  document.body.classList.remove('is-printing');
  for (const s of document.querySelectorAll('.ck-slide')) {
    s.style.zoom = ''; s.style.width = ''; s.style.height = '';
  }
}

function wireDownload() {
  const btn = document.getElementById('ck-download');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = 'Download PDF';
  btn.addEventListener('click', () => {
    const was = document.title;
    // Chrome and Edge offer the title as the file name.
    document.title = `Svarg investor deck ${new Date().toISOString().slice(0, 10)}`;
    fitSlidesToPages();
    window.addEventListener('afterprint', () => { restoreSlides(); document.title = was; }, { once: true });
    window.print();
  });
}

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
  // Only now: a PDF taken before the numbers arrive would say Measuring.
  wireDownload();
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
