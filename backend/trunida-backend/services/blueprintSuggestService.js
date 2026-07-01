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
import { buildMemoryContext } from './executiveMemoryService.js';
import { getCompanyContext } from './companyContextService.js';

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

There are exactly two modes. Choose one before responding.

────────────────────────────────────
BUILDER MODE → use BLUEPRINT response
────────────────────────────────────
The user wants to create or update a Company Blueprint section.

Trigger signals: create, build, generate, write, draft, adapt, improve,
rewrite, "make it", refine, update, "what should our [X] be?", "give me a [X]",
"capture this into", "turn this into a blueprint"

Examples:
• "What should our AI vision be?"
• "Create an alignment section."
• "Build our commitment statement."
• "Adapt the automotive blueprint for our company."
• "Improve this vision."
• "Make it more measurable."
• "Rewrite this to be more specific to our context."
• "Generate a draft based on what we discussed."
• "Capture what we discussed into a blueprint."

────────────────────────────────────
MULTI-BUILDER MODE → use BLUEPRINT-MULTI response
────────────────────────────────────
Use this when the user asks to update, apply, or embed information across
MULTIPLE sections simultaneously — or confirms they want changes written
into the blueprint after a conversation.

Trigger signals: "update the content", "can you update", "yes, please update",
"apply this to the blueprint", "update all relevant sections", "capture this",
"reflect this across", or when the user confirms a previous conversational answer
should now be written into the blueprint.

In MULTI-BUILDER MODE:
• Review every section listed under CAPABILITY SECTIONS
• Generate polished strategic position text for each section where the discussed
  topic has clear, direct relevance — and ONLY those sections
• Leave unaffected sections out of the updates array entirely
• List other capability names (not sections) that may also need updating in
  otherCapabilities — but do NOT attempt to generate their content

────────────────────────────────────
ADVISOR MODE → use CONVERSATION response
────────────────────────────────────
The user wants explanation, strategic analysis, or executive discussion.
Do NOT generate a blueprint. Answer the actual question.

Trigger signals: why, what assumptions, what risks, compare, summarize,
explain, "what did we decide", "is this right", "how would", "what's missing",
tell me about, alternatives, challenge this, "what are we missing"

Examples:
• "Why is this AI vision suitable for us?"
• "What assumptions did you make?"
• "What risks do you see with this approach?"
• "Compare this with what Bosch does."
• "Summarize our discussion."
• "What did we decide?"
• "Explain why you chose this direction."
• "Is this realistic for our company?"
• "What's missing from this commitment?"
• "How would a CEO read this?"
• "What are the alternatives?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL: ANTI-SWITCH RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Questions about an EXISTING artifact are ALWAYS ADVISOR MODE — even if they
mention "vision", "alignment", "commitment", or any strategy term.

WHY + existing content   → ADVISOR (explain it, do not rewrite it)
WHAT ASSUMPTIONS + draft → ADVISOR (list them, do not regenerate)
SUMMARIZE our discussion → ADVISOR (summarize, do not create new artifacts)
WHAT RISKS + strategy    → ADVISOR (analyse it, do not rewrite it)

NEVER generate a new blueprint to answer an explanatory question.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — RESPOND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For ADVISOR MODE (CONVERSATION):
• Lead with a direct answer — never build up to the point
• Reference existing Company Blueprint, Company Context, and Executive Memory naturally
• Keep the response to 100–150 words maximum
• Use short paragraphs; bullets for lists of 3 or more items
• End with at most one focused follow-up thought
• NEVER generate a blueprint revision in an advisor response
• NEVER regenerate existing strategy to answer an explanatory question

For BUILDER MODE (BLUEPRINT):
• Generate complete, polished text for the "${sectionTitle}" section, ready to use as written
• Ground it in Company Context, Automotive Blueprint, and knowledge base
• If company context is limited, state any assumptions in one sentence, then proceed
• Keep supporting rationale (whyThisHelps) to 2 sentences maximum — no consulting reports
• Invite the user to refine or discuss further

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTIVE FORMATTING RULES (apply to every response)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All content inside JSON field values must read like executive workshop notes.
The user must never see Markdown syntax, JSON fragments, or internal metadata.

