/**
 * Svarg — Model Advisor (Arth's screen)
 *
 * Three things Arth's screen needs, kept out of modelSelectionService.js on
 * purpose: that service is the ROUTING path (its providerId is handed to
 * generate() by defectMatchingService), whereas everything here is ADVICE
 * about what the customer's own system should run on.
 *
 *  1. listCandidates(type) — the menu, so picking "Frontier" or "Open Weight"
 *     leads to a real choice of model rather than a single opaque pick.
 *  2. computeProfile(model) — what an open-weight model actually costs to
 *     stand up. DERIVED from the parameter count, not quoted from memory, so
 *     the arithmetic can be checked and stays right as the catalog changes.
 *  3. recommendModel(...) — "Auto" is not a failover chain. It is Arth
 *     reading this use case and choosing the model that fits it, weighing
 *     cost, quality and performance, and saying why.
 *
 * As with screen chat actions, the model's answer is never trusted directly:
 * a recommendation only counts if it names a model that exists in the
 * catalog. Anything else falls back to a deterministic pick.
 */

import { ADVISORY_CATALOG } from '../config/modelCatalog.js';
import { generate } from './llmService.js';

export function listCandidates(type) {
  return ADVISORY_CATALOG.filter(m => m.type === type);
}

export function findModel(id) {
  return ADVISORY_CATALOG.find(m => m.id === id) || null;
}

// Bytes of weights per parameter at each quantisation. 4-bit is the usual
// serving choice, 8-bit where quality loss must be minimal, fp16 for
// fine-tuning headroom.
const BYTES_PER_PARAM = { 'int4': 0.5, 'int8': 1, 'fp16': 2 };

// Weights are not the whole story — the KV cache, activations and the
// serving runtime need headroom on top, and a card that is 100% full cannot
// actually serve. 1.25 is the usual planning margin.
const OVERHEAD = 1.25;

// Real accelerator tiers, smallest first. A deployment needs enough cards to
// cover the requirement; below 24GB is workstation territory.
const GPU_TIERS = [
  { vram: 24,  name: 'NVIDIA L4 / RTX 4090 (24GB)' },
  { vram: 48,  name: 'NVIDIA L40S / RTX A6000 (48GB)' },
  { vram: 80,  name: 'NVIDIA A100 or H100 (80GB)' },
  { vram: 141, name: 'NVIDIA H200 (141GB)' },
];

function gpuPlan(vramGb) {
  for (const tier of GPU_TIERS) {
    if (vramGb <= tier.vram) return { count: 1, gpu: tier.name };
  }
  // Past the largest single card, scale out on the 80GB tier — the one most
  // commonly available in multiples.
  const tier = GPU_TIERS.find(t => t.vram === 80);
  return { count: Math.ceil(vramGb / tier.vram), gpu: tier.name };
}

/**
 * What it takes to run this model, derived from its parameter count.
 * Returns null for anything without one — i.e. every frontier model, which
 * has no compute requirement because it is somebody else's problem.
 */
export function computeProfile(model, quantization = 'int4') {
  if (!model?.paramsB) return null;

  const bytes = BYTES_PER_PARAM[quantization] ?? BYTES_PER_PARAM.int4;
  const weightsGb = model.paramsB * bytes;
  const vramGb = Math.ceil(weightsGb * OVERHEAD);
  const plan = gpuPlan(vramGb);

  // MoE throughput tracks the ACTIVE parameters even though memory must hold
  // all of them — the distinction that makes Mixtral cheap to serve.
  const throughputB = model.activeParamsB || model.paramsB;

  return {
    quantization,
    paramsB: model.paramsB,
    weightsGb: Math.round(weightsGb * 10) / 10,
    vramGb,
    gpuCount: plan.count,
    gpu: plan.gpu,
    // Stated as the assumption it is, so nobody reads it as a benchmark.
    note: `${vramGb}GB VRAM at ${quantization} — ${model.paramsB}B parameters x ${bytes} bytes, plus 25% for KV cache and serving overhead.`
      + (model.activeParamsB ? ` Throughput is closer to a ${throughputB}B model: only ${throughputB}B parameters are active per token.` : ''),
  };
}

export function withCompute(model, quantization) {
  return { ...model, compute: computeProfile(model, quantization) };
}

// ── Auto: Arth chooses ──────────────────────────────────────────────────────

const PRIORITY_LABELS = {
  quality:     'result quality above all',
  cost:        'the lowest running cost',
  performance: 'latency and throughput',
  privacy:     'keeping data inside their own environment',
};

function describeForPrompt(m) {
  const parts = [
    `id=${m.id}`,
    `"${m.displayName}" by ${m.vendor}`,
    m.type,
    `quality=${m.quality}`,
    `cost=${m.cost}`,
    `performance=${m.performance}`,
  ];
  const c = computeProfile(m);
  // Saying "no hardware" explicitly matters: left to infer it, a model will
  // credit a cloud API with "extremely low VRAM requirements".
  parts.push(c
    ? `needs ${c.vramGb}GB VRAM (${c.gpuCount}x ${c.gpu}) on the customer's own hardware`
    : `no hardware to run — a cloud API, billed per call, data leaves the environment`);
  parts.push(m.strengths);
  return `  - ${parts.join(' | ')}`;
}

