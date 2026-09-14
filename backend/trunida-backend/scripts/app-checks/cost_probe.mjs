/**
 * What one question actually costs, in tokens the provider counted.
 *
 * Both of us were estimating from prompt lengths and getting different
 * answers by a factor of twenty. This asks the model the two questions a
 * real chat turn asks — the plan and the sentence — and prints what came
 * back on the meter, so the next conversation about spend is about numbers.
 *
 * Costs about one question to run.
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

const runs = [];
async function call(label, systemPrompt, userMessage, maxTokens) {
  const t0 = Date.now();
  const r = await generate({ systemPrompt, userMessage, maxTokens });
  runs.push({ label, in: r.inputTokens || 0, out: r.outputTokens || 0, ms: Date.now() - t0, model: r.model, provider: r.provider });
}

await call('PLAN',
  `You turn a question into steps over the datasets below. Return ONLY JSON with a steps array.\n\nTHE DATASETS${CATALOGUE}`,
  'Question: who has not confirmed attendance today?', 1100);

await call('SAY',
  'Write the answer. One sentence first, then at most two more. Use only figures from the facts.',
  'Question: who has not confirmed attendance today?\n\nFACTS\n- Not confirmed (today): 6 records, 6 distinct\n  Arjun Bose; Rohan Sharma; Tanvi Reddy; Dhruv Mehta; Aditya Verma; Kavya Rao', 400);

const totIn = runs.reduce((n, r) => n + r.in, 0);
const totOut = runs.reduce((n, r) => n + r.out, 0);

console.log(`model: ${runs[0].model} via ${runs[0].provider}\n`);
for (const r of runs) console.log(`  ${r.label.padEnd(5)} in ${String(r.in).padStart(6)}   out ${String(r.out).padStart(5)}   ${r.ms} ms`);
console.log(`  ${'TOTAL'.padEnd(5)} in ${String(totIn).padStart(6)}   out ${String(totOut).padStart(5)}   — one question, no retries`);

// Gemini Flash list pricing at the time of writing. Change these if the rate
// card moves; they are here so the sum is visible rather than asserted.
const IN_PER_M = 0.30, OUT_PER_M = 2.50, USD_INR = 84;
const usd = (totIn / 1e6) * IN_PER_M + (totOut / 1e6) * OUT_PER_M;
console.log(`\nat $${IN_PER_M}/1M in and $${OUT_PER_M}/1M out:`);
console.log(`  one question ≈ $${usd.toFixed(5)}  (₹${(usd * USD_INR).toFixed(3)})`);
console.log(`  88 questions ≈ $${(usd * 88).toFixed(3)}  (₹${(usd * 88 * USD_INR).toFixed(1)})`);
console.log('\nA question that has to retry its plan costs one more PLAN; one whose');
console.log('numbers do not check out costs one more SAY.');
