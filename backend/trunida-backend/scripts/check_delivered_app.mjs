/**
 * Svarg — is the delivered application actually usable?
 *
 * The build gates prove a project installs, boots and answers. None of them can
 * tell you it is worth opening: a churn classifier that scores every record 100
 * passes all of them, and is worthless the first time somebody reads the list.
 *
 * This runs against a DEPLOYED application over HTTP, the way a customer meets
 * it, and asserts the things that have actually gone wrong in delivered work:
 *
 *   node scripts/check_delivered_app.mjs https://app-xxxx.up.railway.app
 *
 * Nothing here is specific to one use case. Paths are discovered from /api and
 * fields are found by shape, because the generated application chooses its own
 * names — a check that only works for the application it was written against
 * is a check that silently stops working on the next one.
 *
 * Exits non-zero when a check fails, so it can gate a release.
 */

const BASE = (process.argv[2] || '').replace(/\/+$/, '');
if (!BASE) {
  console.error('Usage: node scripts/check_delivered_app.mjs <app-url>');
  process.exit(2);
}

let pass = 0, fail = 0, warn = 0;
const ok   = (m, d) => { console.log('  PASS  ' + m + (d ? ' — ' + d : '')); pass++; };
const bad  = (m, d) => { console.log('  FAIL  ' + m + (d ? ' — ' + d : '')); fail++; };
const note = (m, d) => { console.log('  WARN  ' + m + (d ? ' — ' + d : '')); warn++; };

async function req(path, opts) {
  const r = await fetch(BASE + path, opts);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not json, keep the text */ }
  return { status: r.status, body, text };
}

const field = (row, re, type) => Object.keys(row).find(
  k => re.test(k) && (!type || typeof row[k] === type));

// A score is a score whether it arrives as 12 or as "12%". Requiring a number
// meant an application that formatted its scores for display skipped every
// scoring check and reported all-green while every record scored the same.
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = parseFloat(v.trim());
  return Number.isFinite(n) ? n : null;
};

console.log('\nDelivered application check — ' + BASE + '\n');

// ── A visitor has to get in ─────────────────────────────────────────────────
const session = await req('/api/session', { method: 'POST' });
if (session.status !== 200 || !session.body || !session.body.token) {
  bad('a visitor can start a session', 'HTTP ' + session.status);
  console.log('\nNothing else can be checked without one.\n');
  process.exit(1);
}
ok('a visitor can start a session');
const auth = { Authorization: 'Bearer ' + session.body.token, 'Content-Type': 'application/json' };

// ── What it exposes ─────────────────────────────────────────────────────────
const root = await req('/api', { headers: auth });
const routes = (root.body && root.body.routes) || [];
if (!routes.length) {
  bad('the application mounted a route');
  console.log('\nThere is no application here to check.\n');
  process.exit(1);
}
ok('routes mounted', routes.join(', '));

// ── It has data ─────────────────────────────────────────────────────────────
// Tried in order rather than assumed: the listing path belongs to the generated
// application, and guessing wrong should cost a 404, not a false failure.
let records = [];
let from = '';
for (const base of routes) {
  for (const path of [base + '/risks', base + '/records', base + '/list', base + '/all', base]) {
    const res = await req(path, { headers: auth });
    if (res.status !== 200 || !res.body) continue;
    const arr = Array.isArray(res.body)
      ? res.body
      : Object.values(res.body).find(v => Array.isArray(v) && v.length && typeof v[0] === 'object');
    if (arr && arr.length) { records = arr; from = path; break; }
  }
  if (records.length) break;
}

if (records.length) ok('the database was seeded', records.length + ' records from ' + from);
else note('no record listing found', 'the data checks below are skipped');

// An application that answers with its evidence has already handed us the
// records. Skipping the data checks because no listing endpoint happened to
// exist let a "every student scores 12%" delivery pass with four green ticks.
const probe = await req(routes[0] + '/ask', {
  method: 'POST', headers: auth,
  body: JSON.stringify({ message: 'Who is most at risk right now, and why?' }),
});
if (!records.length && probe.status === 200 && probe.body) {
  const embedded = Object.values(probe.body)
    .find(v => Array.isArray(v) && v.length && typeof v[0] === 'object');
  if (embedded) {
    records = embedded;
    ok('records came back with the answer', records.length + ' shown as evidence');
  }
}

// ── The scoring has to mean something ───────────────────────────────────────
const scoreKey = records.length
  ? Object.keys(records[0]).find(k => /score|rating|probability|risk|rank/i.test(k)
      && records.every(r => num(r[k]) !== null))
  : null;