// The MODEL line and the WHY line can disagree — a small model will name one
// id and then argue for a different one. Showing that reasoning next to the
// resolved pick would be actively misleading.
//
// Naming another model is not by itself wrong: "cheaper than Claude Opus" is
// exactly the comparison worth making. It is only a contradiction when the
// reasoning names some OTHER model and never names the one actually picked.
export function whyContradictsPick(why, picked, catalog = ADVISORY_CATALOG) {
  const text = String(why || '').toLowerCase();
  if (!text) return false;
  if (text.includes(picked.displayName.toLowerCase())) return false;
  return catalog.some(m =>
    m.id !== picked.id && text.includes(m.displayName.toLowerCase()));
}

/**
 * A deterministic pick, used when the model is unavailable or answers with
 * something not in the catalog. Not a fallback in the sense of "worse" —
 * it is the defensible default for the stated priority.
 */
export function deterministicPick(priority) {
  if (priority === 'privacy')    return findModel('llama-3-3-70b');
  if (priority === 'cost')       return findModel('gemini-flash');
  if (priority === 'performance')return findModel('gemini-flash');
  return findModel('claude-sonnet');
}

const SYSTEM_PROMPT = `You are Arth, the engineer who decides what an AI use case should run on.

You are choosing ONE model from a fixed catalog for a specific use case. Weigh
quality, cost and performance against what this use case actually demands —
a high-volume triage job and a low-volume analysis job deserve different
answers, and the most capable model is not automatically the right one.

Hard rules:
- Choose only from the catalog given. Never name a model that is not in it.
- If the requirement is that data cannot leave the customer's environment,
  only an open-weight model is admissible.
- Open-weight models carry a compute bill. If you choose one, the reasoning
  must acknowledge what it takes to run.

Answer with exactly two lines and nothing else:
MODEL: <id from the catalog>
WHY: <two or three sentences, addressed to the user, in plain delivery language>`;

// Exported for tests — this is the barrier between model output and what the
// screen presents as a recommendation.
export function parseRecommendation(text) {
  const raw = String(text || '');
  const model = raw.match(/^\s*MODEL:\s*([a-z0-9._-]+)\s*$/im)?.[1]?.toLowerCase() || null;
  const why = raw.match(/^\s*WHY:\s*([\s\S]+)$/im)?.[1]?.trim() || '';
  return { modelId: model, why: why.split(/\nMODEL:/i)[0].trim() };
}

export async function recommendModel({ useCase, businessObjective, priority = 'quality', constraints = '' }) {
  // A privacy constraint is a hard filter, not a preference — never offer a
  // cloud model to someone whose data cannot leave the building.
  const candidates = priority === 'privacy' ? listCandidates('open-weight') : ADVISORY_CATALOG;

  const userMessage = [
    `Use case: ${useCase || 'not stated'}`,
    businessObjective ? `Business objective: ${businessObjective}` : '',
    `What matters most here: ${PRIORITY_LABELS[priority] || PRIORITY_LABELS.quality}`,
    constraints ? `Stated constraints: ${constraints}` : '',
    ``,
    `CATALOG`,
    candidates.map(describeForPrompt).join('\n'),
  ].filter(Boolean).join('\n');

  let picked = null;
  let why = '';

  try {
    const { text } = await generate({ systemPrompt: SYSTEM_PROMPT, userMessage, maxTokens: 400 });
    const parsed = parseRecommendation(text);
    // Validated against the candidate set, so a hallucinated id — or a cloud
    // model proposed under a privacy constraint — cannot reach the screen.
    picked = candidates.find(m => m.id === parsed.modelId) || null;
    why = parsed.why;
  } catch (err) {
    console.warn('[modelAdvisor] recommendation failed, using the deterministic pick —', err.message);
  }

  if (!picked) {
    picked = deterministicPick(priority);
    why = '';
  } else if (whyContradictsPick(why, picked)) {
    // Keep the pick, drop the argument for a different one.
    console.warn(`[modelAdvisor] reasoning named a model other than ${picked.id}; dropping it`);
    why = '';
  }

  if (!why) {
    const c = computeProfile(picked);
    why = `Chosen on the stated priority of ${PRIORITY_LABELS[priority] || PRIORITY_LABELS.quality}: `
      + `${picked.displayName} is ${picked.quality} quality at ${picked.cost} cost with ${picked.performance} performance. `
      + (c ? `It runs on your own hardware — ${c.vramGb}GB of VRAM — so nothing leaves your environment.`
           : `It is a cloud API, so there is no hardware to stand up, but the data does leave your environment.`);
  }

  return { ...withCompute(picked), why, priority };
}
