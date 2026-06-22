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
  readCapabilityContent,
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

function buildGenerationPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, coreContent, industryContent }) {
  const systemPrompt = `You are a senior AI Strategy Consultant generating a Company AI Blueprint for ${companyName}.

COMPANY CONTEXT:
- Organisation: ${companyName}
- Industry: ${industry}
- Executive Role: ${role}
- Business Objective: ${businessObjective}
${contextDoc ? `\nCOMPANY PROFILE:\n${contextDoc}` : ''}

TASK:
Generate company-specific AI strategy blueprint content for the "${capabilityName}" capability.

For EACH section defined in the Core document below, produce 200–300 words of executive-quality,
company-specific strategic content. Content must be:
- Tailored to ${companyName}'s business objective
- Grounded in ${industry} industry context
- Actionable and measurable
- Written in executive consulting prose (no jargon)
- Referencing specific ${industry} examples where applicable

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown, no explanation:
{
  "sections": [
    {
      "title": "<exact section title from Core document>",
      "content": "<200-300 words of company-specific strategic content>"
    }
  ]
}

Include ALL sections found in the Core document.`;

  const userMessage = `CORE CAPABILITY DOCUMENT — "${capabilityName}":
${coreContent}

${industryContent ? `AUTOMOTIVE INDUSTRY BLUEPRINT:\n${industryContent}\n` : ''}
BUSINESS OBJECTIVE: ${businessObjective}

Generate the full Company Blueprint JSON for the "${capabilityName}" capability.`;

  return { systemPrompt, userMessage };
}

// ── Single capability generation ──────────────────────────────────────────────

async function generateCapabilitySections(cap, companyProfile, businessObjective, industry) {
  const { coreContent, industryContent } = readCapabilityContent(cap.id, industry);

  if (!coreContent) {
    console.warn(`[blueprintGen] No core content for capability: ${cap.id}`);
    return [];
  }

  const { systemPrompt, userMessage } = buildGenerationPrompt({
    companyName:      companyProfile.companyName,
    industry,
    role:             companyProfile.role,
    businessObjective,
    contextDoc:       companyProfile.contextDoc,
    capabilityName:   cap.name,
    coreContent,
    industryContent,
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

  return sections.map(s => ({
    title:     String(s.title   || '').trim(),
    content:   String(s.content || '').trim(),
    updatedAt: new Date(),
  })).filter(s => s.title);
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