if (records.length && !scoreKey) {
  note('no numeric score field found', 'scoring checks skipped');
}

if (records.length && scoreKey) {
  const values = records.map(r => num(r[scoreKey])).filter(v => v !== null);
  const distinct = new Set(values);
  const top = Math.max(...values);

  if (distinct.size > 1) ok('scores discriminate between records', distinct.size + ' distinct ' + scoreKey + ' values');
  else bad('every record scored identically', scoreKey + ' = ' + values[0] + ' for all ' + values.length
           + ' — the ranking under it is arbitrary');

  // ── The outcome must not be scored as a prediction ────────────────────────
  // Using the thing you are predicting as a feature. The application runs
  // perfectly and its risk list is topped by people who already left.
  const SETTLED = /churn|withdraw|cancel|closed|lapsed|left|dropped|resign|inactive|expired|complete/i;
  const statusKey = field(records[0], /status|state|stage|outcome|disposition/i);

  if (!statusKey) {
    note('no status field found', 'cannot check whether the outcome is being scored');
  } else {
    const settled = records.filter(r => SETTLED.test(String(r[statusKey] || '')));
    const open = records.filter(r => !SETTLED.test(String(r[statusKey] || '')));

    if (!settled.length) {
      ok('no already-settled records are present to leak');
    } else {
      const leaked = settled.filter(r => num(r[scoreKey]) === top);
      if (leaked.length) {
        bad('records whose outcome already happened are scored as top risk',
            leaked.length + ' of ' + settled.length + ' at ' + scoreKey + '=' + top
            + ' (' + statusKey + ' already settled) — the outcome is being used as a feature');
        console.log('        e.g. ' + JSON.stringify(leaked[0][statusKey]) + ' scored ' + top);
      } else {
        ok('settled records are not scored as top risk');
      }
      if (open.length) ok('there are open records to score', open.length + ' still open');
      else note('every record is already settled', 'there is nothing left to predict');
    }
  }

  // ── A reason that contradicts its score ──────────────────────────────────
  const driverKey = field(records[0], /driver|reason|cause|why|factor|explanation/i);
  if (driverKey) {
    const bland = records.filter(r => num(r[scoreKey]) === top
      && /normal|none|standard|typical|no issue|healthy|lifecycle|n\/a/i.test(String(r[driverKey] || '')));
    if (bland.length) {
      bad('top-scored records give a reason that says nothing is wrong',
          bland.length + ' with ' + driverKey + ' = "' + bland[0][driverKey] + '"');
    } else {
      ok('reasons explain the scores they are attached to');
    }
  }
}

// ── The answer has to be readable on the page ───────────────────────────────
const askPath = routes[0] + '/ask';
const reply = await req(askPath, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ message: 'Who is most at risk right now, and why?' }),
});

if (reply.status !== 200) {
  note('no POST ' + askPath, 'HTTP ' + reply.status + ' — answer checks skipped');
} else {
  const answer = String((reply.body && reply.body.answer) || reply.text || '');

  const markdown = [
    [/^\s*#{1,6}\s/m, 'headings (###)'],
    [/\*\*[^*\n]+\*\*/, 'bold (**text**)'],
    [/^\s*[-*]\s+\S/m, 'bullet lines'],
  ].filter(p => p[0].test(answer)).map(p => p[1]);

  if (markdown.length) {
    bad('the answer contains markdown the page cannot render', markdown.join(', ')
        + ' — the customer reads the syntax');
  } else {
    ok('the answer is plain text the page can render');
  }

  if (answer.length > 1200) {
    note('the answer is very long', answer.length + ' chars — structure belongs in the record cards');
  } else {
    ok('the answer is a readable length', answer.length + ' chars');
  }

  // ── Sample data has to announce itself ──────────────────────────────────
  const usesSample = records.some(r => r._source === 'sample')
    || /"_source"\s*:\s*"sample"/.test(JSON.stringify(reply.body || {}));
  if (usesSample) {
    const says = /sample|illustrat|not real|demonstrat|generated data/i.test(answer)
      || (reply.body && reply.body.isSampleData === true);
    if (says) ok('the application says its data is sample data');
    else bad('answers come from sample data and nothing says so',
             'a generated figure read as a real number is the failure that matters here');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (warn ? ', ' + warn + ' warned' : '') + '\n');
process.exit(fail ? 1 : 0);
