/**
 * SoorgaAI — Blueprint Generation Service (PI 26.3 Sprint 1)
 *
 * Supports three generation pipelines controlled by blueprintConfig.js:
 *
 *   Essay pipeline  (generate.essay = true)
 *     LLM call 1 → section.content  (long-form prose per section)
 *     LLM call 2 → section.brief    (structured extraction from essay)
 *
 *   Brief pipeline  (generate.essay = false)  ← active
 *     LLM call 1 → section.brief    (direct structured generation)
 *
 *   CTO extras      (generate.ctoExtras = true)  ← active
 *     Injected into whichever brief call runs above
 *     Adds template-specific fields e.g. strategicPillars for Vision sections
 *
 * Called fire-and-forget from the controller; updates CompanyBlueprint in
 * MongoDB as each capability completes so the SSE stream can poll live status.
 */

import CompanyBlueprint  from '../models/CompanyBlueprint.js';
import CompanyContext     from '../models/CompanyContext.js';
import UserProfile        from '../models/UserProfile.js';
import { generate }       from './llmService.js';
import {
  getCapabilities,
  getCapabilityBlueprint,
} from './strategyCanvasService.js';
import { BLUEPRINT_CONFIG } from '../config/blueprintConfig.js';

// ── Company profile helpers ───────────────────────────────────────────────────

async function loadCompanyProfile(userId) {
  try {
    const [profile, ctx] = await Promise.all([
      UserProfile.findOne({ userId }).lean(),
      CompanyContext.findOne({ userId }).lean(),
    ]);
    return {
      companyName: profile?.orgName        || 'Your Organisation',
      role:        profile?.role           || 'Executive',
      industry:    profile?.industryDomain || 'Automotive',
      contextDoc:  ctx?.content            || '',
    };
  } catch {
    return { companyName: 'Your Organisation', role: 'Executive', industry: 'Automotive', contextDoc: '' };
  }
}

// ── Section template config ───────────────────────────────────────────────────
// Declares which section titles get extra LLM-generated fields (CTO view).
// Add a new entry here when a new slide template needs section-specific data.
// Only injected when BLUEPRINT_CONFIG.generate.ctoExtras = true.

const SECTION_TEMPLATES = {
  Vision: {
    promptInstruction: `
SECTION-SPECIFIC EXTRAS — "Vision" sections only:

5. strategicPillars (exactly 3 items)
   Extract 3 distinct strategic themes from the strategicPosition as named pillars.
   Each item: { "title": "<2–4 word noun phrase>", "description": "<1 outcome sentence>", "businessImpactTag": "<1–3 word impact label>" }
   Example tags: "Engineering Velocity", "Release Predictability", "Cost Reduction"

6. kpiHighlights (exactly 3 items)
   Extract 3 hero success metrics to display as large-number KPI cards.
   Each item: { "value": "<number with unit e.g. 75%, 4+, 2×, 18mo>", "label": "<2–4 word metric name>", "description": "<1 short sentence, ≤8 words>" }
   Values must be specific and quantified. Labels must be scannable in 1 second.
   Example: { "value": "75%", "label": "Automation Coverage", "description": "AI tools across the SDLC." }

7. timelineSteps (exactly 4 items)
   Condense the 4 most critical priority actions into short 3–5 word action labels for a horizontal timeline.
   Each item is a plain string. Must be directive and scannable.
   Example: ["Define 3-Year AI Vision", "Establish Measurable Outcomes", "Deploy AI Council", "Assign Accountable Owners"]

   Add all three to the brief object for Vision sections:
   "strategicPillars": [...],
   "kpiHighlights": [...],
   "timelineSteps": [...]`,
  },
};

// ── Shared output parser ──────────────────────────────────────────────────────
// Normalises and validates the brief JSON returned by any LLM call.

function parseBriefOutput(rawSections, validTitles) {
  return rawSections
    .map(s => {
      const b  = s.brief || {};
      const lv = b.leadershipValidation || {};

      const rawPillars = Array.isArray(b.strategicPillars) ? b.strategicPillars : [];
      const strategicPillars = rawPillars
        .filter(p => p && typeof p === 'object' && String(p.title || '').trim())
        .map(p => ({
          title:             String(p.title             || '').trim(),
          description:       String(p.description       || '').trim(),
          businessImpactTag: String(p.businessImpactTag || '').trim(),
        }))
        .slice(0, 3);

      const rawKpi = Array.isArray(b.kpiHighlights) ? b.kpiHighlights : [];
      const kpiHighlights = rawKpi
        .filter(k => k && typeof k === 'object' && String(k.value || '').trim())
        .map(k => ({
          value:       String(k.value       || '').trim(),
          label:       String(k.label       || '').trim(),
          description: String(k.description || '').trim(),
        }))
        .slice(0, 3);

      const timelineSteps = Array.isArray(b.timelineSteps)
        ? b.timelineSteps.map(String).filter(Boolean).slice(0, 4)
        : [];

      return {
        title: String(s.title || '').trim(),
        brief: {
          strategicPosition:    String(b.strategicPosition || '').trim(),
          priorityActions:      Array.isArray(b.priorityActions) ? b.priorityActions.map(String) : [],
          successMetrics:       Array.isArray(b.successMetrics)  ? b.successMetrics.map(String)  : [],
          leadershipValidation: {
            status:  ['Approved', 'In Review', 'Not Yet Validated'].includes(lv.status)
                       ? lv.status : 'Not Yet Validated',
            context: String(lv.context || '').trim(),
          },
          ...(strategicPillars.length ? { strategicPillars } : {}),
          ...(kpiHighlights.length    ? { kpiHighlights }    : {}),
          ...(timelineSteps.length    ? { timelineSteps }    : {}),
        },
        content:   s.content ? String(s.content).trim() : '',
        updatedAt: new Date(),
      };
    })
    .filter(s => s.title && validTitles.has(s.title.toLowerCase()));
}

