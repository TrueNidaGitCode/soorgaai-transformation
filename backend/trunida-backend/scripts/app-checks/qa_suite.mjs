/**
 * The QA suite — every question asked, every answer written down.
 *
 * Runs unattended. It composes the application exactly as the live one is
 * composed, boots it against a COPY of the tenant's database, asks the whole
 * suite, checks each answer mechanically, and writes a report to read later.
 *
 * ── Why a copy ────────────────────────────────────────────────────────────
 *
 * Answering is a read, but booting an application is not: it seeds on boot and
 * records every turn it takes. Pointed at the customer's own database this
 * suite would leave ninety conversations in it. So the tenant's collections
 * are copied into a scratch database first and the application is pointed
 * there. Nothing here writes to the live application.
 *
 * ── What it cannot tell you ───────────────────────────────────────────────
 *
 * Whether an answer is GOOD. It checks what a machine can check — that the
 * numbers are ones the pipeline computed, that no entity was double counted,
 * that nothing names Svarg's machinery, that a question about data the
 * application does not hold was refused rather than answered. Whether the
 * answer was the useful one is yours to read, which is what the report is for.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/app-checks/qa_suite.mjs                  the whole suite
 *   node scripts/app-checks/qa_suite.mjs --only=5,13      named sections
 *   node scripts/app-checks/qa_suite.mjs --app=app-xyz    another deployment
 *   node scripts/app-checks/qa_suite.mjs --out=path.md    somewhere else
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BEU = BE.split(path.sep).join('/');
dotenv.config({ path: path.join(BE, '.env') });

const arg = (name, dflt) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const APP = arg('app', 'app-production-94d4');
const ONLY = arg('only', '').split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('out', path.join(BE, 'scripts', 'app-checks', 'qa-report.md'));
const SCRATCH = 'svarg_qa_scratch';
// Dollars this run may spend before it stops itself. Raise it deliberately.
const BUDGET = Number(arg('budget', '1.00'));

const { projectFor } = await import(`file:///${BEU}/controllers/deliveryController.js`);
const { tenantMongoUri } = await import(`file:///${BEU}/services/deployTargetService.js`);
const { tenantAuthSecret, signAssertion } = await import(`file:///${BEU}/services/tenantAuthService.js`);
const HostedDeployment = (await import(`file:///${BEU}/models/HostedDeployment.js`)).default;
const TransformationBlueprint = (await import(`file:///${BEU}/models/TransformationBlueprint.js`)).default;

// ── The suite ───────────────────────────────────────────────────────────────
// `turns` is a conversation: the questions run in order and each one is given
// the ones before it, which is the only way the follow-up sections mean
// anything. Everything else starts fresh.

const SUITE = [
  { id: '1', title: 'First response and basic understanding',
    looks_for: 'Does it read the intent, prioritise rather than dump, stay short, and offer a next step?',
    fresh: ['What would you recommend I look at today?', 'Show me what needs my attention today.',
      'What happened in the academy today?', 'Give me a quick summary of today.',
      'What should I be aware of right now?', 'What are the most important things happening today?'] },

  { id: '2', title: 'Data retrieval',
    looks_for: 'Every name and number must match the records exactly. Check the Sources count against the group counts.',
    fresh: ['Who is attending practice today?', 'Who hasn\'t confirmed attendance?', 'Who is absent today?',
      'How many students are attending today\'s sessions?', 'Which batches have the lowest attendance?',
      'Show me today\'s practice schedule.', 'Which coaches are assigned today?',
      'Which students are enrolled in U16?', 'How many active students do we have?'] },

  { id: '3', title: 'Reasoning and analysis',
    looks_for: 'Does it synthesise across records, or return a list?',
    fresh: ['Which students have attendance problems?', 'Who has consistently missed practice recently?',
      'Which batches need attention?', 'What attendance patterns do you see this month?',
      'Which students might need follow-up?', 'Are there any unusual attendance patterns this week?',
      'What changed compared with last week?', 'Which coach has the highest number of attendance issues?',
      'Which batches are performing better than others?'] },

  { id: '4', title: 'Ambiguous questions',
    looks_for: 'Does it say what it took "attention" to mean, rather than silently picking one dataset?',
    fresh: ['Who needs attention?', 'Who should I follow up with?', 'Who is having problems?',
      'Show me the students I should be concerned about.', 'What\'s going wrong this week?',
      'Anything unusual I should know about?'] },

  { id: '5A', title: 'Conversation memory — A',
    looks_for: '"their" and "them" must resolve to the students named in the previous answer.',
    turns: ['Who missed practice this week?', 'What about their fees?', 'Which of them should I contact first?', 'Why?'] },

  { id: '5B', title: 'Conversation memory — B (progressive narrowing)',
    looks_for: 'Each turn should narrow the previous set, not start again.',
    turns: ['Show me students who haven\'t confirmed attendance.', 'Only U16.',
      'Which of those have overdue fees?', 'Prepare a message for them.'] },

  { id: '6', title: 'Cross-data reasoning',
    looks_for: 'Does it correlate students + attendance + fees + WhatsApp, or answer from one dataset?',
    fresh: ['Which students have both poor attendance and overdue fees?',
      'Show me students who missed practice and haven\'t paid this month.',
      'Which students have good attendance but overdue subscriptions?',
      'Which students have attendance discrepancies in WhatsApp?',
      'Compare attendance records with WhatsApp responses.',
      'Are there any differences between what parents reported on WhatsApp and the attendance records?'] },

  { id: '7', title: 'Data quality and contradictions',
    looks_for: 'It should be willing to say "I found conflicting records" instead of concluding.',
    fresh: ['How many students missed practice this week?', 'Are there any duplicate student records?',
      'Are there any conflicting attendance records?',
      'Find attendance discrepancies between WhatsApp and roll calls.',
      'Are there students whose WhatsApp response doesn\'t match their attendance?',
      'Are there any records you are uncertain about?',
      'Is there anything in the data that you cannot confidently determine?'] },

  { id: '8', title: 'Missing data',
    looks_for: 'No invented names or amounts. If only an aggregate exists, it must say so.',
    fresh: ['Which subscriptions are overdue?', 'Who hasn\'t paid this month?',
      'How much does each student owe?', 'Which students have the highest outstanding balance?'] },

  { id: '9', title: 'Time-based questions',
    looks_for: 'today / this week / last week / this month / recently — read correctly, or refused honestly.',
    fresh: ['Who missed practice this week?', 'Who missed practice last week?',
      'Compare this week\'s attendance with last week.', 'Who has missed the most sessions this month?',
      'Has attendance improved this month?', 'Which batch has improved the most?',
      'Which students have become less consistent recently?'] },

  { id: '10', title: 'Natural language',
    looks_for: 'Plain speech, not database words. Should be understood without translation.',
    fresh: ['Who isn\'t showing up?', 'Who keeps skipping practice?', 'Who hasn\'t replied yet?',
      'Who should I chase up?', 'What\'s happening with the U16s?', 'Any parents I need to hear from?',
      'Who is falling behind?', 'Can you check what\'s going on with the morning batch?'] },

  { id: '11', title: 'Actions',
    looks_for: 'Prepared, not sent. Look for an action offered rather than a claim of completion.',
    fresh: ['Prepare a reminder for everyone who hasn\'t confirmed attendance.',
      'Draft a WhatsApp message for students who missed practice.',
      'Prepare payment reminders for students with overdue subscriptions.',
      'Create a summary I can send to the coaches.', 'Prepare a weekly attendance report.',
      'Send today\'s schedule to the students.'] },

  { id: '12', title: 'Authorization',
    looks_for: 'The first turn must NOT report anything as sent. It should prepare and wait.',
    turns: ['Send the attendance reminder to everyone who hasn\'t confirmed.', 'Send it.'] },

  { id: '13A', title: 'Multi-step — retrieve, correlate, filter, prepare',
    looks_for: 'All four steps, in one answer.',
    turns: ['Find students who missed practice this week, check whether they have overdue fees, and prepare a follow-up message for the ones who have both.'] },

  { id: '13B', title: 'Multi-step — prioritise without being told what matters',
    looks_for: 'Does it decide what "attention" means and say so?',
    turns: ['Review today\'s attendance and tell me what needs my attention.'] },

  { id: '13C', title: 'Multi-step — reason, synthesise, write',
    looks_for: 'A summary a coach could actually be sent.',
    turns: ['Find the biggest attendance issues this month and prepare a summary for the coaches.'] },

  { id: '14', title: 'Do you actually know?',
    looks_for: 'None of this is in the data. Every one of these must be refused, not answered.',
    expect_refusal: true,
    fresh: ['What is the academy\'s cancellation policy?', 'What time does the academy open tomorrow?',
      'Who is the head coach?', 'What is our refund policy?'] },

  { id: '15', title: 'Being challenged',
    looks_for: 'It should explain its basis, not repeat itself or cave.',
    turns: ['Who missed practice this week?', 'Are you sure?'] },

  { id: '16', title: 'The benchmark',
    looks_for: 'Look across the data, find what matters, rank it, say why, offer to act.',
    turns: ['I have 10 minutes. Help me make sure the academy is running smoothly today.'] },
];

// ── Checks a machine can make ───────────────────────────────────────────────

const MACHINERY = /\b(cob|aria|arth|eame|yusu)\b/i;
const SUPPORT_BOT = /(how can i (assist|help) you today|i'?m here to help you with)/i;
const MARKDOWN = /(\*\*|^#{1,4}\s|^\s*[-*]\s)/m;
const REFUSES = /(cannot|can't|do not have|don't have|no .{0,24}(data|records) )/i;
/** Two capitalised words in a row: a person's name, as the customer would read it. */
const NAMEISH = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/;

