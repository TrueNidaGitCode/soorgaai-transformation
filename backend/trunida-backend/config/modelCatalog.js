/**
 * SoorgaAI — Model Catalog
 *
 * Fixed, code-owned list of candidate models Arth can route a task to —
 * same pattern as domainRegistry.js's DOMAINS. Each providerId must match
 * a real key in llmService.js's PROVIDERS object; this file only carries
 * selection metadata (type/quality/cost/performance), never invocation
 * logic — that stays in llmService.js.
 *
 * Perplexity-style multi-model routing: pick the right model per task
 * instead of one fixed default, with the reasoning made visible (see
 * services/modelSelectionService.js) rather than left inside a failover
 * mechanism.
 */

export const MODEL_CATALOG = [
  {
    providerId:  'claude',
    displayName: 'Claude (frontier, cloud API)',
    type:        'frontier',
    quality:     'best',
    cost:        'high',
    performance: 'high',
  },
  {
    providerId:  'gemini',
    displayName: 'Gemini (frontier, cloud API)',
    type:        'frontier',
    quality:     'good',
    cost:        'medium',
    performance: 'high',
  },
  {
    providerId:  'selfhosted',
    displayName: 'Self-hosted open-weight model',
    type:        'open-weight',
    quality:     'good',
    cost:        'low',
    performance: 'medium',
  },
];

/**
 * ── Advisory catalog (Arth's screen) ───────────────────────────────────────
 *
 * Deliberately separate from MODEL_CATALOG above. That one is the ROUTING
 * catalog: selectModel() reads it and defectMatchingService passes the
 * resulting providerId to generate(), so adding a row there changes which
 * model real calls go to. This one is ADVISORY — it is the menu Arth shows
 * when planning what the customer's own system should run on, so it can name
 * models Svarg itself has no provider wired for.
 *
 * `providerId` is set only where llmService.js actually has that provider, so
 * a recommendation can be told apart from something Svarg can run today.
 *
 * `paramsB` is the parameter count in billions, and is what the compute
 * requirement is DERIVED from (see modelAdvisorService.computeProfile) rather
 * than a VRAM figure quoted from memory. `activeParamsB` differs only for
 * mixture-of-experts models, where throughput tracks the active parameters
 * but memory still has to hold all of them.
 */