// ── LLM call helper ───────────────────────────────────────────────────────────

async function callLLM(systemPrompt, userMessage, timeoutMs, capName) {
  const { text } = await Promise.race([
    generate({ systemPrompt, userMessage, maxTokens: 4000 }),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`LLM timeout after ${timeoutMs / 1000}s for: ${capName}`)),
        timeoutMs
      )
    ),
  ]);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in LLM response for: ${capName}`);
  return JSON.parse(match[0]);
}

// ── Pipeline A: Brief (direct) ────────────────────────────────────────────────
// Active when BLUEPRINT_CONFIG.generate.essay = false.
// Generates section.brief in a single LLM call per capability.
// CTO extras (strategicPillars etc.) are injected into this call when enabled.

function buildBriefPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint }) {
  const sectionList   = parsedSections.map((s, i) =>
    `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`
  ).join('\n\n');
  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const templateInstructions = BLUEPRINT_CONFIG.generate.ctoExtras
    ? parsedSections
        .filter(s => SECTION_TEMPLATES[s.title])
        .map(s => SECTION_TEMPLATES[s.title].promptInstruction)
        .join('\n')
    : '';

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

Each section must have 4 required fields:

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
   - context: one sentence describing what executive alignment or approval is needed
     (e.g. "Requires CTO sign-off on AI investment allocation for ${industry} program")
${templateInstructions}

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

Generate the Strategy Brief JSON for all ${parsedSections.length} sections: ${sectionTitles}.`;

  return { systemPrompt, userMessage };
}

async function runBriefGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint) {
  const { systemPrompt, userMessage } = buildBriefPrompt({
    companyName:         companyProfile.companyName,
    industry,
    role:                companyProfile.role,
    businessObjective,
    contextDoc:          companyProfile.contextDoc,
    capabilityName:      cap.name,
    parsedSections,
    automotiveBlueprint: automotiveBlueprint || '',
  });

  const timeoutMs = Math.max(120_000, parsedSections.length * 60_000);
  const parsed    = await callLLM(systemPrompt, userMessage, timeoutMs, cap.name);
  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));
  return parseBriefOutput(parsed?.sections || [], validTitles);
}

// ── Pipeline B: Essay → Brief (cascade) ──────────────────────────────────────
// Active when BLUEPRINT_CONFIG.generate.essay = true.
// Step 1 generates long-form prose (section.content).
// Step 2 extracts the structured brief from that prose.
// CTO extras are injected into Step 2 when enabled.

function buildEssayPrompt({ companyName, industry, role, businessObjective, contextDoc, capabilityName, parsedSections, automotiveBlueprint }) {
  const sectionList   = parsedSections.map((s, i) =>
    `${i + 1}. ${s.title}\n   Definition: ${s.definition}\n   Key Principles: ${s.keyPrinciples.join('; ')}`
  ).join('\n\n');
  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const systemPrompt = `You are SoorgaAI, a senior enterprise AI strategy advisor writing for a CTO audience.

Generate a deep, future-state strategic analysis for each capability section.
Each analysis must be 500–700 words. Write in executive prose — no bullet points, no headers within the essay.
Ground every claim in the ${industry} engineering context and the company's business objective.
Focus exclusively on what success looks like and how to get there — not current problems or gaps.

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title>",
      "content": "<500-700 word strategic analysis>"
    }
  ]
}`;

  const userMessage = `COMPANY CONTEXT:
- Organisation: ${companyName}
- Industry: ${industry}
- Executive Role: ${role}
- Business Objective: ${businessObjective}
${contextDoc ? `\nCOMPANY PROFILE:\n${contextDoc}` : ''}

CAPABILITY: "${capabilityName}"
SECTIONS TO ANALYSE (${parsedSections.length}): ${sectionTitles}

${sectionList}

${automotiveBlueprint ? `AUTOMOTIVE INDUSTRY REFERENCE:\n${automotiveBlueprint}\n` : ''}
Generate a 500–700 word strategic analysis for each section.`;

  return { systemPrompt, userMessage };
}

