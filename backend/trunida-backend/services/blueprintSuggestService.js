/**
 * SoorgaAI — Blueprint Section Advisor Service (Sprint 16 / Sprint 22)
 *
 * Sprint 22: The advisor detects user intent before responding.
 *
 * CONVERSATION mode — for explanatory, analytical, or strategic questions:
 *   Returns { mode: 'conversation', response: '<prose>' }
 *   Rendered as a chat message. No Accept/Refine/Discard shown.
 *
 * BLUEPRINT mode — only when the user explicitly requests a draft/update:
 *   Returns { mode: 'blueprint', suggestion: { suggestedRevision, whyThisHelps } }
 *   Rendered as a suggestion card with Accept/Refine/Discard.
 *
 * Retrieval priority:
 *   P0 — Automotive Blueprint (industry reference for this section)
 *   P1 — Active blueprint section + company draft
 *   P2 — Core capability document
 *   P3 — Industry capability document
 *   P4 — AI Strategy Intelligence Specification
 *   P5 — Related capability knowledge
 */

import {
  readCapabilityContent,
  readSpecContent,
  readRelatedCapabilityContent,
} from './strategyCanvasService.js';
import { generate } from './llmService.js';

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(industry, capabilityName, sectionTitle) {
  return `You are an experienced Automotive CTO and AI Transformation Advisor collaborating with a senior executive team on their Company AI Blueprint.

ADVISORY CONTEXT:
- Industry: ${industry}
- Capability: ${capabilityName}
- Active Section: ${sectionTitle}

YOUR ROLE:
You are a trusted strategic advisor — not a document editor. You educate, challenge, analyse, and help the executive team think clearly. You only update the Company Blueprint when explicitly asked to do so.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — DETECT USER INTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONVERSATION intent — respond as an advisor, do NOT produce a blueprint revision:
• Why / what does this mean / explain this
• What risks / what could go wrong / concerns
• What assumptions / what are we assuming
• Alternatives / other approaches / different angle
• CEO or CTO perspective / business case / ROI
• Challenge / critique / is this right / push back on this
• Compare / how would [company X] approach this / industry examples
• What are we missing / blind spots / gaps in our thinking
• How to implement / execution / next steps
• General questions about the strategy or capability

BLUEPRINT intent — generate a company blueprint revision:
• Create / write / draft / generate [section name]
• Improve / enhance / strengthen [section name]
• Rewrite / update / revise [section name]
• Make this measurable / make this specific / make this executive-focused
• Adapt this for our company / apply this to our blueprint
• Summarize what we agreed / capture our discussion into a draft

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — RESPOND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For CONVERSATION intent:
• Answer the actual question directly and insightfully
• Think and speak as an experienced ${industry} CTO and AI strategy advisor
• Reference the Automotive Blueprint and Company Blueprint naturally when relevant
• Challenge assumptions honestly — do not just validate what the user says
• Discuss trade-offs; nothing in strategy is without cost or risk
• Keep responses practical and executive-level — no marketing language
• End naturally — pose a question or suggest a next thought when appropriate
• NEVER generate or rewrite the Company Blueprint unless asked
• NEVER output a blueprint revision in conversation mode

For BLUEPRINT intent:
• Generate complete, polished text ready for the Company Blueprint
• Ground it firmly in the Automotive Blueprint and knowledge base
• State any assumptions you are making about the company
• Briefly explain the strategic value of the revision

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — valid JSON only, no markdown fences, no code blocks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For CONVERSATION:
{
  "mode": "conversation",
  "response": "Your complete advisory response as natural executive prose. Can be multiple paragraphs. Reference automotive context naturally. End with a question or suggestion if appropriate."
}

For BLUEPRINT:
{
  "mode": "blueprint",
  "suggestedRevision": "Complete polished text for this section, ready to use as written.",
  "whyThisHelps": "2-3 sentences on the strategic value of this revision."
}`;
}

// ── Context formatters ────────────────────────────────────────────────────────

function formatCurrentSection(sectionTitle, currentContent, blueprint) {
  const section = blueprint.sections?.find(s => s.title === sectionTitle);
  const lines   = [`Section: ${sectionTitle}`];

  if (currentContent && currentContent.trim()) {
    lines.push(`Company Draft (current content):\n${currentContent.trim()}`);
  } else {
    lines.push('Company Draft: (none yet)');
    if (section?.definition) {
      lines.push(`Blueprint Definition: ${section.definition}`);
    }
    if (section?.keyPrinciples?.length) {
      lines.push(
        `Key Principles:\n${section.keyPrinciples.map(p => `  - ${p}`).join('\n')}`
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

// ── Response parser ───────────────────────────────────────────────────────────
// Handles both { mode: 'conversation', response } and { mode: 'blueprint', ... }
// Falls back to conversation mode so the user always sees something useful.

function parseAIResponse(rawText) {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/,      '')
      .replace(/\s*```$/,      '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.mode === 'conversation' || parsed.mode === 'blueprint') return parsed;
    // Legacy shape (no mode field): treat as blueprint if suggestedRevision present
    if (parsed.suggestedRevision) {
      return {
        mode:             'blueprint',
        suggestedRevision: parsed.suggestedRevision,
        whyThisHelps:      parsed.whyThisHelps || '',
      };
    }
    return { mode: 'conversation', response: rawText.trim() };
  } catch {
    return { mode: 'conversation', response: rawText.trim() };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Handle a user message in the context of a blueprint section.
 * Returns either a conversation response or a blueprint suggestion depending
 * on detected intent. The caller routes rendering based on `result.mode`.
 *
 * @param {object} params
 * @param {string} params.capabilityId       - e.g. 'ai-initiative-leadership'
 * @param {object} params.blueprint          - full blueprint from /strategy-canvas/blueprint/:id
 * @param {string} params.sectionTitle       - e.g. 'Vision'
 * @param {string} params.currentContent     - company draft for this section (may be empty)
 * @param {string} params.request            - user's message
 * @param {string} params.automotiveBlueprint - industry reference prose for this section
 * @returns {Promise<
 *   | { mode: 'conversation', response, capabilityName, industry, sectionTitle }
 *   | { mode: 'blueprint', suggestion: { suggestedRevision, whyThisHelps }, capabilityName, industry, sectionTitle }
 * >}
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

  const parsed = parseAIResponse(text);

  const base = { capabilityName, industry, sectionTitle, inputTokens, outputTokens };

  if (parsed.mode === 'blueprint') {
    return {
      ...base,
      mode:       'blueprint',
      suggestion: {
        suggestedRevision: parsed.suggestedRevision || '',
        whyThisHelps:      parsed.whyThisHelps      || '',
      },
    };
  }

  return {
    ...base,
    mode:     'conversation',
    response: parsed.response || text.trim(),
  };
}
