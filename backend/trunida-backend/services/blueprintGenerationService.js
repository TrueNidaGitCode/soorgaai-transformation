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
// Uses pre-parsed pillar sections so the LLM receives an explicit, numbered list
// of sections — never the raw markdown which contains non-pillar headings.
//
// Primary output format: Strategy Brief (Option 1)
//   Each section produces 4 structured fields a CTO can scan in 30 seconds:
//     strategicPosition — 2-3 sentence assessment of where the company stands
//     priorityActions   — exactly 3 specific 90-day actions (action-verb led)
//     successMetrics    — 2-3 measurable KPIs with targets where possible
//     keyRisk           — the single biggest risk if this is not addressed

function buildGenerationPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint }) {
  const sectionList = parsedSections.map((s, i) =>
    `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`
  ).join('\n\n');

  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const systemPrompt = `You are a senior AI Strategy Consultant compiling a CTO-level AI Strategy Blueprint for ${companyName}.

COMPANY CONTEXT:
- Organisation: ${companyName}
- Industry: ${industry}
- Executive Role: ${role}
- Business Objective: ${businessObjective}
${contextDoc ? `\nCOMPANY PROFILE:\n${contextDoc}` : ''}

TASK:
For EXACTLY these ${parsedSections.length} sections of the "${capabilityName}" capability — ${sectionTitles} — compile a Strategy Brief that a CTO can scan in 30 seconds.

Each section must have exactly 4 fields:

1. strategicPosition (2–3 sentences)
   A crisp assessment of where ${companyName} stands on this dimension today, anchored to the business objective. Be specific — name the gap or the advantage.

2. priorityActions (exactly 3 items)
   The 3 most important actions to take in the next 90 days. Each must start with a strong action verb (e.g. "Establish", "Define", "Launch", "Assign"). Be concrete, not generic.

3. successMetrics (2–3 items)
   Specific, measurable KPIs. Include a target or threshold where possible (e.g. "Reduce validation cycle time by 25% within 6 months"). Avoid vague metrics like "improve quality."

4. keyRisk (1 sentence)
   The single biggest organisational or business risk if this capability is neglected. Be direct.

Rules:
- Do NOT add, rename, or remove sections. Generate ONLY the ${parsedSections.length} sections listed.
- All content must be tailored to ${companyName}'s objective and the ${industry} industry context.
- No generic consulting filler. Every sentence must earn its place.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title>",
      "brief": {
        "strategicPosition": "<2-3 sentences>",
        "priorityActions": ["<action 1>", "<action 2>", "<action 3>"],
        "successMetrics": ["<metric 1>", "<metric 2>"],
        "keyRisk": "<1 sentence>"
      }
    }
  ]
}`;

  const userMessage = `SECTIONS TO COMPILE (${parsedSections.length} sections):

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
BUSINESS OBJECTIVE: ${businessObjective}

Compile the Strategy Brief JSON for all ${parsedSections.length} sections: ${sectionTitles}.`;

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

  // Only keep sections whose title matches a parsed pillar (safety net)
  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));

  return sections
    .map(s => {
      const b = s.brief || {};
      return {
        title: String(s.title || '').trim(),
        brief: {
          strategicPosition: String(b.strategicPosition || '').trim(),
          priorityActions:   Array.isArray(b.priorityActions) ? b.priorityActions.map(String) : [],
          successMetrics:    Array.isArray(b.successMetrics)  ? b.successMetrics.map(String)  : [],
          keyRisk:           String(b.keyRisk || '').trim(),
        },
        content:   '',
        updatedAt: new Date(),
      };
    })
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