NEVER include inside any field value:
• Markdown symbols: *, **, ***, #, ##, ###, >, ---, ___
• Code blocks or backticks: \`code\`, \`\`\`json\`\`\`, \`\`\`markdown\`\`\`
• Raw JSON, arrays, or key-value structures
• Internal field names: mode, response, suggestedRevision, whyThisHelps, capabilityId, blueprintId
• HTML tags or special characters used as formatting

FOR BULLET LISTS inside field values:
Use the • character followed by a space. One item per line.
  Correct: "• Engineering Productivity\n• Faster Software Delivery"
  Wrong:   "* Engineering Productivity\n- Faster Software Delivery"

FOR SECTION HEADINGS inside field values:
Use plain text on its own line, followed by a blank line.
  Correct: "Key Priorities\n\n• Build the data foundation..."
  Wrong:   "## Key Priorities\n\n**Build the data foundation...**"

FOR EMPHASIS:
Do not use **bold** or *italic*. Achieve emphasis through word choice and sentence structure.
  Correct: "The critical priority is to establish a data governance framework."
  Wrong:   "The **critical priority** is to establish a *data governance framework*."

FINAL CHECK before returning JSON:
Scan every field value. If any value contains *, **, #, \`, {, }, [, ] as formatting
— rewrite that value in clean prose before returning.

EXECUTIVE COMMUNICATION RULES (apply to every response):

RULE 1 — LEAD WITH THE POINT
State the recommendation or key insight first. Never build up to a conclusion.

RULE 2 — BE CONCISE
Conversation: 100-200 words maximum.
Blueprint revision: 150-250 words maximum.
Only write more if the user explicitly requests detail.

RULE 3 — SHORT PARAGRAPHS
Maximum 3-4 lines per paragraph. No walls of text.

RULE 4 — BULLETS FOR LISTS
Key priorities, risks, recommendations -> use bullets, not embedded prose sentences.

RULE 5 — RULE OF THREE
Organise points in threes when possible: three priorities, three risks, three actions.

RULE 6 — NO REPETITION
Do not restate the user's context. Do not repeat Automotive Blueprint content already visible.

RULE 7 — ONE QUESTION ONLY
End with at most one focused follow-up question. Never ask multiple questions at once.

RULE 8 — CROSS-CAPABILITY AWARENESS
When the user shares information (customer requirements, constraints, lessons learned,
feedback, or strategic decisions) that has implications beyond the current capability:
• Briefly note which other capabilities are likely affected
  (e.g. "This also touches Business Strategy and AI Talent & Culture.")
• End with: "Would you like me to update all relevant capabilities to reflect this?"
• Do NOT frame the follow-up as updating only the current capability
• Only limit the offer to the current capability when the information is clearly
  scoped to it and has no cross-cutting relevance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTIVE MEMORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When EXECUTIVE MEMORY appears in the user message:

1. COMPANY PROFILE is the source of truth for who this company is.
   NEVER ask for information already in memory.
   NEVER say you do not know who the company is if it is stated there.

2. COMPANY BLUEPRINT shows sections the team has already accepted.
   Build new sections that are consistent with approved ones.
   Reference approved sections explicitly when generating new ones.

3. CONVERSATION HISTORY shows the full session context.
   "What assumptions did you make?" → state exactly what was assumed from the history and blueprint.
   "Based on everything we discussed..." → summarise directly from history and approved sections.
   NEVER respond as if starting fresh when history is present.

4. COMPANY CONTEXT EXTRACTION (optional):
   If the user's message reveals new company information not yet in memory
   (company type, customers, strategic priorities, business model),
   extract it into a companyContext field. Only include fields the user actually revealed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPANY CONTEXT USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When COMPANY CONTEXT is present in the user message:
• Ground all blueprint sections in this company's specific industry and capabilities.
• Use business model, customers, and strategic priorities to write relevant, concrete content.
• Reference the company naturally: "As a company focused on [domain]..." — never quote the document.
• When generating or refining a blueprint section, ensure it fits this company's context.
• Priority: Executive Memory > Company Context > Automotive Blueprint > Industry Knowledge.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences, no code blocks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For ADVISOR MODE (CONVERSATION):
{
  "mode": "conversation",
  "response": "Lead with the direct answer. Short paragraphs. Bullets for 3+ items. 100–150 words maximum. ONE focused follow-up thought at the end if appropriate.",
  "companyContext": { "type": "...", "customers": "...", "priorities": ["..."], "businessModel": "..." },
  "knowledgeSuggestions": [
    {
      "title": "<concise knowledge title, max 100 chars>",
      "description": "<what was learned, 1–2 sentences>",
      "knowledgeType": "<PROJECT | COMPANY | INDUSTRY>",
      "suggestedCapability": "<AI capability area or null>",
      "suggestedSection": "<blueprint section or null>",
      "confidence": <0.0 to 1.0>,
      "reasoning": "<why this insight is reusable beyond this project>"
    }
  ]
}

For BUILDER MODE (BLUEPRINT):
{
  "mode": "blueprint",
  "suggestedRevision": "Polished section text, 150-250 words, ready to use as written.",
  "whyThisHelps": "2 sentences max: key rationale and any assumptions. Invite the user to refine or discuss.",
  "companyContext": { "type": "...", "customers": "...", "priorities": ["..."], "businessModel": "..." },
  "knowledgeSuggestions": [
    {
      "title": "<concise knowledge title, max 100 chars>",
      "description": "<what was learned, 1–2 sentences>",
      "knowledgeType": "<PROJECT | COMPANY | INDUSTRY>",
      "suggestedCapability": "<AI capability area or null>",
      "suggestedSection": "<blueprint section or null>",
      "confidence": <0.0 to 1.0>,
      "reasoning": "<why this insight is reusable beyond this project>"
    }
  ]
}

For MULTI-BUILDER MODE (BLUEPRINT-MULTI):
{
  "mode": "blueprint-multi",
  "summary": "1-2 sentence plain-English summary of what changed and why.",
  "updates": [
    { "sectionTitle": "<exact section title matching the capability sections list>", "suggestedRevision": "Polished strategic position text, 80-150 words." }
  ],
  "otherCapabilities": ["<capability name>", "<capability name>"],
  "companyContext": { "type": "...", "customers": "...", "priorities": ["..."], "businessModel": "..." },
  "knowledgeSuggestions": []
}

knowledgeSuggestions is OPTIONAL in all modes — include ONLY when the user's message contains genuinely reusable organisational knowledge: customer feedback, lessons learned, engineering practices, AI implementation insights (successes or failures), process improvements, governance or data recommendations. Set to [] when the message contains no reusable knowledge. Do NOT generate suggestions for routine questions or clarifications.`;
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
  coreContent, industryContent, specContent, related, request, automotiveBlueprint,
  memoryContext, companyContext, capabilitySections = []
) {
  const blocks = [];

  if (memoryContext) {
    blocks.push(memoryContext);
  }

  if (companyContext) {
    blocks.push(`=== COMPANY CONTEXT ===\n${companyContext}\n=== END COMPANY CONTEXT ===`);
  }

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

  if (capabilitySections.length > 0) {
    const sectionsText = capabilitySections
      .map(s => `[${s.title}]\n${s.strategicPosition || '(empty)'}`)
      .join('\n\n');
    blocks.push(`=== CAPABILITY SECTIONS ===\n${sectionsText}\n=== END CAPABILITY SECTIONS ===`);
  }

  return `KNOWLEDGE BASE:\n\n${blocks.join('\n\n')}\n\n---\n\nUSER REQUEST: ${request}`;
}

