/**
 * SoorgaAI — Company Research Service
 *
 * Runs a single Claude call with the web_search server tool to research a
 * company on the public internet and draft Enterprise Blueprint section
 * content from real findings — not model inference from the company name
 * alone (that's what companyContextService.js already does).
 *
 * Deliberately bypasses llmService.js's generic 3-provider failover chain:
 * web search is not a capability Gemini/Claude/OpenAI share equally today
 * (see enterpriseBlueprintService.js for the full rationale). Claude only,
 * with the @anthropic-ai/sdk web_search_20250305 tool. Any failure — missing
 * key, rate limit, malformed output — resolves to null; callers must treat
 * that as "no draft available" and degrade gracefully, never throw upstream.
 *
 * ANTI-HALLUCINATION CONTRACT: a wrong specific fact about someone's own
 * company, shown to their own CTO, is worse than no draft at all. The system
 * prompt forbids inventing specifics search didn't surface, and every
 * section is required to self-report confidence so callers can visually
 * flag thin findings rather than presenting them as verified.
 */

import Anthropic from '@anthropic-ai/sdk';

const RESEARCH_MODEL     = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const RESEARCH_MAX_TOKENS = 4000;
const WEB_SEARCH_MAX_USES = 5;

function buildSystemPrompt() {
  return `You are a research analyst preparing grounding material for an AI transformation strategy document. You have a web_search tool — use it to find real, current, public information about the company named in the user message.

TASK: For each section listed in the user message, write 2-4 sentences of draft content for an internal AI strategy document, grounded in what you actually find via search.

STRICT RULES:
- Only state a specific fact (product name, team size, technology, recent initiative, market position) if your search results actually surfaced it. Do not invent, estimate, or infer specifics that were not found.
- If search returns little or nothing usable for a section, write industry-general content appropriate to the company's sector instead — and set that section's "confidence" to "low". Do not pad a low-confidence section with invented specifics to make it look researched.
- Set "confidence" to "high" only when the section's content is grounded in a specific fact your search actually returned.
- Never mention that you are an AI, never mention "search results" or "I found" in the output text itself — write it as clean document prose, not as a research summary.
- Do not write generic filler that could apply to any company in any industry ("adopts AI to improve outcomes" is not acceptable).

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    { "title": "<exact section title from the input>", "content": "<2-4 sentences>", "confidence": "high" | "low" }
  ]
}`;
}

function buildUserMessage({ orgName, industry, sections }) {
  const sectionList = sections
    .map((s, i) => `${i + 1}. ${s.title}${s.definition ? `\n   About this section: ${s.definition}` : ''}`)
    .join('\n');

  return `Company: ${orgName}
Industry: ${industry}

Research this company and draft content for EXACTLY these ${sections.length} sections:

${sectionList}

Respond with the JSON object described in the system prompt, one entry per section listed above.`;
}

function extractText(content) {
  return (content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

function parseSections(rawText, validTitles) {
  // Strip accidental markdown fences before parsing.
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed  = JSON.parse(cleaned);
  const raw     = Array.isArray(parsed?.sections) ? parsed.sections : [];

  return raw
    .filter(s => s && validTitles.has(s.title) && String(s.content || '').trim())
    .map(s => ({
      title:      s.title,
      content:    String(s.content).trim(),
      confidence: s.confidence === 'high' ? 'high' : 'low',
    }));
}

/**
 * Researches a company via web search and drafts content for the given
 * sections. Returns { sections: [{ title, content, confidence }] } or null
 * if research is unavailable/failed — callers must treat null as "no draft,"
 * not as an error to surface.
 *
 * @param {{ orgName: string, industry: string, sections: { title: string, definition?: string }[] }} params
 */
export async function researchCompanyForBlueprint({ orgName, industry, sections }) {
  if (!orgName || !Array.isArray(sections) || sections.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyResearch] Skipped — ANTHROPIC_API_KEY not configured.');
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const resp   = await client.messages.create({
      model:      RESEARCH_MODEL,
      max_tokens: RESEARCH_MAX_TOKENS,
      system:     buildSystemPrompt(),
      messages:   [{ role: 'user', content: buildUserMessage({ orgName, industry, sections }) }],
      tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }],
    });

    const text = extractText(resp.content);
    if (!text) {
      console.warn(`[CompanyResearch] Empty response for org "${orgName}".`);
      return null;
    }

    const validTitles = new Set(sections.map(s => s.title));
    const parsedSections = parseSections(text, validTitles);
    if (parsedSections.length === 0) return null;

    return { sections: parsedSections };
  } catch (err) {
    console.error(`[CompanyResearch] Failed for org "${orgName}" (non-fatal):`, err.message);
    return null;
  }
}

