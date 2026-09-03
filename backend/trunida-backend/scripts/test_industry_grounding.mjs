/**
 * Does grounding pick the right industry — and correctly refuse when none fit?
 *
 * Grounding an objective in the wrong industry is worse than not grounding it,
 * so "returns null" is a passing result here, not a failure.
 *
 *   node scripts/test_industry_grounding.mjs
 */

import 'dotenv/config';
import { listGroundedIndustries } from '../services/strategyCanvasService.js';
import { resolveIndustryGrounding } from '../services/industryFitService.js';

const available = listGroundedIndustries();
console.log('industries with KB coverage on disk:');
available.forEach(i => console.log('  ' + i));
console.log('');

// expected: an industry name, or null meaning "core-only is correct here"
const CASES = [
  ['Reduce OTA firmware flashing defect pre-analysis effort across ECU variants', 'Automotive'],
  ['Diagnose ADAS sensor calibration failures from vehicle test logs',            'Automotive'],
  ['Streamline attendance, fee collection and scheduling for classical music and dance academies', null],
  ['Help our teachers track student progress and automate parent communication',  null],
  ['Build an AI capability across our organisation, starting with the highest-value use cases', 'Artificial Intelligence'],
  ['Predict equipment failure in offshore oil rigs',                              null],
];

let pass = true;
for (const [objective, expected] of CASES) {
  const r = await resolveIndustryGrounding(objective);
  const got = r.industry;
  const ok = got === expected;
  if (!ok) pass = false;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(objective.slice(0, 58))}`);
  console.log(`      -> ${got === null ? 'core-only' : got}${expected !== got ? `   (expected ${expected === null ? 'core-only' : expected})` : ''}`);
  console.log(`      ${r.reason}`);
}

// A hallucinated industry must never reach the filesystem as a folder name.
console.log('\nhallucination guard:');
const guardOk = (await resolveIndustryGrounding('objective about a totally invented industry: quantum basket weaving')).industry;
console.log(`  ${guardOk === null || available.includes(guardOk) ? 'PASS' : 'FAIL'}  resolved to ${guardOk === null ? 'core-only' : guardOk}`);
if (!(guardOk === null || available.includes(guardOk))) pass = false;

console.log(pass ? '\nPASS' : '\nFAILED');
process.exit(pass ? 0 : 1);
