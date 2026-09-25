/**
 * Svarg — Capital
 *
 * What to say to an investor, an accelerator or an incubator, and the numbers
 * behind it.
 *
 * ── The rule this page holds itself to ─────────────────────────────────────
 *
 * It is read during a live conversation, which makes it the second screen in
 * this admin whose mistakes get repeated out loud — and the one where a
 * mistake is most expensive, because the person listening is deciding whether
 * to believe everything else.
 *
 * So the same discipline as the ICP tab, applied harder:
 *
 *   - Every verb carries whether it is BUILT. Two of the five are not, and
 *     they say so on the screen rather than in somebody's memory.
 *   - Every number on Proof was measured, on a date that is printed beside
 *     it. Nothing is annualised, projected, or rounded up.
 *   - The numbers that look bad are on it. One finding has ever been opened,
 *     against two hundred and eighty-five raised. An investor who finds that
 *     out later finds out that it was hidden, which costs more than the fact.
 *
 * Client-side role guard only; there is no API behind this page.
 */

const MEASURED = '25 September 2026';

/* ── The story ──────────────────────────────────────────────────────────── */

/**
 * The five things the product claims to do, and what is actually behind each.
 *
 * 'yes' runs today and can be demonstrated · 'part' exists but is thinner than
 * the word suggests · 'no' is not built. The state is the reason this list is
 * on the page: a founder who knows which two are missing demonstrates the
 * three that work and sells the rest as roadmap, with a date.
 */
const SPINE = [
  ['Find', 'yes',
    'Watchers run on a schedule and evaluate their condition in code. Twenty-nine of them ship with every application, chosen against the customer’s own words.'],
  ['Explain', 'part',
    'A finding carries the records behind it and names the dataset and the rule. What it does not yet carry is why it matters to that business.'],
  ['Prioritise', 'no',
    'The morning digest lists findings in the order the watchers ran. Nothing ranks them, so "which three first?" is still the reader’s job.'],
  ['Act', 'yes',
    'The follow-up is drafted and never sent. The application holds no mail credentials and no provider key by design — a person reads the draft and sends it themselves.'],
  ['Verify', 'yes',
    'Every run diffs against the last: new, still true, resolved. A hundred and eighteen findings have closed themselves because the rows behind them changed.'],
];

/** How an answer is produced, which is the answer to "isn't this a chatbot?" */
const PIPELINE = [
  ['Understand', 'model', 'The question becomes a plan: which dataset, which columns, which filter.'],
  ['Execute', 'code', 'The plan runs against the records. No model sees the rows at this point.'],
  ['Validate', 'code', 'The condition is evaluated in code. A finding the model merely asserted is discarded.'],
  ['Answer', 'model', 'The model writes the sentence around a result it did not choose.'],
];

const SHAPE = [
  ['One container and one database per customer',
    'A delivered application is the customer’s. Their records never enter Svarg, which is also why the demonstration runs on simulated data.'],
  ['No provider key inside it',
    'Every model call crosses a gateway Svarg owns, metered and capped per deployment. A stolen container yields no credentials.'],
  ['Sold as coverage, not tokens',
    'A plan buys how much of the business is watched — business areas, connected sources, how often. Watchers are unlimited inside it, and model usage is never a customer-facing meter.'],
];

/**
 * The same product behaviour, in two industries that share nothing else.
 *
 * This is the whole bet stated as a comparison: if the problem travels, the
 * problem is the asset and the industry never mattered.
 */
const TRAVELS = [
  ['A physiotherapy clinic',
    'A patient is treated and left marked "No Show". The session is delivered and never counted.',
    'Interviewed. Every one of the seven acute conditions evidenced.'],
  ['An automotive supplier',
    'The same shape, untested: work done and never recorded against the job, the part or the claim.',
    'Nobody spoken to yet. This is the next vertical, and it is empty on purpose.'],
];

