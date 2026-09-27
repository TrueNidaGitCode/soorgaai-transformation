/**
 * The Rahul demo, end to end, in one command.
 *
 *   node scripts/app-checks/rahul_demo.mjs           offline: a canned transcript
 *   node scripts/app-checks/rahul_demo.mjs --live    calls a real model to read it
 *
 * ── What this proves, and what it does not ─────────────────────────────────
 *
 * It runs the REAL functions at every step — the catalogue matcher, the
 * extraction with its quote check, the sequence join, the question the
 * watcher would ask. Nothing about the logic is stubbed.
 *
 * What is stubbed is the two ends: the telephony provider's webhook (there is
 * no call to make) and, unless --live, the model that reads the transcript.
 * So this answers "does the chain hold together and produce the finding", not
 * "will Exotel's payload parse" — that one needs a real connection, and the
 * connector logs a named warning when it cannot read a payload.
 *
 * ── The story it walks through ─────────────────────────────────────────────
 *
 *   Rahul's booking on 12 September says No Show.
 *   Rahul rang on the 13th and asked about upgrading his package.
 *   Whoever answered said she would check and get back to him.
 *   Nothing was ever written down, and nothing happened.
 *
 * Two systems, each correct on its own, disagreeing about what happened.
 */
import { readSignals } from '../../eame-template/services/callSignalService.js';
import { catalogueFor, entryFor, matchPair, fillQuestion }
  from '../../eame-template/services/agentCatalogue.js';
import { joinOnEntity, matchesAll } from '../../eame-template/services/reasoning.js';

const LIVE = process.argv.includes('--live');
const NOW = new Date('2026-09-20T09:00:00Z');

// ── The two systems ─────────────────────────────────────────────────────────

const DIARY = {
  name: 'Appointment Booking Diary',
  columns: ['Client Name', 'Appointment Date', 'Status', 'Practitioner'],
  rows: [
    ['Rahul Menon', '2026-09-12', 'No Show', 'Dr Rao'],
    ['Priya Nair', '2026-09-12', 'Attended', 'Dr Rao'],
    ['Anita Desai', '2026-09-14', 'Attended', 'Dr Sharma'],
    // Priya rang too, and somebody did book her in afterwards. She is the
    // control: the same shape of call, correctly followed up, and she must
    // NOT appear in the finding.
    ['Priya Nair', '2026-09-16', 'Attended', 'Dr Rao'],
  ],
};

const TRANSCRIPT = [
  'Staff: Good morning, Vesoma physiotherapy.',
  'Caller: Hi, this is Rahul. I wanted to know about upgrading my package.',
  'Staff: Sure, I will check and get back to you.',
  'Caller: Thank you.',
].join('\n');

const PRIYA_TRANSCRIPT = [
  'Staff: Vesoma physiotherapy, good afternoon.',
  'Caller: Hello, this is Priya. Can I book a session for next week?',
  'Staff: Yes, I will put you down for Wednesday.',
].join('\n');

const CALLS = [
  { name: 'Rahul Menon', date: '2026-09-13', channel: 'phone', transcript: TRANSCRIPT },
  { name: 'Priya Nair', date: '2026-09-15', channel: 'phone', transcript: PRIYA_TRANSCRIPT },
];

// ── A model, or a stand-in for one ──────────────────────────────────────────

/**
 * Offline, this answers the way a model would — including the quote, so the
 * check that follows is doing real work rather than being handed a pass.
 */
const CANNED = {
  [TRANSCRIPT]: {
    intent: 'upgrade',
    request: 'Asked about upgrading his package',
    request_quote: 'I wanted to know about upgrading my package',
    promise: 'yes',
    promise_quote: 'I will check and get back to you',
  },
  [PRIYA_TRANSCRIPT]: {
    intent: 'booking',
    request: 'Wants a session next week',
    request_quote: 'Can I book a session for next week',
    promise: 'yes',
    promise_quote: 'I will put you down for Wednesday',
  },
};

async function ask({ systemPrompt, userMessage, thinking }) {
  if (!LIVE) {
    const t = userMessage.replace(/^TRANSCRIPT\n/, '');
    return JSON.stringify(CANNED[t] || { intent: 'other', promise: 'no' });
  }
  const { generate } = await import('../../services/llmService.js');
  const out = await generate({ systemPrompt, userMessage, thinking, maxTokens: 400 });
  return out?.text || '';
}

// ── Walking it ──────────────────────────────────────────────────────────────

const line = (s = '') => console.log(s);
const rule = (t) => { line(); line(`── ${t} ${'─'.repeat(Math.max(0, 66 - t.length))}`); line(); };