export const ADVISORY_CATALOG = [
  // ── Frontier (cloud APIs; the data leaves the customer's environment) ────
  {
    id: 'claude-opus',
    apiModel: process.env.GATEWAY_MODEL_CLAUDE_OPUS   || 'claude-opus-5',
    priceIn: 15, priceOut: 75,
    providerId: 'claude',
    displayName: 'Claude Opus',
    vendor: 'Anthropic',
    type: 'frontier',
    quality: 'best', cost: 'high', performance: 'high',
    strengths: 'Long-context reasoning over messy engineering documents; the most reliable at following a strict output contract.',
    bestFor: 'Analysis where a wrong answer is expensive and volumes are moderate.',
  },
  {
    id: 'claude-sonnet',
    apiModel: process.env.GATEWAY_MODEL_CLAUDE_SONNET || 'claude-sonnet-5',
    priceIn: 3,  priceOut: 15,
    providerId: 'claude',
    displayName: 'Claude Sonnet',
    vendor: 'Anthropic',
    type: 'frontier',
    quality: 'best', cost: 'medium', performance: 'high',
    strengths: 'Close to Opus on structured extraction and classification at a materially lower price.',
    bestFor: 'The default when a workload is steady rather than occasional.',
  },
  {
    id: 'gpt-5',
    apiModel: process.env.GATEWAY_MODEL_GPT           || 'gpt-5',
    priceIn: 1.25, priceOut: 10,
    providerId: 'openai',
    displayName: 'GPT-5',
    vendor: 'OpenAI',
    type: 'frontier',
    quality: 'best', cost: 'high', performance: 'high',
    strengths: 'Strong general reasoning and the widest tooling ecosystem.',
    bestFor: 'Teams already standardised on Azure OpenAI or the OpenAI platform.',
  },
  {
    id: 'gemini-pro',
    // gemini-2.5-pro is closed to new API keys (404 "no longer available to
    // new users"), so a customer picking this would have got a deployed app
    // that failed on every call. Verified working 2026-09-03.
    apiModel: process.env.GATEWAY_MODEL_GEMINI_PRO    || 'gemini-3.1-pro-preview',
    // Prices carried over from 2.5-pro and NOT yet reconciled against the
    // 3.x rate card. They drive the spend cap, and 3.x bills thinking tokens
    // as output, so real spend can outrun this estimate.
    priceIn: 1.25, priceOut: 10,
    providerId: 'gemini',
    displayName: 'Gemini Pro',
    vendor: 'Google',
    type: 'frontier',
    quality: 'good', cost: 'medium', performance: 'high',
    strengths: 'Very large context window and competitive pricing at volume.',
    bestFor: 'Feeding whole document sets in without a retrieval step.',
  },
  {
    id: 'gemini-flash',
    // Same retirement as Pro above — 2.5-flash is closed to new keys.
    apiModel: process.env.GATEWAY_MODEL_GEMINI_FLASH  || 'gemini-3.8-flash',
    // Carried over from 2.5-flash; see the note on Pro about thinking tokens.
    priceIn: 0.30, priceOut: 2.50,
    providerId: 'gemini',
    displayName: 'Gemini Flash',
    vendor: 'Google',
    type: 'frontier',
    quality: 'fair', cost: 'low', performance: 'high',
    strengths: 'Fastest and cheapest of the cloud options.',
    bestFor: 'High-volume classification and triage where near-best quality is enough.',
  },

  // ── Open weight (runs on the customer's hardware; data never leaves) ─────
  {
    id: 'llama-3-3-70b',
    providerId: 'selfhosted',
    displayName: 'Llama 3.3 70B Instruct',
    vendor: 'Meta',
    type: 'open-weight',
    paramsB: 70,
    quality: 'good', cost: 'low', performance: 'medium',
    license: 'Llama 3.3 Community License',
    strengths: 'The strongest general open-weight model at a size a single server can still hold.',
    bestFor: 'On-premise deployments that need frontier-adjacent quality.',
  },
  {
    id: 'qwen-2-5-72b',
    providerId: 'selfhosted',
    displayName: 'Qwen 2.5 72B Instruct',
    vendor: 'Alibaba',
    type: 'open-weight',
    paramsB: 72,
    quality: 'good', cost: 'low', performance: 'medium',
    license: 'Qwen License',
    strengths: 'Particularly strong on structured output and code-adjacent text.',
    bestFor: 'Extracting fielded data out of engineering records.',
  },
  {
    id: 'mixtral-8x7b',
    providerId: 'selfhosted',
    displayName: 'Mixtral 8x7B Instruct',
    vendor: 'Mistral AI',
    type: 'open-weight',
    paramsB: 46.7, activeParamsB: 12.9,
    quality: 'fair', cost: 'low', performance: 'high',
    license: 'Apache 2.0',
    strengths: 'Mixture-of-experts: throughput of a ~13B model, so it serves many concurrent users cheaply.',
    bestFor: 'Interactive workloads where latency matters more than peak quality.',
  },
  {
    id: 'qwen-2-5-32b',
    providerId: 'selfhosted',
    displayName: 'Qwen 2.5 32B Instruct',
    vendor: 'Alibaba',
    type: 'open-weight',
    paramsB: 32,
    quality: 'fair', cost: 'low', performance: 'high',
    license: 'Apache 2.0',
    strengths: 'Fits on one 48GB card quantised, which is the cheapest serious on-premise tier.',
    bestFor: 'A first on-premise deployment without buying datacentre GPUs.',
  },
  {
    id: 'llama-3-1-8b',
    providerId: 'selfhosted',
    displayName: 'Llama 3.1 8B Instruct',
    vendor: 'Meta',
    type: 'open-weight',
    paramsB: 8,
    quality: 'fair', cost: 'low', performance: 'high',
    license: 'Llama 3.1 Community License',
    strengths: 'Runs on a single workstation GPU; fast and cheap to operate.',
    bestFor: 'Classification, routing and redaction rather than analysis.',
  },
];
