/**
 * Unit checks for the Arth model advisor. Covers the two things that must
 * not drift: the compute arithmetic (which is presented to the user as a
 * hardware bill) and the validation barrier around what the LLM returns.
 *
 * No network — recommendModel's LLM path is exercised separately by
 * probe_arth_recommend.mjs against a real provider.
 */
import { MODEL_CATALOG, ADVISORY_CATALOG } from '../config/modelCatalog.js';
import { selectModel } from '../services/modelSelectionService.js';
import {
  listCandidates, findModel, computeProfile, parseRecommendation, deterministicPick, whyContradictsPick,
} from '../services/modelAdvisorService.js';

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  ok ? pass++ : fail++;
}

// ── The routing catalog must stay exactly as it was ─────────────────────────
// selectModel's providerId is handed to generate() by defectMatchingService,
// so a change here silently reroutes real calls.
check('routing catalog still has 3 rows', MODEL_CATALOG.length, 3);
check('frontier still routes to claude', selectModel({ preference: 'frontier' }).providerId, 'claude');
check('open-weight still routes to selfhosted', selectModel({ preference: 'open-weight' }).providerId, 'selfhosted');
check('auto still defers to the chain', selectModel({ preference: 'auto' }).providerId, null);

// ── Catalog shape ───────────────────────────────────────────────────────────
check('every advisory model has a unique id',
  new Set(ADVISORY_CATALOG.map(m => m.id)).size, ADVISORY_CATALOG.length);
check('every open-weight model has a parameter count',
  listCandidates('open-weight').every(m => typeof m.paramsB === 'number' && m.paramsB > 0), true);
check('no frontier model claims a parameter count',
  listCandidates('frontier').every(m => m.paramsB === undefined), true);
check('unknown id resolves to null', findModel('gpt-9-ultra'), null);

// ── Compute arithmetic ──────────────────────────────────────────────────────
// 70B at int4 = 70 x 0.5 = 35GB of weights, x1.25 overhead = 43.75 -> 44.
check('70B int4 needs 44GB', computeProfile(findModel('llama-3-3-70b')).vramGb, 44);
check('...and fits one 48GB card', computeProfile(findModel('llama-3-3-70b')).gpuCount, 1);
// 70 x 2 = 140GB of weights, x1.25 = 175 -> past the largest single card.
check('70B at fp16 needs 175GB', computeProfile(findModel('llama-3-3-70b'), 'fp16').vramGb, 175);
check('...and scales out to 3 cards', computeProfile(findModel('llama-3-3-70b'), 'fp16').gpuCount, 3);
check('8B fits a workstation card', computeProfile(findModel('llama-3-1-8b')).gpuCount, 1);
check('frontier models have no compute profile', computeProfile(findModel('claude-opus')), null);
check('an unknown quantisation falls back to int4',
  computeProfile(findModel('llama-3-1-8b'), 'int2').vramGb,
  computeProfile(findModel('llama-3-1-8b'), 'int4').vramGb);
check('MoE memory tracks total, not active, parameters',
  computeProfile(findModel('mixtral-8x7b')).vramGb, 30);

// ── Parsing the model's answer ──────────────────────────────────────────────
check('a well-formed recommendation parses',
  parseRecommendation('MODEL: llama-3-3-70b\nWHY: It stays on your hardware.'),
  { modelId: 'llama-3-3-70b', why: 'It stays on your hardware.' });
check('parsing is case-insensitive on the id',
  parseRecommendation('MODEL: Claude-Opus\nWHY: Quality matters here.').modelId, 'claude-opus');
check('prose with no MODEL line yields no id',
  parseRecommendation('I think you should use something cheap.').modelId, null);
check('empty input yields no id', parseRecommendation('').modelId, null);

// ── The validation barrier ──────────────────────────────────────────────────
// recommendModel resolves the parsed id against the candidate set; anything
// not in it is dropped in favour of the deterministic pick.
const invented = parseRecommendation('MODEL: gpt-9-ultra\nWHY: trust me').modelId;
check('an invented id does not resolve to a model', findModel(invented), null);

check('privacy never resolves to a cloud model',
  listCandidates('open-weight').some(m => m.id === deterministicPick('privacy').id), true);
check('cost falls to the cheapest cloud option', deterministicPick('cost').id, 'gemini-flash');
check('quality falls to a frontier model', deterministicPick('quality').type, 'frontier');

// ── Reasoning that argues for a different model ─────────────────────────────
// A small model will name one id on the MODEL line and then argue for a
// different one; showing that next to the resolved pick would mislead.
check('reasoning naming another model is caught',
  whyContradictsPick('The Qwen 2.5 32B Instruct model is the better fit.', findModel('claude-sonnet')), true);
check('reasoning about the picked model is kept',
  whyContradictsPick('Claude Sonnet gives you the quality you need.', findModel('claude-sonnet')), false);
check('reasoning naming no model is kept',
  whyContradictsPick('It is the cheapest option that still meets your bar.', findModel('gemini-flash')), false);
check('empty reasoning is not a contradiction',
  whyContradictsPick('', findModel('claude-opus')), false);
check('comparing against another model is allowed',
  whyContradictsPick('Claude Sonnet costs less than Claude Opus for the same job.', findModel('claude-sonnet')), false);
check('naming only the compute of a rejected model is still a contradiction',
  whyContradictsPick('Qwen 2.5 32B Instruct fits on one card.', findModel('llama-3-3-70b')), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