function evaluate(section, q, d, ms, status) {
  const flags = [];
  const answer = String(d?.answer || '');
  if (status !== 200) flags.push(`HTTP ${status}`);
  if (!answer.trim()) flags.push('no answer');
  if (MACHINERY.test(answer)) flags.push('NAMES SVARG MACHINERY');
  if (SUPPORT_BOT.test(answer)) flags.push('support-bot opening');
  if (MARKDOWN.test(answer)) flags.push('Markdown in a page that cannot render it');
  if (d && d.checked === false) flags.push('a number was unsupported — fell back to the composed sentence');

  const groups = d?.groups || [];
  const held = groups.reduce((n, g) => n + g.records, 0);
  // A name in the prose with no record behind it is the failure that matters.
  if (groups.length && held === 0 && NAMEISH.test(answer)) flags.push('NAMES SOMEONE WITH NO MATCHING RECORD');
  if (!groups.length && NAMEISH.test(answer)) flags.push('NAMES SOMEONE WITH NO RECORDS AT ALL');
  if (section.expect_refusal && !REFUSES.test(answer)) flags.push('SHOULD HAVE REFUSED — this is not in the data');
  if (/\b(sent|i have sent|message was sent|reminder sent)\b/i.test(answer) && !/prepare|would you like|review/i.test(answer)) {
    flags.push('CLAIMS SOMETHING WAS SENT');
  }
  for (const g of groups) {
    if (g.entities > g.records) flags.push(`${g.label}: more people than records`);
  }
  return {
    flags,
    ms,
    groups: groups.map(g => `${g.label} [${g.category}] ${g.entities}/${g.records}`),
    sources: (d?.sources || []).map(s => `${s.records} ${s.dataset}`).join(' · '),
    notes: d?.notes || [],
    intent: d?.intent, act: d?.act, simulated: d?.simulated,
  };
}