function renderStory() {
  const el = document.getElementById('cp-story');
  if (!el) return;
  el.innerHTML = `
    <section class="cp">
      <div class="cp-lead">
        <p class="cp-lead__claim">Work falls through the cracks between systems and people.</p>
        <p class="cp-lead__body">The signals that something is going wrong already exist — in a
          booking system, a spreadsheet, a WhatsApp thread, an ERP. Nobody connects them
          continuously, so the problem is found after it has happened. Svarg is the thing that
          keeps looking.</p>
      </div>

      <p class="cp-label">What it does, and what is actually built</p>
      <ol class="cp-spine">
        ${SPINE.map(([verb, state, note]) => `
          <li class="cp-spine__i is-${state}">
            <p class="cp-spine__v">${verb}<span>${
              state === 'yes' ? 'built' : state === 'part' ? 'partly' : 'not yet'}</span></p>
            <p class="cp-note">${note}</p>
          </li>`).join('')}
      </ol>
      <p class="cp-note cp-note--wide"><b>One of the five is not built and one is thin.</b> They are
        on this page so that the person saying it knows which three to demonstrate. An investor who
        discovers the gap later discovers that it was hidden, and that costs more than the gap.</p>

      <p class="cp-label">Why it is not a chatbot over a database</p>
      <ol class="cp-pipe">
        ${PIPELINE.map(([step, by, what]) => `
          <li class="cp-pipe__i is-${by}">
            <p class="cp-pipe__s">${step}<span>${by}</span></p>
            <p class="cp-note">${what}</p>
          </li>`).join('')}
      </ol>
      <p class="cp-note cp-note--wide">Code decides; the model narrates. It is a checkable claim
        rather than a positioning one: a finding whose condition the model judged rather than
        evaluated is thrown away before anybody sees it.</p>

      <p class="cp-label">The shape of the business</p>
      <dl class="cp-shape">
        ${SHAPE.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
      </dl>

      <p class="cp-label">The bet, stated so it can lose</p>
      <div class="cp-travel">
        ${TRAVELS.map(([who, what, state]) => `
          <div class="cp-travel__c">
            <h3>${who}</h3>
            <p>${what}</p>
            <p class="cp-note">${state}</p>
          </div>`).join('')}
      </div>
      <p class="cp-note cp-note--wide">If the same problem appears in both, the problem is the asset
        and the industry never mattered. If it does not, this is a clinic product and the plan was
        wrong — which is a thing worth finding out in ten interviews rather than in two years.</p>
    </section>`;
}

/* ── The proof ──────────────────────────────────────────────────────────── */

/**
 * Measured, not estimated.
 *
 * Every figure here came from a query against the live databases on the date
 * at the top. Where a number is smaller than somebody would like, it is still
 * the number.
 */
const PROOF = [
  ['Built and running', [
    ['15', 'blueprints completed', 'A customer described their business and got a specification back.'],
    ['9', 'applications generated', 'Each one its own container and its own database.'],
    ['5', 'deployed and reachable', 'Live URLs, answering today.'],
    ['4', 'holding real customer records', 'Of eight tenant databases. The rest are running on the sample data they were built with.'],
  ]],
  ['What the product did on its own', [
    ['65', 'watchers running', 'Started from the customer’s own words, not configured by hand.'],
    ['285', 'findings raised', 'Each one a condition evaluated in code against real rows.'],
    ['118', 'findings closed themselves', 'The rows behind them changed and the next run said so.'],
    ['30', 'resolutions reported back', 'Most recent: today.'],
  ]],
  ['What customers did', [
    ['18', 'questions asked', 'Across every delivered application, ever.'],
    ['1', 'finding opened', 'Against two hundred and eighty-five raised. This is the number that matters most on this page.'],
    ['2', 'applications opened this week', 'Of five that are running.'],
    ['1', 'customer interviewed to the full script', 'Fifteen minutes, every question asked in order.'],
  ]],
  ['What it costs to run', [
    ['$0.60', 'model spend, every application, to date', '569 requests across all of them.'],
    ['$0.07', 'spend on the busiest single application', 'Over nine days, against a $2 monthly cap.'],
    ['$2', 'hard cap per application per month', 'Enforced at the gateway; the application cannot exceed it.'],
  ]],
  ['The pipeline', [
    ['106', 'companies in the funnel', 'Typed in by hand, one row each.'],
    ['62', 'of them in one industry', 'Electronics and industrial — from a trade show, not from the segment now being sold to.'],
    ['4', 'in the segment now being sold to', 'Added this week.'],
  ]],
];