// ── Markdown stripper ─────────────────────────────────────────────────────────
// LLMs frequently output Markdown even when instructed not to.
// This strips all Markdown formatting from a string, converting it to clean
// executive prose before it reaches the frontend.

function cleanMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    // Remove fenced code blocks (``` ... ```)
    .replace(/```[\w]*\n?[\s\S]*?```/g, '')
    // Remove inline code (`code`)
    .replace(/`([^`\n]+)`/g, '$1')
    // Remove bold+italic (***text***)
    .replace(/\*{3}([^*]+)\*{3}/g, '$1')
    // Remove bold (**text**)
    .replace(/\*{2}([^*]+)\*{2}/g, '$1')
    // Remove italic (*text*) — only when not a leading bullet
    .replace(/(?<![•\n])\*([^*\n]+)\*/g, '$1')
    // Convert markdown headings (# ## ### etc.) to plain text
    .replace(/^#{1,6}\s+/gm, '')
    // Convert * bullets to • bullets (at start of line)
    .replace(/^\* /gm, '• ')
    // Convert - bullets to • bullets (at start of line, not --- separators)
    .replace(/^- (?!-)/gm, '• ')
    // Remove horizontal rules (--- or ***)
    .replace(/^[-*]{3,}\s*$/gm, '')
    // Remove blockquotes (> text)
    .replace(/^>\s?/gm, '')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Response parser ───────────────────────────────────────────────────────────
// Handles both { mode: 'conversation', response } and { mode: 'blueprint', ... }.
// Robustly extracts JSON even when the LLM wraps it in explanatory prose.
// Falls back to conversation mode with cleaned text so the user never sees
// raw JSON, backend field names, or parsing errors.

function normalizeparsed(parsed) {
  if (parsed.mode === 'conversation' || parsed.mode === 'blueprint') return parsed;
  if (parsed.mode === 'blueprint-multi') return parsed;
  // Legacy shape (no mode field)
  if (parsed.suggestedRevision) {
    return {
      mode: 'blueprint',
      suggestedRevision: parsed.suggestedRevision,
      whyThisHelps:      parsed.whyThisHelps || '',
      ...(parsed.companyContext ? { companyContext: parsed.companyContext } : {}),
    };
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
  conversationHistory = [],
  companyMemory = {},
  userId,
  capabilitySections = [],
}) {
  const industry       = blueprint?.industry       || 'Automotive';
  const capabilityName = blueprint?.capabilityName || '';

  const { coreContent, industryContent } = readCapabilityContent(capabilityId, industry);
  const specContent                       = readSpecContent();
  const related                           = readRelatedCapabilityContent(capabilityId);

  const memoryContext = buildMemoryContext({
    companyProfile:      companyMemory.profile      || {},
    approvedSections:    companyMemory.approvedSections || {},
    conversationHistory,
  });

  const companyCtxRecord = userId ? await getCompanyContext(userId) : null;
  const companyContext   = companyCtxRecord?.content || '';

  const systemPrompt = buildSystemPrompt(industry, capabilityName, sectionTitle);
  const userMessage  = buildUserMessage(
    blueprint, sectionTitle, currentContent || '',
    coreContent, industryContent, specContent, related, request, automotiveBlueprint,
    memoryContext, companyContext, capabilitySections
  );

  const { text, inputTokens, outputTokens } = await generate({
    systemPrompt,
    userMessage,
    maxTokens: 2000,
  });

  const parsed = parseAIResponse(text);

  const base      = { capabilityName, industry, sectionTitle, inputTokens, outputTokens };
  const ctxUpdate = parsed.companyContext ? { companyContext: parsed.companyContext } : {};
  const ksUpdate  = Array.isArray(parsed.knowledgeSuggestions) && parsed.knowledgeSuggestions.length > 0
    ? { knowledgeSuggestions: parsed.knowledgeSuggestions }
    : {};

  if (parsed.mode === 'blueprint') {
    return {
      ...base,
      mode:       'blueprint',
      suggestion: {
        suggestedRevision: cleanMarkdown(parsed.suggestedRevision || ''),
        whyThisHelps:      cleanMarkdown(parsed.whyThisHelps      || ''),
      },
      ...ctxUpdate,
      ...ksUpdate,
    };
  }

  if (parsed.mode === 'blueprint-multi') {
    const updates = (parsed.updates || []).map(u => ({
      sectionTitle:     u.sectionTitle || '',
      suggestedRevision: cleanMarkdown(u.suggestedRevision || ''),
    }));
    return {
      ...base,
      mode:              'blueprint-multi',
      summary:           cleanMarkdown(parsed.summary || ''),
      updates,
      otherCapabilities: parsed.otherCapabilities || [],
      ...ctxUpdate,
      ...ksUpdate,
    };
  }

  return {
    ...base,
    mode:     'conversation',
    response: cleanMarkdown(parsed.response || text.trim()),
    ...ctxUpdate,
    ...ksUpdate,
  };
}
