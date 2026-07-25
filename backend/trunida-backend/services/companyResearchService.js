/**
 * SoorgaAI — Company Research Service
 *
 * Runs a single OpenAI Responses API call with the web_search server tool to
 * research a company on the public internet and draft Enterprise Blueprint
 * section content from real findings — not model inference from the company
 * name alone (that's what companyContextService.js already does).
 *
 * Deliberately bypasses llmService.js's generic 3-provider failover chain:
 * web search is not a capability Gemini/Claude/OpenAI share equally today
 * (see enterpriseBlueprintService.js for the full rationale). OpenAI only,
 * via the Responses API's `web_search` tool (confirmed against the installed
 * openai@6.18.0 SDK types — Chat Completions, used elsewhere in this
 * codebase, doesn't support this tool). Any failure — missing key, no
 * credit, malformed output — resolves to null; callers must treat that as
 * "no draft available" and degrade gracefully, never throw upstream.
 *
 * ANTI-HALLUCINATION CONTRACT: a wrong specific fact about someone's own
 * company, shown to their own CTO, is worse than no draft at all. The system
 * prompt forbids inventing specifics search didn't surface, and every
 * section is required to self-report confidence so callers can visually
 * flag thin findings rather than presenting them as verified.
 */

import OpenAI from 'openai';

const RESEARCH_MODEL      = process.env.OPENAI_MODEL || 'gpt-4o';
const RESEARCH_MAX_TOKENS = 4000;

function buildSystemPrompt() {
  return `You are a research analyst preparing grounding material for an AI transformation strategy document. You have a web_search tool — use it to find real, current, public information about the company named in the user message.

TASK: For each section listed in the user message, write 2-4 sentences of draft content for an internal AI strategy document, grounded in what you actually find via search.

STRICT RULES:
- Only state a specific fact (product name, team size, technology, recent initiative, market position) if your search results actually surfaced it. Do not invent, estimate, or infer specifics that were not found.
- If search returns little or nothing usable for a section, write industry-general content appropriate to the company's sector instead — and set that section's "confidence" to "low". Do not pad a low-confidence section with invented specifics to make it look researched.
- Set "confidence" to "high" only when the section's content is grounded in a specific fact your search actually returned.
- Never mention that you are an AI, never mention "search results" or "I found" in the output text itself — write it as clean document prose, not as a research summary.
- Do not write generic filler that could apply to any company in any industry ("adopts AI to improve outcomes" is not acceptable).
- Do not include citations, source links, or markdown-formatted links (e.g. "([source.com](url))") anywhere in the content — write plain prose only, as it will be read directly, not as an annotated research memo.

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

// OpenAI's web_search tool has a strong default tendency to inject inline
// markdown citations (e.g. "($150K savings ([fluxauto.ai](url)))") into
// output_text even when instructed not to — the system-prompt rule above
// isn't reliably enough on its own, so this is a defensive backstop, not
// the only line of defense.
function stripCitations(text) {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '')  // remove [label](url)
    .replace(/\(\s*\)/g, '')                 // remove now-empty parens left behind
    .replace(/\s+([.,;:])/g, '$1')           // fix "word ." artifacts from removed links
    .replace(/\s{2,}/g, ' ')                 // collapse double spaces
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
      content:    stripCitations(String(s.content).trim()),
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyResearch] Skipped — OPENAI_API_KEY not configured.');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey });
    const resp   = await client.responses.create({
      model:             RESEARCH_MODEL,
      max_output_tokens: RESEARCH_MAX_TOKENS,
      instructions:      buildSystemPrompt(),
      input:             buildUserMessage({ orgName, industry, sections }),
      tools:             [{ type: 'web_search' }],
    });

    const text = (resp.output_text || '').trim();
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
- Do not include citations, source links, or markdown-formatted links (e.g. "([source.com](url))") anywhere in the content — write plain prose only, as it will be read directly, not as an annotated research memo.

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyResearch] Vertical research skipped — OPENAI_API_KEY not configured.');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey });
    const resp   = await client.responses.create({
      model:             RESEARCH_MODEL,
      max_output_tokens: RESEARCH_MAX_TOKENS,
      instructions:      buildVerticalSystemPrompt(),
      input:             buildVerticalUserMessage({ parentIndustry, subVertical, sections }),
      tools:             [{ type: 'web_search' }],
    });

    const text = (resp.output_text || '').trim();
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

// ── Company capability map research ─────────────────────────────────────────
// Distinct from section research above: identifies the company's key
// products/capabilities and maps each to the specific industry challenge(s)
// it addresses (e.g. "Labour shortage -> Autonomous industrial vehicles").
// Powers the AI Opportunity Discovery staged-reasoning pipeline in
// blueprintGenerationService.js — Stage 2 looks up the admin-approved result
// instead of re-inferring this connection from prose on every generation.

function buildCapabilityMapSystemPrompt() {
  return `You are a research analyst preparing grounding material for an AI transformation strategy document. You have a web_search tool — use it to find real, current, public information about the company named in the user message.

TASK: Identify the company's key products, platforms, or capabilities. For each one, name the specific industry challenge(s) it addresses and briefly explain the mechanism — how it actually addresses that challenge.

STRICT RULES:
- Only name a product/capability and challenge pairing if your search results actually surfaced evidence connecting them. Do not invent a plausible-sounding pairing.
- Each "industryChallenge" must be a real, recognized challenge in the company's industry — not invented or overly narrow.
- Each "companyCapability" must be an actual named product, platform, or service of this company — not a generic paraphrase like "AI technology."
- "mechanism" is 1 sentence: the concrete way the capability addresses the challenge (not a restatement of the challenge or capability name).
- Set "confidence" to "high" only when grounded in a specific fact your search actually returned; otherwise "low".
- Do not include citations, source links, or markdown-formatted links anywhere in the output — plain text only.
- Identify 3-8 pairings. A single capability may address more than one challenge (one row per pairing).

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "mappings": [
    { "industryChallenge": "<specific industry challenge>", "companyCapability": "<actual named product/platform>", "mechanism": "<1 sentence>", "confidence": "high" | "low" }
  ]
}`;
}

function buildCapabilityMapUserMessage({ orgName, industry, subVertical }) {
  return `Company: ${orgName}
