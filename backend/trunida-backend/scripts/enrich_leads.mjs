/**
 * Turn company names into industries, now, rather than waiting for the sweep.
 *
 * The same work the scheduler does every ten minutes, on demand — for when a
 * prospect has just been added and the answer is wanted before the next tick,
 * or for draining a backlog deliberately rather than over days.
 *
 * It answers the question the manual loop was for: what industry is this, and
 * is there a knowledge base for it? Where there is not, the industry is left
 * as a shell on the admin page with a Generate button beside it — never
 * generated here, because that is around sixteen web-search-grounded calls and
 * a decision with a price.
 *
 *   node scripts/enrich_leads.mjs                 # what is waiting, costs nothing
 *   node scripts/enrich_leads.mjs --go            # look up the next few
 *   node scripts/enrich_leads.mjs --go --limit 10
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import ColdLead from '../models/ColdLead.js';
import {
  runEnrichmentSweep, enrichableLeads, spentToday, PER_SWEEP, DAILY_CAP,
} from '../services/leadEnrichmentService.js';
import { listKnownIndustries } from '../services/industryCapabilityKnowledgeService.js';

const args = process.argv.slice(2);
const go = args.includes('--go');
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) || PER_SWEEP : PER_SWEEP;

await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

const all = await ColdLead.find({}).lean();
const waiting = enrichableLeads(all);
const spent = await spentToday();

console.log(`${all.length} leads, ${waiting.length} with a company and no industry yet.`);
console.log(`${spent} looked up today, ${Math.max(0, DAILY_CAP - spent)} left in the daily budget.\n`);

// What the board would say today, which is the whole point of the exercise.
const known = new Set((await listKnownIndustries().catch(() => [])).map((i) => i.toLowerCase()));
const byIndustry = new Map();
for (const l of all) {
  const i = String(l.industry || '').trim();
  if (i) byIndustry.set(i, (byIndustry.get(i) || 0) + 1);
}
if (byIndustry.size) {
  console.log('Industries already on the list:');
  for (const [i, n] of [...byIndustry.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${i}${known.has(i.toLowerCase()) ? '   knowledge base ready' : '   no knowledge base — generate it'}`);
  }
  console.log('');
}

if (!go) {
  console.log(`Waiting: ${waiting.slice(0, 12).map((l) => l.company).join(', ')}${waiting.length > 12 ? ` and ${waiting.length - 12} more` : ''}`);
  console.log('\nPass --go to look up the next few.');
  await mongoose.disconnect();
  process.exit(0);
}

const r = await runEnrichmentSweep({ limit });
if (r.stopped) console.log(r.stopped);
console.log(`Looked up ${r.looked}.\n`);
for (const x of r.results) {
  if (!x.industry) { console.log(`  ${x.company.padEnd(36)} ${x.reason || 'not placed'}`); continue; }
  const verdict = x.covered
    ? 'knowledge base ready'
    : `no knowledge base — generate "${x.industry}" on the industry page`;
  console.log(`  ${x.company.padEnd(36)} ${x.industry.padEnd(30)} ${verdict}`);
}
if (r.remainingToday !== undefined) console.log(`\n${r.remainingToday} left in today's budget.`);

await mongoose.disconnect();