/**
 * What the numbers above do NOT support.
 *
 * On the page rather than in a footnote, because every one of these is
 * something a careful person would work out for themselves in the second
 * meeting.
 */
const CAVEATS = [
  ['The build cost is not measured',
    'The usage ledger holds nine rows and $2.05 for thirty-six blueprints. One model call per blueprint is not plausible, so most of what generation spends is not attributed to anybody. The $0.60 above is what delivered applications spend, which is measured, and is a different number.'],
  ['Nobody is paying yet',
    'There is no revenue. Plans, entitlements and per-deployment caps exist in code; no card has been charged.'],
  ['One finding opened is the honest reading',
    'It counts the signal a delivered application sends when somebody opens a finding. The application does not store an opened flag, so this is the only record — and it says what it says.'],
  ['One interview is not an ICP',
    'The target audience table has one full column out of five. Four empty columns are the current state of the evidence, not a gap in the reporting.'],
];

function renderProof() {
  const el = document.getElementById('cp-proof');
  if (!el) return;
  el.innerHTML = `
    <section class="cp">
      <p class="cp-measured">Every figure measured <b>${MEASURED}</b>, against the live databases.
        Nothing annualised, projected or rounded.</p>

      ${PROOF.map(([group, rows]) => `
        <p class="cp-label">${group}</p>
        <div class="cp-figs">
          ${rows.map(([n, what, note]) => `
            <div class="cp-fig">
              <p class="cp-fig__n">${n}</p>
              <p class="cp-fig__w">${what}</p>
              <p class="cp-note">${note}</p>
            </div>`).join('')}
        </div>`).join('')}

      <p class="cp-label">What these numbers do not support</p>
      <ul class="cp-caveats">
        ${CAVEATS.map(([head, body]) => `<li><b>${head}</b><span>${body}</span></li>`).join('')}
      </ul>
    </section>`;
}

/* ── What they ask ──────────────────────────────────────────────────────── */

const AUDIENCES = [
  { id: 'investor', name: 'Investor', note: 'Deciding whether this becomes large' },
  { id: 'accelerator', name: 'Accelerator', note: 'Deciding whether a programme would change the outcome' },
  { id: 'incubator', name: 'Incubator', note: 'Deciding whether there is something to build on' },
];

let audience = 'investor';

/**
 * The questions each one actually asks, and what can be answered today.
 *
 * 'have' can be evidenced from the Proof tab. 'partly' is true but thinner
 * than the question wants. 'not' has no honest answer yet, and the answer
 * written is what to say instead of inventing one.
 */