Industry: ${industry}${subVertical ? `\nSub-vertical: ${subVertical}` : ''}

Research this company's products/capabilities and map each to the specific industry challenge(s) it addresses.

Respond with the JSON object described in the system prompt.`;
}

function parseCapabilityMap(rawText) {
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed  = JSON.parse(cleaned);
  const raw     = Array.isArray(parsed?.mappings) ? parsed.mappings : [];

  return raw
    .filter(m => m && String(m.industryChallenge || '').trim() && String(m.companyCapability || '').trim())
    .map(m => ({
      industryChallenge: stripCitations(String(m.industryChallenge).trim()),
      companyCapability: stripCitations(String(m.companyCapability).trim()),
      mechanism:         stripCitations(String(m.mechanism || '').trim()),
      confidence:         m.confidence === 'high' ? 'high' : 'low',
    }));
}

/**
 * Researches a company's products/capabilities and maps each to the
 * industry challenge(s) it addresses. Returns { mappings: [{
 * industryChallenge, companyCapability, mechanism, confidence }] } or null
 * if research is unavailable/failed — callers must treat null as "no draft
 * available," not as an error.
 *
 * @param {{ orgName: string, industry: string, subVertical?: string }} params
 */
export async function researchCapabilityMap({ orgName, industry, subVertical }) {
  if (!orgName) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyResearch] Capability map research skipped — OPENAI_API_KEY not configured.');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey });
    const resp   = await client.responses.create({
      model:             RESEARCH_MODEL,
      max_output_tokens: RESEARCH_MAX_TOKENS,
      instructions:      buildCapabilityMapSystemPrompt(),
      input:             buildCapabilityMapUserMessage({ orgName, industry, subVertical }),
      tools:             [{ type: 'web_search' }],
    });

    const text = (resp.output_text || '').trim();
    if (!text) {
      console.warn(`[CompanyResearch] Empty capability-map response for "${orgName}".`);
      return null;
    }

    const mappings = parseCapabilityMap(text);
    if (mappings.length === 0) return null;

    return { mappings };
  } catch (err) {
    console.error(`[CompanyResearch] Capability map research failed for "${orgName}" (non-fatal):`, err.message);
    return null;
  }
}

// ── Industry detection ──────────────────────────────────────────────────────
// Given just a company name, identifies its primary industry so the admin
// Company Research Library never needs a manual industry picker. Feeds
// industryCapabilityKnowledgeService.js's coverage check.

function buildIndustryDetectionSystemPrompt(knownIndustries) {
  const knownBlock = knownIndustries?.length
    ? `\n\nINDUSTRIES ALREADY IN THE KNOWLEDGE BASE — if this company's industry is the same real-world industry as one of these, you MUST return that EXACT label, verbatim (same wording, same singular/plural, same case) rather than inventing a new phrasing for the same thing:\n${knownIndustries.map(i => `- ${i}`).join('\n')}\n\nOnly return a label outside this list if the company's industry is genuinely different from all of them.`
    : '';

  return `You identify the primary industry of a company from its name, using web search to confirm.

