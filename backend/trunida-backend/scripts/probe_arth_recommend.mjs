/**
 * Exercises the Auto flow against the configured provider: does Arth pick a
 * model that actually exists, does the privacy priority hold as a hard
 * filter, and does the reasoning address the use case rather than recite the
 * catalog.
 */
import 'dotenv/config';
import { recommendModel, listCandidates } from '../services/modelAdvisorService.js';

const USE_CASE = 'Retrieval-Augmented Semantic Matching for Defects';
const OBJECTIVE = 'Reduce OTA flashing defect pre-analysis effort across a large vehicle programme';
const openWeightIds = new Set(listCandidates('open-weight').map(m => m.id));

const cases = [
  { priority: 'privacy',     constraints: 'data cannot leave our network' },
  { priority: 'cost',        constraints: 'tens of thousands of defects a month' },
  { priority: 'quality',     constraints: '' },
  { priority: 'performance', constraints: 'engineers wait on this interactively' },
];

let bad = 0;
for (const c of cases) {
  const t = Date.now();
  const r = await recommendModel({ useCase: USE_CASE, businessObjective: OBJECTIVE, ...c });
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  console.log(`\n[${c.priority}] ${c.constraints || '(no constraint)'}  (${secs}s)`);
  console.log(`  -> ${r.displayName} (${r.id}) ${r.compute ? `| ${r.compute.vramGb}GB, ${r.compute.gpuCount}x ${r.compute.gpu}` : '| cloud'}`);
  console.log(`  why: ${(r.why || '').slice(0, 220)}`);

  if (!r.id) { console.log('  !! no model resolved'); bad++; }
  if (c.priority === 'privacy' && !openWeightIds.has(r.id)) {
    console.log('  !! FAILED HARD FILTER: a cloud model was returned under a privacy constraint');
    bad++;
  }
  if (r.type === 'open-weight' && !r.compute) { console.log('  !! open-weight pick with no compute profile'); bad++; }
}
console.log(bad ? `\n${bad} problem(s)` : '\nall recommendations valid');
process.exit(bad ? 1 : 0);