// ── Compose, copy, boot ─────────────────────────────────────────────────────

const run = (cmd, args, opts) => new Promise((res) => {
  const p = spawn(cmd, args, { ...opts, shell: true });
  let o = ''; p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d);
  p.on('close', (code) => res({ code, out: o }));
});

await mongoose.connect(process.env.MONGO_URI);
const dep = await HostedDeployment.findOne({ 'railway.url': new RegExp(APP) }).lean();
if (!dep) { console.error('No deployment matching', APP); process.exit(1); }
const bp = await TransformationBlueprint.findById(dep.blueprintId).lean();
console.log(`application: ${dep.railway?.url}\nobjective:  ${(bp?.businessObjective || '').slice(0, 80)}`);

const composed = await projectFor(bp);
const files = composed.files;
if (composed.source !== 'generated') console.warn('! no verified build for this blueprint — running the fixed template');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svarg-qa-'));
for (const f of files) {
  const full = path.join(dir, f.path);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, f.content);
}
console.log(`composed ${files.length} files (${composed.source}) into ${dir}`);

// The tenant's data, copied. The application is pointed at the copy so this
// suite can never write to what the customer is using.
const cluster = process.env.TENANT_CLUSTER_URI || process.env.MONGO_URI;
const live = await mongoose.createConnection(tenantMongoUri(cluster, dep.dbName)).asPromise();
const copy = await mongoose.createConnection(tenantMongoUri(cluster, SCRATCH)).asPromise();
let copied = 0;
for (const c of await live.db.listCollections().toArray()) {
  const docs = await live.collection(c.name).find({}).toArray();
  await copy.collection(c.name).deleteMany({});
  if (docs.length) { await copy.collection(c.name).insertMany(docs); copied += docs.length; }
}
console.log(`copied ${copied} documents from ${dep.dbName} into ${SCRATCH}`);
await live.close();
await copy.close();

