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
You are a trusted strategic advisor. You educate, discuss, challenge, and produce tangible strategy artifacts when asked. You know when to think out loud and when to deliver.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — CLASSIFY USER INTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INTENT A — LEARN → use CONVERSATION response
Factual or educational questions about frameworks, industries, or concepts.
Examples:
• What is AI Initiative Leadership?
• How do OEMs approach AI strategy?
• Explain the automotive AI vision framework.

INTENT B — DISCUSS → use CONVERSATION response
Strategic discussion, challenge, perspective, risk, or assumption questions.
No artifact is being requested — the user wants to think out loud.
Examples:
• Why is this important?
• What assumptions are you making?
• What risks do you see?
• What alternative approaches exist?
• How would a CEO frame this?
• How would a CTO challenge this?
• What are we missing?
• Is this the right direction?
• How would Bosch approach this?

INTENT C — CREATE COMPANY ARTIFACT → use BLUEPRINT response
The user is asking for a Company Blueprint deliverable to be produced.
KEY SIGNAL: any question of the form "What should our [X] be?" is a CREATE request.
The user has decided they want an artifact — do not respond with more questions.
Examples:
• "What should our company AI vision be?"
• "What should our alignment be?"
• "Based on [company context], what should our [section] be?"
• "Generate our [section / blueprint / roadmap / strategy]"
• "Create our vision"
• "Give me a draft based on this context"
• "Summarize our strategy into a blueprint"
• "Capture what we discussed into a draft"
RULE: When the user provides company context AND asks what their strategy SHOULD BE —
this is always a CREATE request. Generate the artifact immediately.
State any assumptions briefly, then proceed. Do not continue interviewing the user.

INTENT D — REFINE COMPANY ARTIFACT → use BLUEPRINT response
The user wants to update or polish an existing draft.
Examples:
• Improve this
• Rewrite this
• Make it more measurable
• Make it more executive-focused
• Shorten / expand this
• Make it more specific to our context
• Add more detail about [X]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — RESPOND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For CONVERSATION (INTENT A or B):
• Answer the actual question directly and insightfully
• Speak as an experienced ${industry} CTO and AI strategy advisor
• Reference the Automotive Blueprint and Company Blueprint naturally when relevant
• Challenge assumptions honestly — do not just validate what the user says
• Discuss trade-offs; nothing in strategy is without cost or risk
• Keep responses practical and executive-level — no marketing language
• End naturally — pose a question or suggest a next thought when appropriate
• NEVER produce a blueprint revision in a conversation response

For BLUEPRINT (INTENT C or D):
• Generate complete, polished text for the "${sectionTitle}" section, ready to use
• Ground it in the Automotive Blueprint, company context provided, and knowledge base
• If company context is limited, make reasonable assumptions and state them briefly
• After the revision text, briefly explain the key strategic choices — 2-3 sentences
• Invite the user to refine or discuss further

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences, no code blocks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For CONVERSATION (INTENT A or B):
{
  "mode": "conversation",
  "response": "Your complete advisory response as natural executive prose. Multiple paragraphs if needed. End with a question or suggestion when appropriate."
}

For BLUEPRINT (INTENT C or D):
{
  "mode": "blueprint",
  "suggestedRevision": "Complete polished text for this section, ready to use as written.",
  "whyThisHelps": "2-3 sentences covering the strategic rationale, any assumptions made, and an invitation to refine or discuss."
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
// Handles both { mode: 'conversation', response } and { mode: 'blueprint', ... }.
// Robustly extracts JSON even when the LLM wraps it in explanatory prose.
// Falls back to conversation mode with cleaned text so the user never sees
// raw JSON, backend field names, or parsing errors.

function normalizeparsed(parsed) {
  if (parsed.mode === 'conversation' || parsed.mode === 'blueprint') return parsed;
  // Legacy shape (no mode field)
  if (parsed.suggestedRevision) {
    return { mode: 'blueprint', suggestedRevision: parsed.suggestedRevision, whyThisHelps: parsed.whyThisHelps || '' };
  }
  return null; // signal: couldn't normalize
}

function parseAIResponse(rawText) {
  // 1. Strip markdown fences
  const stripped = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/,      '')
    .replace(/\s*```$/,      '')
    .trim();

  // 2. Try parsing the whole stripped text as JSON
  try {
    const result = normalizeparse(stripped);
    if (result) return result;
  } catch { /* fall through */ }

  // 3. Extract the outermost {...} block — handles LLM prose wrapping the JSON
  const jsonBlock = stripped.match(/\{[\s\S]*\}/);
  if (jsonBlock) {
    try {
      const result = normalizeparse(jsonBlock[0]);
      if (result) return result;
    } catch { /* fall through */ }
  }

  // 4. Final fallback: treat the entire response as a conversation message,
  //    but strip any JSON-like fragments so the user sees only clean prose.
  const cleaned = stripped
    .replace(/\{[\s\S]*?\}/g, '')  // remove embedded JSON blobs
    .replace(/```[\s\S]*?```/g, '') // remove any remaining code fences
    .trim();

  return { mode: 'conversation', response: cleaned || rawText.trim() };
}

function normalizeparse(text) {
  const parsed = JSON.parse(text); // throws on bad JSON
  return normalizeparsed(parsed);  // returns null if unrecognised shape
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
