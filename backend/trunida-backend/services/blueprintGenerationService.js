/**
 * SoorgaAI — Blueprint Generation Service (PI 26.3 Sprint 1)
 *
 * Generates a Company AI Strategy Blueprint by running one LLM call per
 * capability. Reads Core + Automotive docs dynamically — no hardcoded structure.
 *
 * Called fire-and-forget from the controller; updates CompanyBlueprint in MongoDB
 * as each capability completes so the SSE stream can poll for live status.
 *
 * Context stack per capability (highest priority first):
 *   1. Business Objective
 *   2. Company Profile (orgName, role, industry)
 *   3. Company Context document (if generated)
 *   4. Core Capability document
 *   5. Automotive Blueprint document
 */

import CompanyBlueprint  from '../models/CompanyBlueprint.js';
import CompanyContext     from '../models/CompanyContext.js';
import UserProfile        from '../models/UserProfile.js';
import { generate }       from './llmService.js';
import {
  getCapabilities,
  getCapabilityBlueprint,
} from './strategyCanvasService.js';

// ── Company profile helpers ───────────────────────────────────────────────────

async function loadCompanyProfile(userId) {
  try {
    const [profile, ctx] = await Promise.all([
      UserProfile.findOne({ userId }).lean(),
      CompanyContext.findOne({ userId }).lean(),
    ]);

    return {
      companyName:  profile?.orgName        || 'Your Organisation',
      role:         profile?.role           || 'Executive',
      industry:     profile?.industryDomain || 'Automotive',
      contextDoc:   ctx?.content            || '',
    };
  } catch {
    return { companyName: 'Your Organisation', role: 'Executive', industry: 'Automotive', contextDoc: '' };
  }
}

// ── LLM prompt builder ────────────────────────────────────────────────────────
// Uses pre-parsed pillar sections (title + definition + keyPrinciples) so the
// LLM receives an explicit, numbered list of sections to generate — never the
// raw markdown which contains non-pillar headings (Purpose, Core Principles, etc.)

function buildGenerationPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint }) {
  // Build a clean section reference block from the parsed pillars only
  const sectionList = parsedSections.map((s, i) =>
    `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`
  ).join('\n\n');

  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const systemPrompt = `You are a senior AI Strategy Consultant generating a Company AI Blueprint for ${companyName}.

COMPANY CONTEXT:
- Organisation: ${companyName}
- Industry: ${industry}
- Executive Role: ${role}
- Business Objective: ${businessObjective}
${contextDoc ? `\nCOMPANY PROFILE:\n${contextDoc}` : ''}

TASK:
Generate company-specific content for EXACTLY these ${parsedSections.length} sections of the "${capabilityName}" capability:
${sectionTitles}

Do NOT add, rename, or remove any sections. Generate ONLY the sections listed above.

For each section, write 200–300 words of executive-quality, company-specific strategic content that is:
- Tailored to ${companyName}'s business objective
- Grounded in ${industry} industry context
- Actionable and measurable
- Written in executive consulting prose (no jargon)

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title from the list above>",
      "content": "<200-300 words of company-specific strategic content>"
    }
  ]
}`;

  const userMessage = `CAPABILITY SECTIONS TO GENERATE (${parsedSections.length} sections):

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
BUSINESS OBJECTIVE: ${businessObjective}

Generate the Company Blueprint JSON. Include exactly ${parsedSections.length} sections: ${sectionTitles}.`;

  return { systemPrompt, userMessage };
}

// ── Single capability generation ──────────────────────────────────────────────

async function generateCapabilitySections(cap, companyProfile, businessObjective, industry) {
  // Use getCapabilityBlueprint which already runs parsePillarSections —
  // this gives only the numbered pillar sections, filtering out non-pillar
  // headings like "Purpose", "Core Principles", "CTO Perspective", etc.
  const blueprint = getCapabilityBlueprint(cap.id, industry);
  const parsedSections = blueprint.sections || [];

  if (!parsedSections.length) {
    console.warn(`[blueprintGen] No pillar sections found for capability: ${cap.id}`);
    return [];
  }

  const { systemPrompt, userMessage } = buildGenerationPrompt({
    companyName:       companyProfile.companyName,
    industry,
    role:              companyProfile.role,
    businessObjective,
    contextDoc:        companyProfile.contextDoc,
    capabilityName:    cap.name,
    parsedSections,
    automotiveBlueprint: blueprint.automotiveBlueprint || '',
  });

  const { text } = await generate({ systemPrompt, userMessage, maxTokens: 4000 });

  // Extract JSON from response (model may wrap in code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[blueprintGen] No JSON found in response for ${cap.id}`);
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const sections = parsed?.sections || [];

  // Only keep sections whose title matches one of the parsed pillars
  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));

  return sections
    .map(s => ({
      title:     String(s.title   || '').trim(),
      content:   String(s.content || '').trim(),
      updatedAt: new Date(),
    }))
    .filter(s => s.title && validTitles.has(s.title.toLowerCase()));
}

// ── Main generation orchestrator (fire-and-forget) ────────────────────────────

export async function generateBlueprintAsync(blueprintId, userId, businessObjective) {
  const companyProfile = await loadCompanyProfile(userId);
  const industry       = companyProfile.industry || 'Automotive';
  const capabilities   = getCapabilities();

  for (const cap of capabilities) {
    try {
      // Mark in-progress
      await CompanyBlueprint.updateOne(
        { _id: blueprintId, 'capabilities.capabilityId': cap.id },
        { $set: { 'capabilities.$.status': 'in-progress' } }
      );

      const sections = await generateCapabilitySections(cap, companyProfile, businessObjective, industry);

      // Mark completed with generated sections
      await CompanyBlueprint.updateOne(
        { _id: blueprintId, 'capabilities.capabilityId': cap.id },
        {
          $set: {
            'capabilities.$.status':      'completed',
            'capabilities.$.sections':    sections,
            'capabilities.$.completedAt': new Date(),
          },
        }
      );

      console.log(`[blueprintGen] ✓ ${cap.name} (${sections.length} sections)`);
    } catch (err) {
      console.error(`[blueprintGen] ✗ ${cap.name}:`, err.message);
      await CompanyBlueprint.updateOne(
        { _id: blueprintId, 'capabilities.capabilityId': cap.id },
        {
          $set: {
            'capabilities.$.status':       'error',
            'capabilities.$.errorMessage': err.message,
          },
        }
      );
    }
  }

  // Mark the whole blueprint complete once all capabilities processed
  await CompanyBlueprint.updateOne(
    { _id: blueprintId },
    { $set: { status: 'completed', updatedAt: new Date() } }
  );

  console.log(`[blueprintGen] Blueprint ${blueprintId} generation complete`);
}