TASK: Return the company's single primary industry as a short, canonical label — the kind of label used to organize a business/consulting knowledge base (e.g. "Automotive", "Semiconductor", "Aerospace", "Healthcare", "Retail", "Financial Services", "Logistics"). Prefer a well-established industry category over a narrow niche description.

STRICT RULES:
- If search does not clearly identify the company or its industry, set "confidence" to "low" and give your best single-word-or-two guess rather than leaving it blank.
- Set "confidence" to "high" only when search results clearly and specifically confirm the company and its industry.
- The label must be 1-3 words, title case, no punctuation, no explanation.${knownBlock}

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{ "industry": "<short canonical industry label>", "confidence": "high" | "low" }`;
}

/**
 * Detects a company's primary industry from its name via web search.
 * Returns { industry, confidence } or null if detection is unavailable/
 * failed — callers must treat null as "unknown, fall back to a default,"
 * never as an error to surface.
 *
 * `knownIndustries` (optional) — industries that already have KB coverage
 * (from industryCapabilityKnowledgeService.js's listKnownIndustries) — shown
 * to the model so it reuses an existing label instead of inventing a
 * near-duplicate phrasing (e.g. "Semiconductor" vs "Semiconductors") that
 * would otherwise trigger a second, wasted full KB generation for what's
 * really the same industry. companyResearchLibraryService.js also runs the
 * result through resolveIndustry() as a deterministic backstop in case the
 * model still drifts despite being shown this list.
 *
 * @param {{ companyName: string, knownIndustries?: string[] }} params
 */
export async function detectCompanyIndustry({ companyName, knownIndustries }) {
  if (!companyName) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyResearch] Industry detection skipped — OPENAI_API_KEY not configured.');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey });
    const resp   = await client.responses.create({
      model:             RESEARCH_MODEL,
      max_output_tokens: 300,
      instructions:      buildIndustryDetectionSystemPrompt(knownIndustries),
      input:             `Company: ${companyName}\n\nIdentify this company's primary industry.`,
      tools:             [{ type: 'web_search' }],
    }, { timeout: 60_000 });

    const text = (resp.output_text || '').trim();
    if (!text) return null;

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed  = JSON.parse(cleaned);
    const industry = String(parsed?.industry || '').trim();
    if (!industry) return null;

    return { industry, confidence: parsed.confidence === 'high' ? 'high' : 'low' };
  } catch (err) {
    console.error(`[CompanyResearch] Industry detection failed for "${companyName}" (non-fatal):`, err.message);
    return null;
  }
}

// ── Industry capability KB generation ───────────────────────────────────────
// Generates a full industry-overlay KB document for one capability — the
// same role Automotive_{Capability}.md files play today, but authored by the
// model (grounded via web search) instead of by hand, for an industry that
// has no coverage yet. Powers industryCapabilityKnowledgeService.js. Output
// is structured per-section JSON, not freeform markdown — deliberately, so
// assembly into the final .md file is deterministic (see that service for
// the fixed heading template each section title maps to).

export const INDUSTRY_KB_SECTION_TITLES = [
  'Purpose',
  'Business Context',
  'Business Challenges',
  'Workflows',
  'Common High-Effort Activities',
  'Typical Opportunities',
  'Principles',
  'Leadership Question',
];