const ASKS = {
  investor: [
    ['have', 'What exactly does it do?',
      'It watches a business’s own records on a schedule and reports what changed for the worse, with the rows behind it. Five applications are doing that today and 285 findings have come out of them.'],
    ['have', 'Why is this not a chatbot over a database?',
      'Because the condition is evaluated in code, not asserted by a model — and a finding the model merely asserted is discarded before anybody sees it. That is checkable in the source, which is a rarer answer than the question expects.'],
    ['partly', 'Who is it for?',
      'Clinics and wellness centres, on evidence of one interview where all seven acute conditions held. The honest version is: one company has confirmed the problem, four more have to.'],
    ['partly', 'What is the wedge?',
      'Revenue leakage from activity that does not match the record — treated patients marked absent, entitlements over-used. Drafted, not locked: it locks when a second company says the same thing.'],
    ['not', 'What is the traction?',
      'There is none to claim. Five running applications, no revenue, one finding ever opened. Say that, then say what the next ten interviews are for — a number nobody can check is worth less than a small one they can.'],
    ['not', 'How big is the market?',
      'No bottom-up number has been built. Do not reach for a top-down one: the same problem appearing in an unrelated industry is the evidence that matters here, and that test is running.'],
  ],
  accelerator: [
    ['have', 'Is there a product?',
      'Yes, and it is delivered software rather than a demonstration: nine applications generated, five running, each with its own container and database.'],
    ['have', 'What would you use the programme for?',
      'Interviews. The playbook needs 30–40 and one has been run. Introductions into clinics and automotive suppliers are worth more than the money at this stage.'],
    ['partly', 'What is the team?',
      'Small. Say the number plainly — an accelerator that finds out later has learned something about you rather than about the team.'],
    ['not', 'What are the numbers?',
      'No revenue, no retention curve, one finding opened. The strongest true thing is 118 findings that resolved themselves, which is the product working unattended.'],
  ],
  incubator: [
    ['have', 'Is any of it built?',
      'All of it that is claimed. Three of five verbs run today, one partly, one not — the Story tab marks each, and that list is the honest answer to this question.'],
    ['have', 'What is the hardest technical part?',
      'Keeping the model out of the decision. Understanding a question and narrating an answer are model work; choosing and evaluating are code, and a finding that crosses that line is thrown away.'],
    ['partly', 'What do you need?',
      'Access to clinic and automotive operators, and time to run the interviews. Money is not the binding constraint at $0.60 of infrastructure spend.'],
    ['not', 'Do you have customers?',
      'Users, not customers. Five running applications and nobody paying. Do not describe a delivered application as a sale.'],
  ],
};

function renderAsks() {
  const el = document.getElementById('cp-asks');
  if (!el) return;
  const rows = ASKS[audience] || [];
  const LABEL = { have: 'can evidence', partly: 'true but thin', not: 'no answer yet' };

  el.innerHTML = `
    <section class="cp">
      <div class="cp-seg" role="tablist" aria-label="Audience">
        ${AUDIENCES.map((a) => `
          <button type="button" class="cp-seg__b${a.id === audience ? ' is-on' : ''}"
                  data-aud="${a.id}" aria-selected="${a.id === audience}">
            ${a.name}<span>${a.note}</span>
          </button>`).join('')}
      </div>

      <ul class="cp-asks">
        ${rows.map(([state, q, a]) => `
          <li class="cp-ask is-${state}">
            <p class="cp-ask__q">${q}<span>${LABEL[state]}</span></p>
            <p class="cp-ask__a">${a}</p>
          </li>`).join('')}
      </ul>

      <p class="cp-note cp-note--wide">The third state is the useful one. A question with no honest
        answer is not a hole to be filled in the room — it is the thing to say plainly and then
        say what would answer it.</p>
    </section>`;

  el.querySelector('.cp-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-aud]');
    if (!b) return;
    audience = b.dataset.aud;
    renderAsks();
  });
}

/* ── Views ──────────────────────────────────────────────────────────────── */

const SUBTITLES = {
  story: 'What to say to somebody deciding whether to back this, and the numbers behind it. Read during a live conversation, so nothing on it is rounded up.',
  proof: `Measured ${MEASURED}, against the live databases. The numbers that look bad are on it — an investor who finds one out later finds out that it was hidden.`,
  asks: 'What each audience actually asks, and which answers can be evidenced today. The ones that cannot are marked, because inventing one in the room is how a second meeting is lost.',
};

function setView(view) {
  for (const v of ['story', 'proof', 'asks']) {
    document.getElementById('cp-' + v).hidden = v !== view;
    const b = document.getElementById('cp-view-' + v);
    b.classList.toggle('cp-view--on', v === view);
    b.setAttribute('aria-selected', String(v === view));
  }
  document.getElementById('cp-subtitle').textContent = SUBTITLES[view];
  if (view === 'proof') renderProof();
  if (view === 'asks') renderAsks();
}

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token || role !== 'admin') {
    localStorage.setItem('redirectAfterLogin', '/admin/capital.html');
    window.location.href = '/admin/login.html';
    return;
  }

  renderStory();
  for (const v of ['story', 'proof', 'asks']) {
    document.getElementById('cp-view-' + v).addEventListener('click', () => setView(v));
  }
});
