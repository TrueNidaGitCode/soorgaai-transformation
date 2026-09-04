/**
 * The classifier decides which data gets asked for and what finally gets
 * built, so getting the category backwards is the expensive failure.
 *
 * The case that matters most is the one a naive classifier gets wrong: an
 * objective that READS like workflow automation because it describes painful
 * manual work, where the people doing that work are the company's CUSTOMERS
 * and the company sells them software. That is product-ai.
 *
 *   node scripts/test_engagement_classifier.mjs
 */
import 'dotenv/config';
import { resolveEngagement, CATEGORIES, WORKFLOW_AREAS } from '../services/engagementClassifierService.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

// Verbatim from the blueprint that exposed the problem.
const PADHIVU_OBJECTIVE =
  'We build academy management software for classical music, dance and art schools. '
  + 'Studio owners and teachers spend hours every week on attendance, fee collection, '
  + 'scheduling and parent communication, which takes time away from teaching. '
  + 'We want to use AI to reduce that administrative burden.';

const PADHIVU_CONTEXT =
  'Padhivu is a software company. It builds and sells academy management software to '
  + 'classical music, dance and art schools. Its customers are studio owners and teachers. '
  + 'Founded 2026, a small team, no separate requirements or architecture documentation.';

const KPIT_OBJECTIVE =
  'I am the Project Manager for a vehicle software maintenance project. Our teams spend '
  + 'considerable effort analysing defects, incidents and support tickets from multiple '
  + 'sources — issue understanding, validation, triage, root-cause assessment and '
  + 'assignment to the right teams. We want AI to reduce that analysis effort.';

const KPIT_CONTEXT =
  'An automotive engineering services supplier with several thousand engineers, delivering '
  + 'software maintenance and development programmes for vehicle manufacturers. Requirements '
  + 'are managed in dedicated tooling and architecture is documented separately from the code.';

console.log('1. the trap: customers\' workflow, sold as software → product-ai');
{
  const r = await resolveEngagement(PADHIVU_OBJECTIVE, PADHIVU_CONTEXT);
  check('category is product-ai', r.category === 'product-ai', `got ${r.category} — ${r.reason}`);
  check('subArea is null for product-ai', r.subArea === null, `got ${r.subArea}`);
  check('maturity reads as startup', r.maturity === 'startup', `got ${r.maturity}`);
}

console.log('\n2. the company\'s own staff → workflow-automation');
{
  const r = await resolveEngagement(KPIT_OBJECTIVE, KPIT_CONTEXT);
  check('category is workflow-automation', r.category === 'workflow-automation', `got ${r.category} — ${r.reason}`);
  check('subArea is a known area', r.subArea === null || WORKFLOW_AREAS.includes(r.subArea), `got ${r.subArea}`);
  check('maturity reads as enterprise', r.maturity === 'enterprise', `got ${r.maturity}`);
}

console.log('\n3. fails open rather than guessing');
{
  // No company context and an objective that could be either — exactly the
  // guest case. Undecided is the correct answer; a confident guess here is
  // what misdirects a whole run.
  const r = await resolveEngagement('We want to use AI to reduce manual effort in our daily work.');
  check('category is null', r.category === null, `got ${r.category} — ${r.reason}`);
  check('maturity is unknown', r.maturity === 'unknown', `got ${r.maturity}`);
  check('confidence is 0', r.confidence === 0, `got ${r.confidence}`);
}

console.log('\n4. never returns a value outside its own vocabulary');
{
  const r = await resolveEngagement(PADHIVU_OBJECTIVE, PADHIVU_CONTEXT);
  check('category is null or a known category',
    r.category === null || CATEGORIES.includes(r.category), `got ${r.category}`);
  check('subArea is null or a known area',
    r.subArea === null || WORKFLOW_AREAS.includes(r.subArea), `got ${r.subArea}`);
  check('maturity is a known value',
    ['enterprise', 'startup', 'unknown'].includes(r.maturity), `got ${r.maturity}`);
  check('confidence is within 0–1', r.confidence >= 0 && r.confidence <= 1, `got ${r.confidence}`);
}

console.log('\n5. an empty objective costs nothing');
{
  const r = await resolveEngagement('');
  check('undecided without calling the model', r.category === null, `got ${r.category}`);
}

console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