function buildIndustryCapabilitySystemPrompt() {
  return `You are a management consultant authoring a knowledge-base reference document that teaches an AI system how to reason about one specific business capability within one specific industry. You have a web_search tool — use it to ground the content in real, current facts about the industry named in the user message.

This document extends a generic, industry-neutral "Core" definition of the capability (given to you in the user message) with everything that is specific to the named industry.

TASK: Write content for EXACTLY these 8 sections, in this order:
1. "Purpose" — 2-3 sentences on how this capability specifically applies within this industry, building on the Core definition given to you.
2. "Business Context" — what kinds of companies exist in this industry that this capability is relevant to. If the industry genuinely contains distinct company types relevant to this capability (e.g. companies serving end customers directly vs. companies whose main concern is their own internal operations/engineering), describe each as its own labeled sub-category. Do not force a split that doesn't genuinely apply — a single well-described context is fine if that's what's true.
3. "Business Challenges" — concrete, specific challenges in this industry that create the opportunity for this capability to add value. Where Business Context identified distinct company types or customer segments, organize challenges under those same labeled sub-categories so a reader can tell which challenges apply to which kind of company. Each challenge should be 3-8 words, specific to this industry — not generic filler.
4. "Workflows" — 2-4 example workflows (as short arrow-chains, e.g. "Step One → Step Two → Step Three") typical of this industry that provide context for this capability.
5. "Common High-Effort Activities" — the manual, time-consuming activities in this industry that this capability typically has to deal with or improve.
6. "Typical Opportunities" — the specific ways this capability is typically applied or realized in this industry, organized under the same sub-categories as Business Challenges if applicable.
7. "Principles" — 3-5 guidance rules for how recommendations under this capability should be generated for a company in this industry (e.g. what terminology to use, what to prioritize, how to tell which sub-category a given company falls into).
8. "Leadership Question" — one sentence a business leader in this industry would ask to prioritize action on this capability. If Business Context identified distinct sub-categories, phrase one variant per sub-category.

STRICT RULES:
- Ground specifics (terminology, named technologies, real challenges) in what your search actually surfaces about this industry. Do not invent implausible specifics, but reasonable, well-known industry knowledge does not require a citation to state.
- Do not write generic filler that could apply to any industry ("uses technology to improve outcomes" is not acceptable).
- Do not include citations, source links, or markdown-formatted links anywhere in the output — plain text only.
- Keep bullet-style lists as actual arrays of short strings, not a single paragraph.
- Set "confidence" to "high" only if your search results gave you real, specific grounding for this industry; otherwise "low".

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    { "title": "Purpose", "content": "<2-3 sentences>" },
    { "title": "Business Context", "content": "<prose, may include sub-category labels>" },
    { "title": "Business Challenges", "content": ["<challenge>", "..."] },
    { "title": "Workflows", "content": ["<Step → Step → Step>", "..."] },
    { "title": "Common High-Effort Activities", "content": ["<activity>", "..."] },
    { "title": "Typical Opportunities", "content": ["<opportunity>", "..."] },
    { "title": "Principles", "content": ["<principle>", "..."] },
    { "title": "Leadership Question", "content": "<question(s)>" }
  ],
  "confidence": "high" | "low"
}`;
}

function buildIndustryCapabilityUserMessage({ industry, capabilityName, domainName, objective, coreDefinition }) {
  return `Industry: ${industry}
Domain: ${domainName}
Capability: ${capabilityName}
Capability objective: ${objective || '(not specified)'}
${coreDefinition ? `\nCore (industry-neutral) definition of this capability, to extend:\n${coreDefinition}\n` : ''}
Write the industry-overlay knowledge base document for this capability in this industry, per the 8-section format described in the system prompt.`;
}

function renderSectionContent(content) {
  if (Array.isArray(content)) {
    return content.map(item => `- ${String(item).trim()}`).join('\n');
  }
  return String(content || '').trim();
}

function parseIndustryCapabilitySections(rawText) {
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed  = JSON.parse(cleaned);
  const raw     = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const validTitles = new Set(INDUSTRY_KB_SECTION_TITLES);

  const sections = raw
    .filter(s => s && validTitles.has(s.title) && s.content)
    .map(s => ({
      title:   s.title,
      content: stripCitations(renderSectionContent(s.content)),
    }))
    .filter(s => s.content);

  if (sections.length === 0) return null;
  return { sections, confidence: parsed.confidence === 'high' ? 'high' : 'low' };
}

/**
 * Generates a full industry-overlay KB document for one capability, grounded
 * via web search. Returns { sections: [{ title, content }], confidence } or
 * null if generation is unavailable/failed — callers must treat null as "no
 * draft available, mark this capability failed and continue," never as an
 * error to surface or retry synchronously.
 *
 * @param {{ industry: string, capabilityName: string, domainName: string, objective?: string, coreDefinition?: string }} params
 */
export async function researchIndustryCapability({ industry, capabilityName, domainName, objective, coreDefinition }) {
  if (!industry || !capabilityName) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyResearch] Industry capability generation skipped — OPENAI_API_KEY not configured.');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey });
    const resp   = await client.responses.create({
      model:             RESEARCH_MODEL,
      max_output_tokens: 7000,
      instructions:      buildIndustryCapabilitySystemPrompt(),
      input:             buildIndustryCapabilityUserMessage({ industry, capabilityName, domainName, objective, coreDefinition }),
      tools:             [{ type: 'web_search' }],
    }, { timeout: 120_000 });

    const text = (resp.output_text || '').trim();
    if (!text) {
      console.warn(`[CompanyResearch] Empty industry-capability response for "${industry}" / "${capabilityName}".`);
      return null;
    }

    return parseIndustryCapabilitySections(text);
  } catch (err) {
    console.error(`[CompanyResearch] Industry capability generation failed for "${industry}" / "${capabilityName}" (non-fatal):`, err.message);
    return null;
  }
}