// ── Industry vertical research ──────────────────────────────────────────────
// Same mechanism as researchCompanyForBlueprint, but describes GENERAL
// practices/terminology typical of a sub-vertical (e.g. "Autonomous Fleet
// Operations" within "Automotive") — never a specific company. Used to draft
// IndustryVerticalKnowledge entries.

function buildVerticalSystemPrompt() {
  return `You are a research analyst preparing reference material for an internal AI strategy knowledge base. You have a web_search tool — use it to find real, current information about common practices, terminology, and operating patterns in the industry sub-vertical named in the user message.

TASK: For each section listed in the user message, write 2-4 sentences of GENERAL reference content typical of companies in this sub-vertical — not about any single company.

STRICT RULES:
- Describe patterns, terminology, and practices that are genuinely characteristic of this sub-vertical as distinct from its broader parent industry (e.g. what makes "Autonomous Fleet Operations" different from traditional automotive OEM/supplier concerns).
- Only state a specific practice, technology, or terminology if your search results actually surfaced it as characteristic of this vertical. Do not invent specifics.
- Never describe or reference any single named company — this is general vertical reference material, not company research.
- If search returns little or nothing specific to this vertical, write reference content at the level of what's genuinely known about the vertical's general characteristics — and set that section's "confidence" to "low".
- Set "confidence" to "high" only when the section's content is grounded in something your search actually returned.
- Do not write generic filler that could apply to any industry ("uses technology to improve outcomes" is not acceptable).

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    { "title": "<exact section title from the input>", "content": "<2-4 sentences>", "confidence": "high" | "low" }
  ]
}`;
}

function buildVerticalUserMessage({ parentIndustry, subVertical, sections }) {
  const sectionList = sections
    .map((s, i) => `${i + 1}. ${s.title}${s.definition ? `\n   About this section: ${s.definition}` : ''}`)
    .join('\n');

  return `Industry sub-vertical: ${subVertical}
Parent industry: ${parentIndustry}

Research this sub-vertical and draft general reference content for EXACTLY these ${sections.length} sections:

${sectionList}

Respond with the JSON object described in the system prompt, one entry per section listed above.`;
}

/**
 * Researches an industry sub-vertical via web search and drafts general
 * reference content for the given sections. Returns { sections: [{ title,
 * content, confidence }] } or null if research is unavailable/failed —
 * callers must treat null as "no draft available," not as an error.
 *
 * @param {{ parentIndustry: string, subVertical: string, sections: { title: string, definition?: string }[] }} params
 */
export async function researchIndustryVertical({ parentIndustry, subVertical, sections }) {
  if (!subVertical || !Array.isArray(sections) || sections.length === 0) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyResearch] Vertical research skipped — ANTHROPIC_API_KEY not configured.');
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const resp   = await client.messages.create({
      model:      RESEARCH_MODEL,
      max_tokens: RESEARCH_MAX_TOKENS,
      system:     buildVerticalSystemPrompt(),
      messages:   [{ role: 'user', content: buildVerticalUserMessage({ parentIndustry, subVertical, sections }) }],
      tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }],
    });

    const text = extractText(resp.content);
    if (!text) {
      console.warn(`[CompanyResearch] Empty vertical-research response for "${subVertical}".`);
      return null;
    }

    const validTitles = new Set(sections.map(s => s.title));
    const parsedSections = parseSections(text, validTitles);
    if (parsedSections.length === 0) return null;

    return { sections: parsedSections };
  } catch (err) {
    console.error(`[CompanyResearch] Vertical research failed for "${subVertical}" (non-fatal):`, err.message);
    return null;
  }
}
