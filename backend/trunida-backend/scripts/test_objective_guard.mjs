/**
 * The guard must refuse what wasted four runs, and must never refuse a real
 * customer. The second matters more: a blocked customer costs more than a
 * wasted run, so a false rejection here is the serious failure.
 *
 *   node scripts/test_objective_guard.mjs
 */
import 'dotenv/config';
import { checkObjective } from '../services/objectiveGuardService.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

// Verbatim from the 2026-08-17 incident, plus the usual junk.
const SHOULD_REFUSE = [
  'what can you do?',
  'What can you do',
  'hi',
  'test',
  'help',
  'how does this work?',
  'who are you?',
  'asdfasdf',
  '???',
];

// Real objectives, including the two genuine ones from that same day and
// the deliberately imperfect phrasing customers actually use.
const SHOULD_ALLOW = [
  'How to build a coding model for automotive industry',
  'Help with a code modernization usecases',
  'We build academy management software for classical music, dance and art schools. Studio owners spend hours every week on attendance, fee collection and parent communication, which takes time away from teaching. We want to use AI to reduce that administrative burden.',
  'Reduce OTA firmware flashing defect pre-analysis effort across ECU variants',
  'we want to cut support ticket handling time in our SaaS product',
  'Our warehouse team spends too long doing manual stock counts and we think AI could help',
];

console.log('1. refuses non-objectives');
for (const o of SHOULD_REFUSE) {
  const r = await checkObjective(o);
  check(JSON.stringify(o.slice(0, 40)), !r.ok, r.ok ? 'ALLOWED' : r.reason.slice(0, 58));
}

console.log('\n2. allows real objectives (a false refusal here is the costly failure)');
for (const o of SHOULD_ALLOW) {
  const r = await checkObjective(o);
  check(JSON.stringify(o.slice(0, 52)), r.ok, r.ok ? '' : 'REFUSED: ' + r.reason);
}

// The short-input heuristic catches almost everything above for free, which
// means it also HIDES whether the classifier works. These are long enough to
// pass every heuristic, so only the classifier can refuse them — without
// this section, stage two would be entirely unverified.
console.log('\n3. the classifier stage, not the length heuristic');
const LONG_NON_OBJECTIVES = [
  'Can you please explain in detail what this platform is capable of doing, what features it offers, and how I might use it to learn more about artificial intelligence in general terms',
  'I would like to understand more about the pricing, the different subscription tiers available, and whether there is a free trial that I could sign up for before committing',
  'Please write me a poem about the changing of the seasons, with several verses and a gentle rhyme scheme throughout the whole thing',
];
for (const o of LONG_NON_OBJECTIVES) {
  const r = await checkObjective(o);
  check(`${o.length} chars: ${JSON.stringify(o.slice(0, 40))}`, !r.ok, r.ok ? 'ALLOWED — classifier did not catch it' : r.reason.slice(0, 56));
}

console.log('\n4. refusals explain what to do instead');
{
  const r = await checkObjective('what can you do?');
  check('has a suggestion', (r.suggestion || '').length > 20, r.suggestion);
}

console.log(pass ? '\nPASS' : '\nFAILED');
process.exit(pass ? 0 : 1);