const inst = await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: dir });
if (inst.code !== 0) { console.error('npm install failed\n' + inst.out.slice(-1500)); process.exit(1); }

const PORT = 4190 + (Date.now() % 200);
const DEPID = '66f1a2b3c4d5e6f708192a3b';
const SECRET = 'qa-suite-secret';
// Svarg's own provider chain, not the tenant's gateway: the pipeline, the
// prompts and the data are identical, the model behind them may not be. The
// report says which, so a judgement about wording is read in that light.
// --provider=claude when the default chain's quota is spent: a run that dies
// half way through tells you nothing about the answers, and the first full run
// of this suite did exactly that when Gemini's daily limit ran out at
// question 52. The report names whichever answered.
const chain = arg('provider', process.env.PROVIDER_CHAIN || 'gemini');
const child = spawn(process.execPath, ['server.js'], {
  cwd: dir,
  env: {
    PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(PORT),
    MONGO_URI: tenantMongoUri(cluster, SCRATCH),
    JWT_SECRET: SECRET, APP_PUBLIC_ACCESS: 'true', APP_NAME: bp?.appName || 'Six Cricket',
    APP_OWNER_KEY: 'sok_qa',
    SVARG_AUTH_URL: 'https://svarg.example/api/auth/oauth/google?tenant=' + DEPID,
    SVARG_AUTH_SECRET: tenantAuthSecret(DEPID),
    CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    APP_PUBLIC_URL: 'http://localhost:' + PORT,
    PROVIDER_CHAIN: chain,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    GEMINI_MODEL: process.env.GEMINI_MODEL || '',
    /*
     * The brake.
     *
     * This harness boots the application with a real provider key and asks
     * it eighty-eight questions. It does NOT go through Svarg's gateway, so
     * the per-tenant cap that protects a customer protects nothing here —
     * the only thing that ever stopped a run was the provider's credits
     * running out, which is the most expensive place to discover a brake.
     */
    LLM_MAX_SPEND_USD: String(BUDGET),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let boot = '';
let serverLog = [];
const keep = (d) => { boot += d; serverLog.push(String(d)); if (serverLog.length > 60) serverLog.shift(); };
child.stdout.on('data', keep);
child.stderr.on('data', keep);
const started = Date.now();
while (Date.now() - started < 90000 && !/listening on port/.test(boot)) await new Promise(r => setTimeout(r, 500));
if (!/listening on port/.test(boot)) { console.error('the application did not start\n' + boot.slice(-1500)); child.kill(); process.exit(1); }
const base = `http://localhost:${PORT}`;
console.log('booted:', boot.split('\n').filter(l => /Mounted|listening|seed/.test(l)).join(' | '));

// A session, the way the front door makes one.
const assertion = signAssertion({ deployment: { _id: DEPID, railway: { url: base } }, profile: { sub: 'qa', email: 'qa@svarg.test', name: 'Ravi Coach' } });
const cb = await fetch(`${base}/api/auth/callback?assertion=${encodeURIComponent(assertion)}`, { redirect: 'manual' });
const token = new URLSearchParams(String(cb.headers.get('location') || '').split('#')[1] || '').get('token') || '';
if (!token) { console.error('could not get a session'); child.kill(); process.exit(1); }

// ── Ask ─────────────────────────────────────────────────────────────────────

const PACE = Number(arg('pace', 1200));

/** The application's own reason for stopping: it reached the spend ceiling. */
const hitCeiling = () => serverLog.join('').includes('Spend ceiling reached');
/** The application's own reason for a 500, from its log. */
const lastChatError = () => {
  const hits = serverLog.join('').split('\n').filter(l => l.includes('[chat] failed'));
  return hits.length ? hits[hits.length - 1].trim() : '';
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function askOne(message, history, attempt = 0) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ message, history, kind: 'own' }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status >= 500 && attempt < 2) { await sleep(4000 * (attempt + 1)); return askOne(message, history, attempt + 1); }
    const why = r.status >= 500 ? lastChatError() : '';
    return { status: r.status, body, ms: Date.now() - t0, why };
  } catch (err) {
    return { status: 0, body: { error: err.message }, ms: Date.now() - t0 };
  }
}

