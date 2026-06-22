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
// SoorgaAI Execution Strategy Co-Pilot prompt.
// Generates execution-ready future-state strategies — not assessments or gap analyses.
// Each section produces 4 typed brief fields + leadership validation status.

function buildGenerationPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint }) {
  const sectionList = parsedSections.map((s, i) =>
    `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`
  ).join('\n\n');

  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const systemPrompt = `You are SoorgaAI, an enterprise Strategy Co-Pilot for CTO-level decision making.

Your job is to generate execution-ready future-state strategies for enterprise capabilities.

You are NOT a consultant. You are NOT an auditor. You are a strategy execution generator.

COMPANY CONTEXT:
- Organisation: ${companyName}
- Industry: ${industry}
- Executive Role: ${role}
- Business Objective: ${businessObjective}
${contextDoc ? `\nCOMPANY PROFILE:\n${contextDoc}` : ''}

TASK:
For EXACTLY these ${parsedSections.length} sections of the "${capabilityName}" capability — ${sectionTitles} — generate an execution-ready Strategy Brief.

Each section must have exactly 4 fields:

1. strategicPosition (1–2 sentences MAXIMUM)
   Define the IDEAL FUTURE-STATE — what success looks like when this capability is fully executing.
   Must be outcome-oriented and concrete. Must describe the target operating model.
   Do NOT describe current problems or gaps.

2. priorityActions (3 to 5 items)
   Executable actions for the next 90 days only.
   Must use strong verbs: Define, Deploy, Integrate, Implement, Establish, Launch, Assign.
   Must directly impact delivery or capability execution.
   Do NOT use: improve, enhance, explore, consider, leverage.

3. successMetrics (2 to 4 items)
   Measurable KPIs only. Must be quantifiable (%, time, cost, adoption rate, defect rate).
   Must clearly state direction: increase / decrease / target value.
   Must reflect real execution outcomes.
   Do NOT use vague metrics like "improve quality" or "increase efficiency."

4. leadershipValidation
   An object with two fields:
   - status: always set to "Not Yet Validated" for AI-generated blueprints
   - context: one sentence describing what executive alignment or approval is needed for this section
     (e.g. "Requires CTO sign-off on AI investment allocation for ${industry} program")

HARD RULES:
- Do NOT include a Key Risk section
- Do NOT write essays or paragraphs
- Do NOT describe problems or gaps
- Do NOT exceed bullet limits
- Do NOT add, rename, or remove sections — generate ONLY the ${parsedSections.length} sections listed
- Every output must be scannable in under 30 seconds

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title>",
      "brief": {
        "strategicPosition": "<1-2 sentence future-state definition>",
        "priorityActions": ["<action 1>", "<action 2>", "<action 3>"],
        "successMetrics": ["<KPI 1>", "<KPI 2>", "<KPI 3>"],
        "leadershipValidation": {
          "status": "Not Yet Validated",
          "context": "<one sentence on what alignment or approval is needed>"
        }
      }
    }
  ]
}`;

  const userMessage = `CAPABILITY SECTIONS TO GENERATE (${parsedSections.length} sections):

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
BUSINESS OBJECTIVE: ${businessObjective}

Generate the execution-ready Strategy Brief JSON for all ${parsedSections.length} sections: ${sectionTitles}.`;

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

  // Scale timeout with section count: 60 s per section, minimum 2 minutes.
  // AI Governance has 5 sections and needs ~4 minutes; others average 3 sections.
  const LLM_TIMEOUT_MS = Math.max(120_000, parsedSections.length * 60_000);
  const { text } = await Promise.race([
    generate({ systemPrompt, userMessage, maxTokens: 4000 }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`LLM timeout after ${LLM_TIMEOUT_MS / 1000}s for capability: ${cap.name}`)), LLM_TIMEOUT_MS)
    ),
  ]);

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
      const b  = s.brief || {};
      const lv = b.leadershipValidation || {};
      return {
        title: String(s.title || '').trim(),
        brief: {
          strategicPosition:    String(b.strategicPosition || '').trim(),
          priorityActions:      Array.isArray(b.priorityActions) ? b.priorityActions.map(String) : [],
          successMetrics:       Array.isArray(b.successMetrics)  ? b.successMetrics.map(String)  : [],
          leadershipValidation: {
            status:  ['Approved', 'In Review', 'Not Yet Validated'].includes(lv.status)
                       ? lv.status
                       : 'Not Yet Validated',
            context: String(lv.context || '').trim(),
          },
        },
        content:   '',
        updatedAt: new Date(),
      };
    })
    .filter(s => s.title && validTitles.has(s.title.toLowerCase()));
}

// ── Single-capability regeneration (fire-and-forget) ─────────────────────────

export async function regenerateCapabilityAsync(blueprintId, capabilityId, userId, businessObjective) {
  const companyProfile = await loadCompanyProfile(userId);
  const industry       = companyProfile.industry || 'Automotive';
  const capabilities   = getCapabilities();
  const cap            = capabilities.find(c => c.id === capabilityId);

  if (!cap) throw new Error(`Capability not found: ${capabilityId}`);

  try {
    await CompanyBlueprint.updateOne(
      { _id: blueprintId, 'capabilities.capabilityId': capabilityId },
      { $set: { 'capabilities.$.status': 'in-progress', 'capabilities.$.errorMessage': '' } }
    );

    const sections = await generateCapabilitySections(cap, companyProfile, businessObjective, industry);

    await CompanyBlueprint.updateOne(
      { _id: blueprintId, 'capabilities.capabilityId': capabilityId },
      {
        $set: {
          'capabilities.$.status':      'completed',
          'capabilities.$.sections':    sections,
          'capabilities.$.completedAt': new Date(),
        },
      }
    );

    console.log(`[blueprintGen] ✓ Regenerated ${cap.name} (${sections.length} sections)`);
  } catch (err) {
    console.error(`[blueprintGen] ✗ Regenerate ${cap.name}:`, err.message);
    await CompanyBlueprint.updateOne(
      { _id: blueprintId, 'capabilities.capabilityId': capabilityId },
      {
        $set: {
          'capabilities.$.status':       'error',
          'capabilities.$.errorMessage': err.message,
        },
      }
    );
  }
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
