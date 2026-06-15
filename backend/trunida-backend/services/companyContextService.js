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

  const systemPrompt =
    'You are a business intelligence analyst creating a company profile for an executive AI strategy advisor. ' +
    'Generate realistic, concise content grounded in the company name, role, and automotive industry context. ' +
    'This profile personalises AI strategy guidance for senior executives — be specific, not generic. ' +
    'Output plain text only. Do not use Markdown, bold markers, asterisks, hashes, or any special formatting characters.';

  const userMessage =
    `Generate a Company Overview for the SoorgaAI executive AI strategy advisor.\n\n` +
    `Organisation: ${orgName}\n` +
    `User Role: ${role}\n` +
    `Industry Domain: ${domainLabel}\n\n` +
    `Output ONLY the structured plain text below. No preamble, no explanation, no Markdown symbols.\n\n` +
    `Company Overview\n\n` +
    `Company Name: ${orgName}\n` +
    `Industry: [specific sub-sector within ${domainLabel}]\n` +
    `User Role: ${role}\n` +
    `Business Model: [one-sentence description of how the company creates and delivers value]\n` +
    `Primary Customers: [who they serve — OEMs, Tier-1 suppliers, fleet operators, consumers, etc.]\n` +
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