function buildBriefExtractionPrompt({ capabilityName, parsedSections, essays }) {
  const sectionTitles = parsedSections.map(s => `"${s.title}"`).join(', ');

  const essayBlock = essays
    .map(e => `SECTION: ${e.title}\n\n${e.content}`)
    .join('\n\n---\n\n');

  const templateInstructions = BLUEPRINT_CONFIG.generate.ctoExtras
    ? parsedSections
        .filter(s => SECTION_TEMPLATES[s.title])
        .map(s => SECTION_TEMPLATES[s.title].promptInstruction)
        .join('\n')
    : '';

  const systemPrompt = `You are SoorgaAI. Extract a structured Strategy Brief from each strategic analysis below.

For each section produce exactly 4 fields:

1. strategicPosition — 1–2 sentences distilling the core future-state thesis from the essay
2. priorityActions   — 3–5 concrete 90-day actions extracted or inferred from the essay
                       Must use strong verbs: Define, Deploy, Integrate, Implement, Establish, Launch, Assign
3. successMetrics    — 2–4 quantifiable KPIs with direction (increase/decrease/target value)
4. leadershipValidation — { status: "Not Yet Validated", context: "<one sentence on exec approval needed>" }
${templateInstructions}

OUTPUT FORMAT — respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "sections": [
    {
      "title": "<exact section title>",
      "brief": {
        "strategicPosition": "...",
        "priorityActions": [...],
        "successMetrics": [...],
        "leadershipValidation": { "status": "Not Yet Validated", "context": "..." }
      }
    }
  ]
}`;

  const userMessage = `CAPABILITY: "${capabilityName}"
SECTIONS: ${sectionTitles}

STRATEGIC ANALYSES:

${essayBlock}

Extract the structured Strategy Brief for all ${parsedSections.length} sections.`;

  return { systemPrompt, userMessage };
}

async function runEssayGeneration(cap, companyProfile, businessObjective, industry, parsedSections, automotiveBlueprint) {
  const { systemPrompt, userMessage } = buildEssayPrompt({
    companyName:         companyProfile.companyName,
    industry,
    role:                companyProfile.role,
    businessObjective,
    contextDoc:          companyProfile.contextDoc,
    capabilityName:      cap.name,
    parsedSections,
    automotiveBlueprint: automotiveBlueprint || '',
  });

  // Essays are longer — allow 90 s per section
  const timeoutMs = Math.max(180_000, parsedSections.length * 90_000);
  const parsed    = await callLLM(systemPrompt, userMessage, timeoutMs, `${cap.name} [essay]`);
  return parsed?.sections || [];
}

async function runBriefExtraction(cap, parsedSections, essays) {
  const { systemPrompt, userMessage } = buildBriefExtractionPrompt({
    capabilityName: cap.name,
    parsedSections,
    essays,
  });

  const timeoutMs  = Math.max(120_000, parsedSections.length * 60_000);
  const parsed     = await callLLM(systemPrompt, userMessage, timeoutMs, `${cap.name} [extraction]`);
  const validTitles = new Set(parsedSections.map(s => s.title.toLowerCase()));

  // Merge essay content back into the extracted brief sections
  const essayMap = Object.fromEntries(essays.map(e => [e.title.toLowerCase(), e.content || '']));
  const sections = parseBriefOutput(parsed?.sections || [], validTitles);
  return sections.map(s => ({ ...s, content: essayMap[s.title.toLowerCase()] || '' }));
}

// ── Main per-capability generation ────────────────────────────────────────────
// Branches on BLUEPRINT_CONFIG.generate.essay to select the active pipeline.

async function generateCapabilitySections(cap, companyProfile, businessObjective, industry) {
  const blueprint     = getCapabilityBlueprint(cap.id, industry);
  const parsedSections = blueprint.sections || [];

  if (!parsedSections.length) {
    console.warn(`[blueprintGen] No pillar sections found for capability: ${cap.id}`);
    return [];
  }

  if (BLUEPRINT_CONFIG.generate.essay) {
    // Essay pipeline: long-form prose first, brief extracted from it
    console.log(`[blueprintGen] Essay pipeline active for: ${cap.name}`);
    const essays = await runEssayGeneration(cap, companyProfile, businessObjective, industry, parsedSections, blueprint.automotiveBlueprint);
    return await runBriefExtraction(cap, parsedSections, essays);
  }

  // Brief pipeline (default): direct structured generation
  return await runBriefGeneration(cap, companyProfile, businessObjective, industry, parsedSections, blueprint.automotiveBlueprint);
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
      await CompanyBlueprint.updateOne(
        { _id: blueprintId, 'capabilities.capabilityId': cap.id },
        { $set: { 'capabilities.$.status': 'in-progress' } }
      );

      const sections = await generateCapabilitySections(cap, companyProfile, businessObjective, industry);

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

  await CompanyBlueprint.updateOne(
    { _id: blueprintId },
    { $set: { status: 'completed', updatedAt: new Date() } }
  );

  console.log(`[blueprintGen] Blueprint ${blueprintId} generation complete`);
}
