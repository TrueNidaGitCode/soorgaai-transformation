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
import { buildMemoryContext } from './executiveMemoryService.js';

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(industry, capabilityName, sectionNames) {
  return `You are an experienced Automotive CTO and AI Transformation Advisor. You provide \
grounded, actionable guidance to senior leaders based on the knowledge documents provided.

ADVISORY CONTEXT:
- Industry: ${industry}
- Current Capability: ${capabilityName}
- Blueprint Sections: ${sectionNames.join(', ')}

CONTENT RULES:
1. Answer strictly from the knowledge documents provided.
2. Tailor all guidance to the ${industry} industry and senior executive context.
3. Do not invent company-specific details — state assumptions explicitly if needed.
4. If the knowledge base is insufficient for part of the question, say so.

EXECUTIVE MEMORY USAGE:
When EXECUTIVE MEMORY is present in the user message:
• Company Profile is the source of truth — NEVER ask again for information already stated.
• Approved Blueprint sections are the team's agreed strategy — reference and build on them directly.
• Conversation History provides full context — use it to answer follow-up and summary questions.
• NEVER respond as if starting fresh when there is conversation history.

EXECUTIVE COMMUNICATION RULES:
• Lead with the main insight or recommendation — never build up to it.
• Be concise: executivePerspective 2 sentences max, industryContext 2 sentences max.
• Recommendations: exactly 3, each a single action-oriented sentence.
• Risks: 2–3 specific risks, one sentence each. No generic risks.
• suggestedNextStep: one sentence, immediately actionable.
• No marketing language. No padding. No repetition of context already stated.
• Write for a CTO who has 30 seconds to read this.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "executivePerspective": "<Lead with the key insight. 1-2 sentences maximum.>",
  "industryContext": "<${industry}-specific implication that changes how the user should act. 1-2 sentences.>",
  "recommendations": ["<Action 1 — specific and measurable>", "<Action 2>", "<Action 3>"],
  "potentialRisks": ["<Specific risk 1>", "<Specific risk 2>"],
  "suggestedNextStep": "<One concrete next step the user can take this week.>"
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

function buildUserMessage(blueprint, coreContent, industryContent, specContent, related, question, automotiveBlueprint, memoryContext) {
  const blocks = [];

  if (memoryContext) {
    blocks.push(memoryContext);
  }

  if (automotiveBlueprint) {
    blocks.push(`=== AUTOMOTIVE INDUSTRY BLUEPRINT ===\n${automotiveBlueprint}`);
  }

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
export async function askAdvisor({
  capabilityId,
  blueprint,
  question,
  automotiveBlueprint = '',
  conversationHistory = [],
  companyMemory = {},
}) {
  const industry       = blueprint?.industry       || 'Automotive';
  const capabilityName = blueprint?.capabilityName || '';
  const sectionNames   = (blueprint?.sections || []).map(s => s.title);

  // ── Retrieve all context layers ─────────────────────────────────────────────
  const { coreContent, industryContent } = readCapabilityContent(capabilityId, industry);
  const specContent                       = readSpecContent();
  const related                           = readRelatedCapabilityContent(capabilityId);

  const memoryContext = buildMemoryContext({
    companyProfile:      companyMemory.profile      || {},
    approvedSections:    companyMemory.approvedSections || {},
    conversationHistory,
  });

  // ── Build prompt + call LLM ─────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(industry, capabilityName, sectionNames);
  const userMessage  = buildUserMessage(blueprint, coreContent, industryContent, specContent, related, question, automotiveBlueprint, memoryContext);

  const { text, inputTokens, outputTokens } = await generate({ systemPrompt, userMessage });

  return {
    response:       parseAdvisorResponse(text),
    capabilityName,
    industry,
    inputTokens,
    outputTokens,
  };
}
