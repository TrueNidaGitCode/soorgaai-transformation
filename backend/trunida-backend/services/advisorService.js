/**
 * SoorgaAI — AI Strategy Advisor Service
 *
 * Builds a prioritised context package from the current blueprint + knowledge
 * base documents and calls the LLM abstraction layer to generate an executive
 * AI strategy response.
 *
 * Retrieval priority (mirrors the Python HybridRetrieval architecture):
 *   P1 — Current Blueprint  (passed from frontend — always highest priority)
 *   P2 — Core capability document
 *   P3 — Industry capability document
 *   P4 — AI Strategy Intelligence Specification
 *   P5 — Related capability documents (structured "semantic" knowledge)
 */

import {
  readCapabilityContent,
  readSpecContent,
  readRelatedCapabilityContent,
} from './strategyCanvasService.js';
import { generate } from './llmService.js';

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(industry, capabilityName, sectionNames) {
  return `You are SoorgaAI, an executive AI strategy consultant. You provide grounded, \
actionable guidance to senior leaders based strictly on the structured knowledge documents \
provided to you.

ADVISORY CONTEXT:
- Industry: ${industry}
- Current Capability: ${capabilityName}
- Blueprint Sections: ${sectionNames.join(', ')}

INSTRUCTIONS:
1. Answer strictly from the knowledge documents provided — do not add information not present.
2. Be executive-level: specific, actionable, and directly relevant to the current capability.
3. Reference blueprint section names (${sectionNames.join(', ')}) where applicable.
4. Tailor all guidance to the ${industry} industry context.
5. Do not invent company-specific details. If something is unknown, state your assumption.
6. If the knowledge base is insufficient for part of the question, say so explicitly.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "executivePerspective": "<2–3 sentence executive insight for a senior leader>",
  "industryContext": "<${industry}-specific context and implications, 2–3 sentences>",
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "potentialRisks": ["<risk 1>", "<risk 2>"],
  "suggestedNextStep": "<one specific, immediately actionable next step>"
}`;
}

// ── Context formatters ────────────────────────────────────────────────────────

function formatBlueprint(blueprint) {
  if (!blueprint?.sections?.length) return 'No blueprint sections loaded.';

  return blueprint.sections.map(s => {
    const lines = [`### ${s.title}`];
    if (s.definition)            lines.push(`Definition: ${s.definition}`);
    if (s.keyPrinciples?.length) lines.push(`Key Principles:\n${s.keyPrinciples.map(p => `  - ${p}`).join('\n')}`);
    if (s.leadershipQuestion)    lines.push(`Leadership Question: ${s.leadershipQuestion}`);
    if (s.industryContext)       lines.push(`${blueprint.industry} Context: ${s.industryContext}`);
    return lines.join('\n');
  }).join('\n\n');
}

function buildUserMessage(blueprint, coreContent, industryContent, specContent, related, question) {
  const blocks = [];

  blocks.push(
    `=== P1: CURRENT BLUEPRINT — ${blueprint.capabilityName} ===\n${formatBlueprint(blueprint)}`
  );

  if (coreContent) {
    blocks.push(`=== P2: CORE CAPABILITY DOCUMENT ===\n${coreContent}`);
  }

  if (industryContent) {
    blocks.push(`=== P3: ${blueprint.industry} CAPABILITY DOCUMENT ===\n${industryContent}`);
  }

  if (specContent) {
    blocks.push(`=== P4: AI STRATEGY INTELLIGENCE SPECIFICATION ===\n${specContent}`);
  }

  if (related.length > 0) {
    const relatedText = related
      .map(r => `--- ${r.name} ---\n${r.content}`)
      .join('\n\n');
    blocks.push(`=== P5: RELATED CAPABILITY KNOWLEDGE ===\n${relatedText}`);
  }

  return `KNOWLEDGE BASE:\n\n${blocks.join('\n\n')}\n\n---\n\nQUESTION: ${question}`;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseAdvisorResponse(rawText) {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/,      '')
      .replace(/\s*```$/,      '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    // Graceful fallback: wrap raw text in the expected structure
    return {
      executivePerspective: rawText.trim(),
      industryContext:      '',
      recommendations:      [],
      potentialRisks:       [],
      suggestedNextStep:    '',
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ask the AI Strategy Advisor a question grounded in the current blueprint.
 *
 * @param {object}  params
 * @param {string}  params.capabilityId  - e.g. 'ai-initiative-leadership'
 * @param {object}  params.blueprint     - full blueprint from /strategy-canvas/blueprint/:id
 * @param {string}  params.question      - user's question
 * @returns {Promise<{ response, capabilityName, industry, inputTokens, outputTokens }>}
 */
export async function askAdvisor({ capabilityId, blueprint, question }) {
  const industry       = blueprint?.industry       || 'Automotive';
  const capabilityName = blueprint?.capabilityName || '';
  const sectionNames   = (blueprint?.sections || []).map(s => s.title);

  // ── Retrieve all context layers ─────────────────────────────────────────────
  const { coreContent, industryContent } = readCapabilityContent(capabilityId, industry);
  const specContent                       = readSpecContent();
  const related                           = readRelatedCapabilityContent(capabilityId);

  // ── Build prompt + call LLM ─────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(industry, capabilityName, sectionNames);
  const userMessage  = buildUserMessage(blueprint, coreContent, industryContent, specContent, related, question);

  const { text, inputTokens, outputTokens } = await generate({ systemPrompt, userMessage });

  return {
    response:       parseAdvisorResponse(text),
    capabilityName,
    industry,
    inputTokens,
    outputTokens,
  };
}
