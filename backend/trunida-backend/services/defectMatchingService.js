/**
 * SoorgaAI — Defect Matching Service
 *
 * "Retrieval-Augmented Semantic Matching for Defects" — the top-ranked AI
 * opportunity from the real KPIT/CARIAD ORU Pre-analysis blueprint
 * (recommendedInitiativeName, AI Implementation Prioritization capability).
 * Given a new failure description, retrieves the most similar historical
 * DefectRecords and asks the LLM to suggest a likely root cause citing them.
 *
 * Walking-skeleton scope: reuses hybridRetrieve/upsertChunks/generate as-is
 * (see PRODUCT_PIPELINE_SCHEMA.md and the walking-skeleton plan) — the only
 * new logic is this retrieve → hydrate → synthesize sequence.
 */

import DefectRecord from '../models/DefectRecord.js';
import { hybridRetrieve } from './hybridRetrievalService.js';
import { generate } from './llmService.js';
import { selectModel } from './modelSelectionService.js';

const SYSTEM_PROMPT = `You are assisting an automotive engineer with pre-analysis of a failed test. You are given a new failure description and a set of historical defect records, each with a confirmed root cause and resolution. Suggest the most likely root cause for the new failure, citing which historical record(s) support your suggestion by their defect ID. If none of the historical records are a good match, say so plainly rather than guessing. Keep the answer to 2-4 sentences.`;

function formatRecordForPrompt(record) {
  return `[${record.defectId}] ${record.title}\nSymptom: ${record.symptom}\nRoot cause: ${record.rootCause}\nResolution: ${record.resolution}`;
}

/**
 * @param {object} opts
 * @param {string} opts.description
 * @param {string} [opts.orgName='KPIT']
 * @param {string} [opts.industry='Automotive']
 * @param {number} [opts.topK=5]
 * @param {'frontier'|'open-weight'|'auto'} [opts.modelPreference='auto']
 */
export async function matchDefect({ description, orgName = 'KPIT', industry = 'Automotive', topK = 5, modelPreference = 'auto' }) {
  const modelSelection = selectModel({ preference: modelPreference });

  const hits = await hybridRetrieve({ queryText: description, sourceType: 'defect', orgName, industry, topK });

  if (!hits.length) {
    return { matches: [], suggestedRootCause: 'No similar historical defects were found for this description.', modelSelection };
  }

  const records = await DefectRecord.find({ defectId: { $in: hits.map(h => h.path) } }).lean();
  const recordsById = new Map(records.map(r => [r.defectId, r]));

  const matches = hits
    .map(h => {
      const record = recordsById.get(h.path);
      return record ? { ...record, score: h.score } : null;
    })
    .filter(Boolean);

  if (!matches.length) {
    return { matches: [], suggestedRootCause: 'No similar historical defects were found for this description.', modelSelection };
  }

  const userMessage = `New failure description:\n${description}\n\nHistorical defect records:\n${matches.map(formatRecordForPrompt).join('\n\n')}`;

  const result = await generate({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    // null providerId ('auto') intentionally omits this so generate() falls
    // through to its own default failover chain — see modelSelectionService.js
    ...(modelSelection.providerId ? { provider: modelSelection.providerId } : {}),
  });

  return { matches, suggestedRootCause: result.text, modelSelection };
}
