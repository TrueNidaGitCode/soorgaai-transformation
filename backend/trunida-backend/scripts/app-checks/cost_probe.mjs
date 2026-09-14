/**
 * What one question actually costs, in tokens the provider counted.
 *
 * Both of us were estimating from prompt lengths and getting different
 * answers by a factor of twenty. This asks the model the two questions a
 * real chat turn asks — the plan and the sentence — and prints what came
 * back on the meter, so the next conversation about spend is about numbers.
 *
 * ── Why this file was wrong too ─────────────────────────────────────────────
 *
 * The first version read outputTokens and believed it. On a thinking model
 * that number was the visible answer only: thoughts were counted separately
 * by the provider, billed at the output rate, and added up by nobody. So the
 * probe built to settle the argument was making the same mistake as the
 * ledger and the spend cap, and agreed with them for the wrong reason.
 *
 * It now prints thinking apart from the answer, and runs each call twice —
 * once reasoning, once not — because the gap between those two rows is the
 * whole question of whether a chat turn is expensive or trivial.
 *
 * Costs about two questions to run.
 *
 * Usage, from backend/trunida-backend:
 *   node scripts/app-checks/cost_probe.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const BE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(BE, '.env') });
const { generate } = await import('file:///' + BE.split(path.sep).join('/') + '/services/llmService.js');

// A catalogue the size of the cricket academy's, so the plan prompt is real.
const CATALOGUE = `
- "Master Student Roster" — 64 rows, identified by student_id, undated
  columns: student_id; name; age; batch; guardian_phone; subscription_status (e.g. active, overdue); joined_on
- "Daily Session Roll Call Logs" — 83 rows, identified by session_date + player_name, dated by "session_date"
  columns: session_date (e.g. 2026-09-14, 2026-09-13); batch; player_name; reply; status (e.g. present, absent, excused)
- "Batch Training Schedule" — 36 rows, identified by batch + day, dated by "session_date"
  columns: batch; day; session_date; start_time; coach; ground`;

const CALLS = [
  {
    label: 'PLAN',
    maxTokens: 1100,
    systemPrompt: `You turn a question into steps over the datasets below. Return ONLY JSON with a steps array.\n\nTHE DATASETS${CATALOGUE}`,
    userMessage: 'Question: who has not confirmed attendance today?',
  },
  {
    label: 'SAY',
    maxTokens: 400,
    systemPrompt: 'Write the answer. One sentence first, then at most two more. Use only figures from the facts.',
    userMessage: 'Question: who has not confirmed attendance today?\n\nFACTS\n- Not confirmed (today): 6 records, 6 distinct\n  Arjun Bose; Rohan Sharma; Tanvi Reddy; Dhruv Mehta; Aditya Verma; Kavya Rao',
  },
];

// Gemini Flash list pricing at the time of writing. Change these if the rate
// card moves; they are here so the sum is visible rather than asserted.
const IN_PER_M = 0.30, OUT_PER_M = 2.50, USD_INR = 84;
const priceOf = (r) => (r.in / 1e6) * IN_PER_M + (r.out / 1e6) * OUT_PER_M;

async function run(thinking) {
  const rows = [];
  for (const c of CALLS) {
    const t0 = Date.now();
    const r = await generate({ ...c, thinking });
    rows.push({
      label:   c.label,
      in:      r.inputTokens    || 0,
      out:     r.outputTokens   || 0,   // answer + thoughts, as billed
      visible: r.visibleTokens  ?? r.outputTokens ?? 0,
      thought: r.thinkingTokens || 0,
      ms:      Date.now() - t0,
      model:   r.model,
      provider: r.provider,
    });
  }
  const total = rows.reduce((a, r) => ({
    label: 'TOTAL', in: a.in + r.in, out: a.out + r.out,
    visible: a.visible + r.visible, thought: a.thought + r.thought, ms: a.ms + r.ms,
  }), { in: 0, out: 0, visible: 0, thought: 0, ms: 0 });
  return { rows, total };
}

function table(title, { rows, total }) {
  console.log(`\n${title}`);
  console.log('  call     in     out   =  answer  + thinking     time');
  for (const r of [...rows, total]) {
    console.log(
      `  ${r.label.padEnd(5)} ${String(r.in).padStart(6)}  ${String(r.out).padStart(6)}   ` +
      `${String(r.visible).padStart(7)}  ${String(r.thought).padStart(9)}  ${String(r.ms).padStart(6)} ms`);
  }
  const usd = priceOf(total);
  console.log(`  one question ≈ $${usd.toFixed(5)}  (₹${(usd * USD_INR).toFixed(3)})`);
  console.log(`  88 questions ≈ $${(usd * 88).toFixed(3)}  (₹${(usd * 88 * USD_INR).toFixed(1)})`);
  return usd;
}

const on  = await run(undefined);   // as every call behaved before the fix
const off = await run(false);       // as the answer pipeline behaves now

console.log(`model: ${on.rows[0].model} via ${on.rows[0].provider}`);
console.log(`at $${IN_PER_M}/1M in and $${OUT_PER_M}/1M out — thinking is billed as output`);

const costOn  = table('reasoning on  (what a chat turn used to cost)', on);
const costOff = table('reasoning off (PLAN extracts JSON, SAY words supplied facts)', off);

const saved = costOn - costOff;
console.log(`\nthe difference: ₹${(saved * USD_INR).toFixed(3)} a question` +
  (costOn > 0 ? `, ${(100 * saved / costOn).toFixed(0)}% cheaper` : '') +
  `  —  ₹${(saved * 88 * USD_INR).toFixed(1)} across an 88-question suite`);

if (on.total.thought === 0) {
  console.log('\nNo thinking tokens were reported. Either this model does not think,');
  console.log('or the provider is not returning thoughtsTokenCount — check before');
  console.log('concluding the saving is zero.');
}
console.log('\nA question that has to retry its plan costs one more PLAN; one whose');
console.log('numbers do not check out costs one more SAY.');
