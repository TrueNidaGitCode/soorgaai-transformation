/**
 * The recommendation rule.
 *
 * Asserted against a FIXED candidate set, so these test the rule rather than
 * today's models — a catalog update must never turn this red.
 *
 * The case that matters most is the one the whole feature exists for: when
 * cost is critical, the answer is the cheapest model that clears the quality
 * band, NOT the highest scorer. A published comparison put the same task at
 * $4.23 on the top-ranked model and cents on one four points below it, and a
 * recommender that cannot reproduce that reasoning is decoration.
 *
 *   node scripts/test_model_recommender.mjs
 */
import { recommendModels, deriveRecommendationInputs, SIZE_BANDS, FOCUS_INDICES } from '../services/modelRecommenderService.js';

let pass = true;
const check = (l, ok, d = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`); if (!ok) pass = false; };

// Shaped like the published comparison: a top model that costs a fortune, and
// a much cheaper one a few points below it.
const CATALOG = [
  { modelId: 'top-tier',   displayName: 'Top Tier',   type: 'frontier', providers: ['Anthropic'],
    priceIn: 15, priceOut: 75, medianTokensPerSecond: 60, contextTokens: 500_000,
    reasoning: true, imageInput: true, paramsB: null,
    scores: { strategyOps: 59, engineering: 55 } },

  { modelId: 'mid-tier',   displayName: 'Mid Tier',   type: 'frontier', providers: ['Google'],
    priceIn: 0.3, priceOut: 2.5, medianTokensPerSecond: 250, contextTokens: 1_000_000,
    reasoning: true, imageInput: true, paramsB: null,
    // engineering deliberately ABOVE top-tier: without a genuinely different
    // order on some index, "changing the focus changes the ranking" tests the
    // fixture rather than the code.
    scores: { strategyOps: 50, engineering: 62 } },

  { modelId: 'bargain',    displayName: 'Bargain',    type: 'frontier', providers: ['OpenAI'],
    priceIn: 0.05, priceOut: 0.4, medianTokensPerSecond: 300, contextTokens: 400_000,
    reasoning: true, imageInput: false, paramsB: null,
    scores: { strategyOps: 49, engineering: 40 } },

  { modelId: 'open-70b',   displayName: 'Open 70B',   type: 'open-weight', providers: ['Together', 'Groq'],
    priceIn: 0.6, priceOut: 0.8, medianTokensPerSecond: 120, contextTokens: 128_000,
    reasoning: false, imageInput: false, paramsB: 70,
    scores: { strategyOps: 42, engineering: 38 } },

  { modelId: 'open-8b',    displayName: 'Open 8B',    type: 'open-weight', providers: ['Together'],
    priceIn: 0.05, priceOut: 0.08, medianTokensPerSecond: 900, contextTokens: 128_000,
    reasoning: false, imageInput: false, paramsB: 8,
    scores: { strategyOps: 30, engineering: 25 } },

  // Published without a Strategy & Ops score. Must be excluded from that
  // ranking rather than treated as zero.
  { modelId: 'unscored',   displayName: 'Unscored',   type: 'frontier', providers: ['Azure'],
    priceIn: 0.01, priceOut: 0.02, medianTokensPerSecond: 400, contextTokens: 200_000,
    reasoning: true, imageInput: true, paramsB: null,
    scores: { engineering: 55 } },
];

console.log('1. cost critical takes the cheapest model clearing the band');
{
  const r = recommendModels(CATALOG, {
    focus: 'strategyOps',
    priorities: { intelligence: 'very-important', speed: 'moderate', cost: 'critical' },
  });
  check('the band rule ran', r.rule === 'cheapest-clearing-band', r.rule);
  check('band floor is best minus 10', r.band?.floor === 49, `best ${r.band?.best}, floor ${r.band?.floor}`);

  // The whole point: 'top-tier' scores highest and must NOT win.
  check('the top scorer does not win on price', r.picks[0]?.modelId !== 'top-tier', r.picks[0]?.modelId);
  check('the cheapest model inside the band wins', r.picks[0]?.modelId === 'bargain',
    r.picks.map(p => `${p.modelId} $${p.cost?.toFixed(2)}`).join(', '));
  check('a model below the band is not offered', !r.picks.some(p => p.modelId === 'open-70b'),
    r.picks.map(p => p.modelId).join(', '));
}

console.log('\n2. intelligence critical takes the best score');
{
  const r = recommendModels(CATALOG, {
    focus: 'strategyOps',
    priorities: { intelligence: 'critical', speed: 'low', cost: 'low' },
  });
  check('the weighted rule ran', r.rule === 'weighted', r.rule);
  check('the top scorer wins', r.picks[0]?.modelId === 'top-tier', r.picks[0]?.modelId);
}

console.log('\n3. hard requirements exclude, with a reason');
{
  const r = recommendModels(CATALOG, {
    focus: 'strategyOps',
    requirements: { imageInput: true },
    priorities: { intelligence: 'very-important', speed: 'moderate', cost: 'moderate' },
  });
  check('no pick lacks image input', r.picks.every(p => p.modelId !== 'bargain' && p.modelId !== 'open-8b'),
    r.picks.map(p => p.modelId).join(', '));
  const why = r.excluded.find(e => e.modelId === 'bargain');
  check('the exclusion says why', /image/.test(why?.reason || ''), why?.reason);
}

console.log('\n4. the size band is judged on parameters, not on names');
{
  const r = recommendModels(CATALOG, {
    focus: 'strategyOps', sizePreference: 'small',
    priorities: { intelligence: 'very-important', speed: 'moderate', cost: 'moderate' },
  });
  check('only 4B-40B survives', r.picks.length === 1 && r.picks[0].modelId === 'open-8b',
    r.picks.map(p => `${p.modelId}@${p.paramsB}B`).join(', '));
  const frontier = r.excluded.find(e => e.modelId === 'top-tier');
  check('a model with no parameter count is excluded, not guessed at',
    /parameter count unknown/.test(frontier?.reason || ''), frontier?.reason);
  check('SIZE_BANDS.small is 4-40', SIZE_BANDS.small[0] === 4 && SIZE_BANDS.small[1] === 40);
}

console.log('\n5. an unscored model is excluded from that ranking, not scored zero');
{
  const r = recommendModels(CATALOG, { focus: 'strategyOps', priorities: { intelligence: 'critical' } });
  check('not offered on an index it has no score for', !r.picks.some(p => p.modelId === 'unscored'));
  const why = r.excluded.find(e => e.modelId === 'unscored');
  check('and says so', /no strategyOps score/.test(why?.reason || ''), why?.reason);

  // It has an Engineering score, so it must be CONSIDERED there — the
  // exclusion is per index, not a blanket one. It need not rank first, and
  // asserting that it does would test my fixture rather than the code.
  const c = recommendModels(CATALOG, { focus: 'engineering', priorities: { intelligence: 'critical', speed: 'low', cost: 'low' } });
  check('and is considered where it does have a score',
    c.picks.some(p => p.modelId === 'unscored'), c.picks.map(p => p.modelId).join(', '));
}

console.log('\n6. changing the focus changes the order');
{
  const a = recommendModels(CATALOG, { focus: 'strategyOps', priorities: { intelligence: 'critical', speed: 'low', cost: 'low' } });
  const b = recommendModels(CATALOG, { focus: 'engineering', priorities: { intelligence: 'critical', speed: 'low', cost: 'low' } });
  check('a different index gives a different ranking',
    JSON.stringify(a.picks.map(p => p.modelId)) !== JSON.stringify(b.picks.map(p => p.modelId)),
    `${a.picks.map(p => p.modelId).join('>')}  vs  ${b.picks.map(p => p.modelId).join('>')}`);
}

console.log('\n7. an impossible filter returns nothing, and does not fall back');
{
  const r = recommendModels(CATALOG, {
    focus: 'strategyOps',
    requirements: { videoInput: true },
    priorities: { intelligence: 'critical' },
  });
  check('no picks', r.picks.length === 0, r.picks.map(p => p.modelId).join(', '));
  check('rule reports none', r.rule === 'none', r.rule);
  check('every model has an exclusion reason', r.excluded.length >= CATALOG.length - 1, `${r.excluded.length} reasons`);
}

console.log('\n8. provider constraint is honoured');
{
  const r = recommendModels(CATALOG, {
    focus: 'strategyOps', providers: ['Together'],
    priorities: { intelligence: 'critical' },
  });
  check('only models that provider serves', r.picks.every(p => p.providers.includes('Together')),
    r.picks.map(p => p.modelId).join(', '));
}

console.log('\n9. a startup blueprint derives the band rule');
{
  const d = deriveRecommendationInputs({
    engagement: { category: 'product-ai', maturity: 'startup' },
    businessObjective: 'Reduce administrative burden inside our product',
    codebaseProfile: { checked: true },
  });
  check('cost is critical for an early-stage company', d.priorities.cost === 'critical', d.priorities.cost);
  // Requirements are NOT inferred any more. Turning "a repo was read" into a
  // 200k-context requirement excluded every model in a catalog with no context
  // figures — a guess of ours overruling data an admin had entered.
  check('no hard requirement is invented from the blueprint',
    Object.keys(d.requirements).length === 0, JSON.stringify(d.requirements));
  check('every derivation carries a reason', d.reasons.length >= 2, d.reasons.join(' | '));

  // Engineering, not 'coding'. Terminal-Bench has no entries in the catalog,
  // so routing software work there would exclude every model and return
  // nothing — a ranking on a benchmark nobody has been measured against.
  const coding = deriveRecommendationInputs({ businessObjective: 'Generate code for the developer SDK' });
  check('a software use case ranks on Engineering', coding.focus === 'engineering', coding.focus);
  // Only two indices are maintained, so compliance work ranks on Strategy &
  // Ops. Hallucination resistance would be the better axis for it, and it is
  // still a field on the model — it is just not a published table yet, and
  // ranking on an empty index returns nothing at all.
  const gov = deriveRecommendationInputs({ businessObjective: 'Automate regulatory compliance reporting' });
  check('a compliance use case ranks on Strategy & Ops', gov.focus === 'strategyOps', gov.focus);

  check('every focus the derivation can produce is one that has a table',
    ['Generate code for the developer SDK', 'Automate regulatory compliance reporting',
     'Draft the quarterly board proposal', 'Triage inbound support tickets']
      .every(o => FOCUS_INDICES.includes(deriveRecommendationInputs({ businessObjective: o }).focus)),
    FOCUS_INDICES.join(', '));
}

console.log();
console.log('10. cost is read from the category being ranked on');
{
  // The real case: one model, two benchmarks, two different bills. Cheap on
  // the index being ranked and expensive on the other one, so using the wrong
  // cost changes which model wins rather than merely mislabelling it.
  const twoTables = [
    { modelId: 'cheap-here', displayName: 'Cheap Here', type: 'frontier', providers: ['A'],
      scores: { strategyOps: 50, engineering: 60 },
      indexCosts: { strategyOps: 4.00, engineering: 0.50 } },
    { modelId: 'cheap-there', displayName: 'Cheap There', type: 'frontier', providers: ['A'],
      scores: { strategyOps: 50, engineering: 60 },
      indexCosts: { strategyOps: 0.50, engineering: 4.00 } },
  ];

  const eng = recommendModels(twoTables, {
    focus: 'engineering', acceptableRange: { min: 55, max: 65 },
  });
  check('the cheapest ON THAT BENCHMARK wins', eng.picks[0]?.modelId === 'cheap-here', eng.picks[0]?.modelId);
  check('and the cost reported is the one it was ranked on', eng.picks[0]?.cost === 0.50, String(eng.picks[0]?.cost));

  const ops = recommendModels(twoTables, {
    focus: 'strategyOps', acceptableRange: { min: 45, max: 55 },
  });
  check('the other table gives the other answer', ops.picks[0]?.modelId === 'cheap-there', ops.picks[0]?.modelId);
  check('at the other price', ops.picks[0]?.cost === 0.50, String(ops.picks[0]?.cost));

  // A model measured before costs were split by category still has to price.
  const legacy = recommendModels(
    [{ modelId: 'legacy', displayName: 'Legacy', type: 'frontier', providers: ['A'],
       scores: { engineering: 60 }, indexCost: 1.25 }],
    { focus: 'engineering', acceptableRange: { min: 55, max: 65 } });
  check('a model with only a flat cost falls back to it', legacy.picks[0]?.cost === 1.25, String(legacy.picks[0]?.cost));
}

console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(pass ? 0 : 1);
