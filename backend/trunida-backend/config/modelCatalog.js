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
