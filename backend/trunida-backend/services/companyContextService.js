/**
 * SoorgaAI — Company Context Service (Sprint 23.1)
 *
 * Generates and persists a lightweight company profile that is injected
 * into every AI prompt as a retrieval source alongside Core Assets,
 * Automotive Assets, and Executive Memory.
 *
 * Company Context answers: "Who are we?"
 * Executive Memory answers: "What have we decided?"
 * Automotive Blueprint answers: "What does the industry recommend?"
 */

import { generate } from './llmService.js';
import CompanyContext from '../models/CompanyContext.js';
import UserProfile from '../models/UserProfile.js';
import CompanyWebsitePage from '../models/CompanyWebsitePage.js';

/** How much website text to put in front of the model. */
const SITE_CONTEXT_LIMIT = 12_000;

/**
 * The company's own words, from any website pages they have connected.
 *
 * Returns '' when nothing is connected, which is a meaningful answer — the
 * caller uses it to switch to a deliberately cautious prompt rather than
 * inventing specifics it cannot know.
 */
async function loadWebsiteContext(userId) {
  try {
    const docs = await CompanyWebsitePage
      .find({ userId }, { title: 1, rawText: 1, summary: 1 })
      .sort({ createdAt: 1 })
      .lean();
    if (!docs.length) return '';

    let out = '';
    for (const d of docs) {
      const body = (d.rawText || d.summary || '').trim();
      if (!body) continue;
      const block = `## ${d.title || 'Page'}\n${body}\n\n`;
      if (out.length + block.length > SITE_CONTEXT_LIMIT) {
        out += block.slice(0, Math.max(0, SITE_CONTEXT_LIMIT - out.length));
        break;
      }
      out += block;
    }
    return out.trim();
  } catch (err) {
    // Company context is still useful without it — degrade, do not fail.
    console.warn('[companyContext] could not load website context —', err.message);
    return '';
  }
}

function cleanMarkdown(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/```[\w]*\n?[\s\S]*?```/g, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*{3}([^*]+)\*{3}/g, '$1')
    .replace(/\*{2}([^*]+)\*{2}/g, '$1')
    .replace(/(?<![•\n])\*([^*\n]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\* /gm, '• ')
    .replace(/^- (?!-)/gm, '• ')
    .replace(/^[-*]{3,}\s*$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const DOMAIN_LABEL = {
  General:      'Automotive',
  Diagnostics:  'Automotive Diagnostics & Prognostics',
  Infotainment: 'Automotive Infotainment & Connected Vehicle',
  ADAS:         'Advanced Driver Assistance Systems (ADAS)',
  Automotive:   'Automotive',
};

/**
 * Generate a draft Company Context document using the user's org name and role.
 * This is a draft only — it is NOT saved until the user explicitly approves.
 */
export async function generateCompanyContextDraft(userId) {
  const profile  = await UserProfile.findOne({ userId }).lean();
  const orgName  = profile?.orgName        || 'your organisation';
  const role     = profile?.role           || 'executive';
  const domain   = profile?.industryDomain || 'Automotive';
  const domainLabel = DOMAIN_LABEL[domain] || 'Automotive';

  // What the company says about itself, if a website has been connected.
  // Without this the profile is invented from the company name alone, which
  // for any company the model has not heard of — every startup — produces a
  // plausible fabrication that then feeds blueprint generation, the advisor
  // and suggestions. Grounding in their own words is the difference between
  // a profile and a guess.
  const siteContext = await loadWebsiteContext(userId);

  const systemPrompt = siteContext
    ? 'You are a business intelligence analyst creating a company profile for an AI strategy advisor. ' +
      'Base every field ONLY on the company\'s own website content provided below. ' +
      'Where the website does not say, write "Not stated on their website" rather than inferring. ' +
      'Do not import assumptions from other industries. ' +
      'Output plain text only. No Markdown, bold markers, asterisks, hashes, or special formatting characters.'
    : 'You are a business intelligence analyst creating a company profile for an AI strategy advisor. ' +
      'You have only the organisation name and role — no verified information about this specific company. ' +
      'Keep every field cautious and clearly generic to the stated industry rather than inventing specifics ' +
      'such as named customers, products or metrics you cannot know. ' +
      'Output plain text only. No Markdown, bold markers, asterisks, hashes, or special formatting characters.';

  const userMessage =
    `Generate a Company Overview for the Svarg AI strategy advisor.\n\n` +
    `Organisation: ${orgName}\n` +
    `User Role: ${role}\n` +
    (siteContext
      ? `\nThe company's own website says:\n"""\n${siteContext}\n"""\n\n`
      : `Industry Domain: ${domainLabel}\n\n`) +
    `Output ONLY the structured plain text below. No preamble, no explanation, no Markdown symbols.\n\n` +
    `Company Overview\n\n` +
    `Company Name: ${orgName}\n` +
    // The industry is read from the company's own words when we have them.
    // Asking for "a sub-sector within Automotive" was fine when every
    // customer was automotive; on a generic platform it forces an education
    // company to be described as an automotive one.
    (siteContext
      ? `Industry: [the industry this company actually operates in, from their website]\n`
      : `Industry: [specific sub-sector within ${domainLabel}]\n`) +
    `User Role: ${role}\n` +
    `Business Model: [one-sentence description of how the company creates and delivers value]\n` +
    `Primary Customers: [who they serve, in their own terms]\n` +
    `Core Capabilities: [2–3 key technical or business capabilities, comma-separated]\n` +
    `Strategic Focus Areas: [2–3 current strategic priorities, comma-separated]\n` +
    `Known Industry Trends: [2–3 relevant trends affecting this company, comma-separated]\n` +
    `Potential AI Opportunities: [2–3 specific AI use cases relevant to this company, comma-separated]\n` +
    `Strategic Challenges: [2–3 real challenges for this type of organisation, comma-separated]\n` +
    `AI Transformation Opportunities: [2–3 actionable transformation areas aligned to their business, comma-separated]`;

  const { text } = await generate({ systemPrompt, userMessage, maxTokens: 900 });
  return { content: cleanMarkdown(text.trim()), orgName, role };
}

/**
 * Retrieve the approved Company Context for a user (null if none).
 */
export async function getCompanyContext(userId) {
  return CompanyContext.findOne({ userId }).lean();
}

/**
 * The best available evidence about who this company is, as plain text.
 *
 * Prefers the approved Company Context. Falls back to the raw website pages
 * when no context has been generated yet — which is a real and common state:
 * the website is captured at profile setup, but generating and approving the
 * context is a separate step a user may not have taken.
 *
 * Written because a caller that only read CompanyContext concluded it knew
 * nothing about a company whose website was sitting in the database one
 * collection away. Returns '' when there is genuinely nothing, and callers
 * must treat that as "unknown" rather than filling the gap with a guess.
 */
export async function getCompanyEvidence(userId) {
  try {
    const ctx = await CompanyContext.findOne({ userId }).lean();
    if (ctx?.content?.trim()) return ctx.content.trim();
    return await loadWebsiteContext(userId);
  } catch (err) {
    console.warn('[companyContext] could not load company evidence —', err.message);
    return '';
  }
}

/**
 * Save the approved Company Context to the database.
 * Upserts — one record per user.
 */
export async function saveCompanyContext(userId, content, orgName, role) {
  await CompanyContext.findOneAndUpdate(
    { userId },
    { content: content.trim(), orgName, role },
    { upsert: true, new: true }
  );
}

/**
 * Delete the user's Company Context so it can be regenerated.
 */
export async function clearCompanyContext(userId) {
  await CompanyContext.deleteOne({ userId });
}