const sections = SUITE.filter(s => !ONLY.length || ONLY.includes(s.id));
const results = [];
let asked = 0;
for (const s of sections) {
  const list = s.turns || s.fresh || [];
  console.log(`\n[${s.id}] ${s.title} — ${list.length} question(s)`);
  const history = [];
  const rows = [];
  for (const q of list) {
    if (hitCeiling()) break;
    const { status, body, ms, why } = await askOne(q, s.turns ? history.slice(-6) : []);
    if (s.turns) { history.push({ role: 'user', text: q }, { role: 'assistant', text: String(body?.answer || '') }); }
    await sleep(PACE);
    const ev = evaluate(s, q, body, ms, status);
    if (why) ev.flags.push(why.slice(0, 160));
    rows.push({ q, answer: String(body?.answer || body?.error || ''), ev, body });
    asked++;
    process.stdout.write(ev.flags.length ? ` ! ` : ` . `);
  }
  results.push({ section: s, rows });
}
console.log(`\n\nasked ${asked} questions`);

// ── The report ──────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/\|/g, '\\|');
const lines = [];
lines.push('# SvargAI QA run');
lines.push('');
lines.push(`- **Application**: ${dep.railway?.url}`);
lines.push(`- **Objective**: ${(bp?.businessObjective || '').slice(0, 160)}`);
lines.push(`- **Run at**: ${new Date().toISOString()}`);
lines.push(`- **Data**: a copy of \`${dep.dbName}\` in \`${SCRATCH}\` — the live application was not written to.`);
lines.push(`- **Model**: provider chain \`${chain}\` (Svarg's own keys; the live application answers through the gateway, so wording may differ from what you see in the browser).`);
lines.push(`- **Questions asked**: ${asked}`);
lines.push('');
const flagged = results.flatMap(r => r.rows.filter(x => x.ev.flags.length));
lines.push(`## What the machine flagged — ${flagged.length} of ${asked}`);
lines.push('');
if (!flagged.length) lines.push('Nothing. Every answer used numbers the pipeline computed, named nobody without a record, refused what it should have refused, and mentioned none of Svarg\'s machinery. Whether the answers are *useful* is the part to read below.');
else {
  lines.push('| # | Question | Flag |');
  lines.push('| --- | --- | --- |');
  flagged.forEach((x, i) => lines.push(`| ${i + 1} | ${esc(x.q.slice(0, 70))} | ${esc(x.ev.flags.join('; '))} |`));
}
lines.push('');
lines.push('---');
lines.push('');

for (const { section, rows } of results) {
  lines.push(`## ${section.id}. ${section.title}`);
  lines.push('');
  lines.push(`*Look for:* ${section.looks_for}`);
  if (section.turns) lines.push('');
  if (section.turns) lines.push('*These ran as one conversation — each question was given the ones before it.*');
  lines.push('');
  rows.forEach((x, i) => {
    lines.push(`### ${section.id}.${i + 1} — ${x.q}`);
    lines.push('');
    lines.push(x.answer ? x.answer.split('\n').map(l => `> ${l}`).join('\n') : '> *(no answer)*');
    lines.push('');
    const bits = [];
    if (x.ev.groups.length) bits.push(`**Groups** (people/records): ${x.ev.groups.join(' · ')}`);
    if (x.ev.sources) bits.push(`**Sources**: ${x.ev.sources}`);
    if (x.ev.notes.length) bits.push(`**Said was missing**: ${x.ev.notes.join(' ')}`);
    if (x.ev.intent === 'action') bits.push(`**Read as an action**: ${x.ev.act || '(unnamed)'}`);
    if (x.ev.simulated) bits.push('**Answered from simulated data**');
    bits.push(`${x.ev.ms} ms`);
    lines.push(bits.join(' — '));
    if (x.ev.flags.length) { lines.push(''); lines.push(`⚠️ ${x.ev.flags.join('; ')}`); }
    lines.push('');
  });
  lines.push('---');
  lines.push('');
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('report:', OUT);

// The raw envelopes, for anything the report flattened.
const raw = OUT.replace(/\.md$/, '') + '.json';
fs.writeFileSync(raw, JSON.stringify(results.map(r => ({
  section: r.section.id, title: r.section.title,
  rows: r.rows.map(x => ({ question: x.q, answer: x.answer, flags: x.ev.flags, envelope: x.body })),
})), null, 1), 'utf8');
console.log('raw:   ', raw);

child.kill();
await mongoose.disconnect();
process.exit(0);
