/**
 * SoorgaAI — Blueprint Section Suggestion Service (Sprint 16)
 *
 * Generates a structured, section-scoped suggestion for a single blueprint
 * section. The user decides whether to Accept, Edit, or Reject it.
 *
 * Retrieval priority mirrors advisorService:
 *   P1 — Active blueprint section + company draft
 *   P2 — Core capability document
 *   P3 — Industry capability document
 *   P4 — AI Strategy Intelligence Specification
 *   P5 — Related capability knowledge
 *
 * Response structure (enforced via system prompt):
 *   currentObservations  — objective assessment of current content
 *   strengths            — what works well
 *   potentialGaps        — what is missing or could be stronger
 *   suggestedRevision    — complete, ready-to-use improved text
 *   whyThisHelps         — strategic justification for the changes
 *   alternatives         — optional alternative phrasings
 */

import {
  readCapabilityContent,
  readSpecContent,
  readRelatedCapabilityContent,
} from './strategyCanvasService.js';
import { generate } from './llmService.js';

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(industry, capabilityName, sectionTitle) {
  return `You are SoorgaAI, an executive AI strategy consultant specialising in collaborative blueprint development.

ADVISORY CONTEXT:
- Industry: ${industry}
- Capability: ${capabilityName}
- Active Section: ${sectionTitle}

ROLE: Collaborate with the user to improve the "${sectionTitle}" section of their company AI strategy blueprint. You suggest — they decide whether to accept.

INSTRUCTIONS:
1. Assess the current section content objectively against the provided knowledge documents.
2. Identify concrete strengths to preserve and specific gaps to address.
3. Generate a complete, improved revision grounded strictly in the knowledge base provided.
4. Always explain WHY the revision is better — justify every suggestion with strategic reasoning.
5. Tailor everything to ${industry} industry realities and senior executive expectations.
6. Do not invent company-specific information. State any assumptions you make explicitly.
7. If current content is empty, generate an appropriate industry-grounded draft from the knowledge base.
8. Be direct and specific — this content will be used in executive decision-making.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences:
{
  "currentObservations": "<2-3 sentence objective assessment of the current content — its strengths and weaknesses>",
  "strengths": ["<what works well in the current content>"],
  "potentialGaps": ["<what is missing or could be improved>"],
  "suggestedRevision": "<the complete, polished text for this section — ready to use as written>",
  "whyThisHelps": "<2-3 sentences explaining the improvements and their strategic value>",
  "alternatives": ["<alternative phrasing or approach the user may prefer>"]
}`;
}

// ── Context formatters ────────────────────────────────────────────────────────

function formatCurrentSection(sectionTitle, currentContent, blueprint) {
  const section = blueprint.sections?.find(s => s.title === sectionTitle);
  const lines   = [`Section: ${sectionTitle}`];

  if (currentContent && currentContent.trim()) {
    lines.push(`Company Draft (current user content):\n${currentContent.trim()}`);
  } else {
    lines.push('Company Draft: (not yet written — generate an appropriate draft)');
    if (section?.definition) {
      lines.push(`Blueprint Definition: ${section.definition}`);
    }
    if (section?.keyPrinciples?.length) {
      lines.push(
        `Blueprint Key Principles:\n${section.keyPrinciples.map(p => `  - ${p}`).join('\n')}`
      );
    }
  }

  if (section?.leadershipQuestion) {
    lines.push(`Leadership Question to Address: ${section.leadershipQuestion}`);
  }

  return lines.join('\n');
}

function buildUserMessage(
  blueprint, sectionTitle, currentContent,
  coreContent, industryContent, specContent, related, request, automotiveBlueprint
) {
  const blocks = [];

  if (automotiveBlueprint) {
    blocks.push(`=== AUTOMOTIVE INDUSTRY BLUEPRINT ===\n${automotiveBlueprint}`);
  }

  blocks.push(
    `=== P1: ACTIVE BLUEPRINT SECTION ===\n${formatCurrentSection(sectionTitle, currentContent, blueprint)}`
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
    const relatedText = related.map(r => `--- ${r.name} ---\n${r.content}`).join('\n\n');
    blocks.push(`=== P5: RELATED CAPABILITY KNOWLEDGE ===\n${relatedText}`);
  }

  return `KNOWLEDGE BASE:\n\n${blocks.join('\n\n')}\n\n---\n\nUSER REQUEST: ${request}`;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseSuggestionResponse(rawText) {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/,      '')
      .replace(/\s*```$/,      '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      currentObservations: rawText.trim(),
      strengths:           [],
      potentialGaps:       [],
      suggestedRevision:   rawText.trim(),
      whyThisHelps:        '',
      alternatives:        [],
    };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a structured improvement suggestion for one blueprint section.
 *
 * @param {object} params
 * @param {string} params.capabilityId   - e.g. 'ai-initiative-leadership'
 * @param {object} params.blueprint      - full blueprint from /strategy-canvas/blueprint/:id
 * @param {string} params.sectionTitle   - e.g. 'Vision'
 * @param {string} params.currentContent - user's current draft text for this section (may be empty)
 * @param {string} params.request        - user's request e.g. 'Make this more measurable'
 * @returns {Promise<{ suggestion, capabilityName, industry, sectionTitle, inputTokens, outputTokens }>}
 */
export async function suggestBlueprintSection({
  capabilityId,
  blueprint,
  sectionTitle,
  currentContent,
  request,
  automotiveBlueprint = '',
}) {
  const industry       = blueprint?.industry       || 'Automotive';
  const capabilityName = blueprint?.capabilityName || '';

  const { coreContent, industryContent } = readCapabilityContent(capabilityId, industry);
  const specContent                       = readSpecContent();
  const related                           = readRelatedCapabilityContent(capabilityId);

  const systemPrompt = buildSystemPrompt(industry, capabilityName, sectionTitle);
  const userMessage  = buildUserMessage(
    blueprint, sectionTitle, currentContent || '',
    coreContent, industryContent, specContent, related, request, automotiveBlueprint
  );

  const { text, inputTokens, outputTokens } = await generate({
    systemPrompt,
    userMessage,
    maxTokens: 2000,
  });

  return {
    suggestion:     parseSuggestionResponse(text),
    capabilityName,
    industry,
    sectionTitle,
    inputTokens,
    outputTokens,
  };
}