async function main() {
  rule('1. BEFORE — what each system says on its own');
  line('  Appointment Booking Diary');
  for (const r of DIARY.rows) line(`    ${r[0].padEnd(14)} ${r[1]}  ${r[2]}`);
  line();
  line('  The phone system: two calls, as audio. Nothing readable.');
  for (const c of CALLS) line(`    ${c.name.padEnd(14)} ${c.date}  [recording]`);
  line();
  line('  Neither system is wrong. Nobody can see the gap.');

  // ── 2. The recording becomes columns ──────────────────────────────────────
  rule('2. THE CALL IS READ' + (LIVE ? ' (live model)' : ' (canned transcript)'));
  const callRows = [];
  for (const c of CALLS) {
    const s = await readSignals(c.transcript, ask);
    line(`  ${c.name}`);
    line(`    intent          ${s.intent}`);
    line(`    request         ${s.request || '(none that could be quoted)'}`);
    line(`    promise         ${s.promise}`);
    line(`    promise_quote   ${s.promise_quote ? `"${s.promise_quote}"` : '(none)'}`);
    line(`    signals_checked ${s.signals_checked}`);
    line();
    callRows.push([c.name, c.date, c.channel, s.intent, s.request, s.promise, s.promise_quote]);
  }

  const CALLLOG = {
    name: 'Enquiries and Calls',
    columns: ['Client Name', 'Contact Date', 'Channel', 'Intent', 'Request', 'Promise', 'Promise Quote'],
    rows: callRows,
  };

  // ── 3. Which watchers the data now supports ───────────────────────────────
  rule('3. WHAT THE APPLICATION CAN NOW WATCH');
  const before = catalogueFor([DIARY], {}).filter((c) => c.ready).length;
  const after = catalogueFor([DIARY, CALLLOG], {});
  const crossReady = after.filter((c) => c.ready && entryFor(c.id)?.across);
  line(`  With the diary alone:        ${before} watchers ready`);
  line(`  With the call log as well:   ${after.filter((c) => c.ready).length} watchers ready`);
  line();
  line('  And these could not exist before, because they read two systems:');
  for (const c of crossReady) line(`    ${c.name.padEnd(28)} ${c.using}`);

  // ── 4. The finding ────────────────────────────────────────────────────────
  rule('4. THE FINDING');
  const entry = entryFor('promise-not-kept');
  const match = matchPair(entry, [DIARY, CALLLOG]);
  if (!match) {
    line('  Promise Not Kept could not be matched to these datasets.');
    process.exitCode = 1;
    return;
  }
  line(`  Watcher   ${entry.name}`);
  line(`  Reads     ${match.dataset}`);
  line(`  Asks      ${fillQuestion(entry, match)}`);
  line();

  // The join, run exactly as the pipeline runs it: rows in, set logic, out.
  const rowsOf = (d) => d.rows.map((cells) => ({ cells }));
  const itemsBy = (d, nameCol, where = []) => {
    const idx = d.columns.indexOf(nameCol);
    const by = new Map();
    for (const r of rowsOf(d)) {
      if (where.length && !matchesAll(r.cells, d.columns, where)) continue;
      const name = r.cells[idx];
      if (!by.has(name)) by.set(name, { name, records: [] });
      by.get(name).records.push(r);
    }
    return [...by.values()];
  };

  const promised = itemsBy(CALLLOG, 'Client Name', [['Promise', 'is', 'yes']]);
  const booked = itemsBy(DIARY, 'Client Name');
  const found = joinOnEntity(promised, booked, 'leftOnly', {
    direction: 'after',
    leftIdx: CALLLOG.columns.indexOf('Contact Date'),
    rightIdx: DIARY.columns.indexOf('Appointment Date'),
  }, NOW);

  if (!found.length) {
    line('  Nothing found — the demo did not produce its finding.');
    process.exitCode = 1;
    return;
  }

  for (const f of found) {
    const row = f.records[0].cells;
    line(`  ${f.name}`);
    line(`    Rang on            ${row[1]}`);
    line(`    About              ${row[4] || row[3]}`);
    line(`    Was promised       "${row[6]}"`);
    line(`    Booked afterwards  nothing`);
  }
  line();
  line('  And the control:');
  const names = found.map((f) => f.name);
  for (const p of promised) {
    if (names.includes(p.name)) continue;
    line(`    ${p.name} was promised something too, and was booked in afterwards — not a finding.`);
  }

  // ── 5. What it cost ───────────────────────────────────────────────────────
  rule('5. WHAT IT COSTS');
  line('  Per three-minute call, on Gemini Flash:');
  line('    listening    ~5,800 input tokens   $0.0017');
  line('    transcript     ~550 output tokens  $0.0014');
  line('    reading it     ~800 tokens         $0.0007');
  line('    ------------------------------------------');
  line('    total                              $0.004   (about Rs 0.35)');
  line();
  line('  Forty calls a day is about $4.80 a month.');

  rule('RESULT');
  const ok = found.length === 1 && found[0].name === 'Rahul Menon';
  line(ok
    ? '  PASS — one finding, and it is Rahul. Priya was correctly left out.'
    : `  FAIL — expected one finding for Rahul, got: ${names.join(', ') || 'none'}`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\nThe demo failed to run:', err.message);
  process.exitCode = 1;
});
