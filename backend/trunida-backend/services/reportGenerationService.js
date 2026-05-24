/**
 * SoorgaAI - AI Report Generation Service
 *
 * Uses Claude (claude-sonnet-4-6) to generate a structured AI Maturity Report
 * from a user's assessment scores.
 *
 * Report includes:
 *  - Executive summary
 *  - Key strengths (top 3)
 *  - Critical gaps (top 3)
 *  - Top 3 priorities
 *  - 90-day roadmap (concrete action items)
 *  - 12-month roadmap (strategic milestones)
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────
// BUILD PROMPT
// ─────────────────────────────────────────────────────────

function buildReportPrompt({ overallScore, maturityStage, domainScores, orgName, industry }) {
  const domainSummary = domainScores
    .map((d) => `  • ${d.domainName}: ${d.score}/100`)
    .join('\n');

  const sorted = [...domainScores].sort((a, b) => b.score - a.score);
  const topDomains    = sorted.slice(0, 3).map((d) => d.domainName).join(', ');
  const bottomDomains = sorted.slice(-3).map((d) => d.domainName).join(', ');

  return `You are SoorgaAI, an expert AI transformation advisor. Your role is to generate a precise, actionable AI Maturity Assessment Report for an organization.

ORGANIZATION CONTEXT:
- Name: ${orgName || 'the organization'}
- Industry: ${industry || 'Not specified'}
- Overall AI Maturity Score: ${overallScore}/100
- Maturity Stage: ${maturityStage}

DOMAIN SCORES (each out of 100):
${domainSummary}

Strongest domains: ${topDomains}
Weakest domains: ${bottomDomains}

MATURITY STAGE DEFINITIONS:
- AI Scramble (0–20): Ad hoc, uncoordinated AI efforts, no strategy
- AI Pivot (21–40): Early pilots exist but siloed, strategy emerging
- AI Alignment (41–60): Strategy aligned, cross-functional collaboration growing
- AI Transform (61–80): AI embedded in core processes, scaling systematically
- AI-Fueled Enterprise (81–100): AI is a core competitive differentiator, industry-leading

Generate a structured JSON report. Be specific, actionable, and calibrated to the organization's maturity stage. Do not be generic.
Return ONLY valid JSON — no markdown, no code blocks, no explanation.

{
  "executiveSummary": "3–4 paragraph executive summary covering: current standing and score meaning; key strengths; critical gaps and business impact; transformation opportunity ahead.",
  "strengths": [
    "Specific strength 1 based on high-scoring domains — explain WHY this is a strength and its business value",
    "Specific strength 2",
    "Specific strength 3"
  ],
  "criticalGaps": [
    "Specific gap 1 based on low-scoring domains — explain the business risk or missed opportunity",
    "Specific gap 2",
    "Specific gap 3"
  ],
  "topPriorities": [
    "Priority 1: Specific, outcome-oriented priority the organization must focus on immediately",
    "Priority 2",
    "Priority 3"
  ],
  "roadmap90Days": [
    { "title": "Action item title", "description": "What to do, how, and expected outcome within 90 days", "domain": "Relevant domain name", "priority": "High" },
    { "title": "Action item 2", "description": "...", "domain": "...", "priority": "High" },
    { "title": "Action item 3", "description": "...", "domain": "...", "priority": "Medium" },
    { "title": "Action item 4", "description": "...", "domain": "...", "priority": "Medium" }
  ],
  "roadmap12Months": [
    { "title": "Milestone 1 (Month 1–3)", "description": "What should be achieved and the strategic impact", "domain": "...", "priority": "High" },
    { "title": "Milestone 2 (Month 3–6)", "description": "...", "domain": "...", "priority": "High" },
    { "title": "Milestone 3 (Month 6–9)", "description": "...", "domain": "...", "priority": "High" },
    { "title": "Milestone 4 (Month 9–12)", "description": "...", "domain": "...", "priority": "Medium" },
    { "title": "Milestone 5 (Month 12)", "description": "Target state the organization should reach by end of year and how to measure it", "domain": "...", "priority": "High" }
  ]
}`;
}

// ─────────────────────────────────────────────────────────
// PARSE & VALIDATE RESPONSE
// ─────────────────────────────────────────────────────────

function parseReportResponse(rawText) {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Claude returned invalid JSON. Raw: ' + rawText.slice(0, 500));
  }

  const required = ['executiveSummary', 'strengths', 'criticalGaps', 'topPriorities', 'roadmap90Days', 'roadmap12Months'];
  for (const key of required) {
    if (!parsed[key]) throw new Error(`Missing required report field: ${key}`);
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────
// FALLBACK REPORT
// ─────────────────────────────────────────────────────────

function buildFallbackReport({ overallScore, maturityStage, domainScores }) {
  const sorted   = [...domainScores].sort((a, b) => b.score - a.score);
  const top3     = sorted.slice(0, 3);
  const bottom3  = sorted.slice(-3);

  return {
    executiveSummary: `Based on your AI Maturity Assessment, your organization scored ${overallScore}/100, placing you at the "${maturityStage}" stage.\n\nYour strongest areas are ${top3.map(d => d.domainName).join(', ')}, which provide a solid foundation to build on.\n\nThe most significant improvement opportunities lie in ${bottom3.map(d => d.domainName).join(', ')}. Closing these gaps will be critical to advancing to the next maturity stage.\n\nWith focused effort and the right priorities, your organization has a clear path to becoming an AI-Fueled Enterprise.`,
    strengths: top3.map(d => `Strong ${d.domainName} capability (${d.score}/100) — this domain scores above average and provides a competitive foundation for AI scale.`),
    criticalGaps: bottom3.map(d => `${d.domainName} (${d.score}/100) is below the threshold needed to advance. Targeted investment here will have the highest ROI.`),
    topPriorities: [
      `Strengthen ${bottom3[0]?.domainName} by establishing clear ownership, processes, and quick wins within 90 days.`,
      `Build on ${top3[0]?.domainName} strength to create replicable AI playbooks across the organization.`,
      `Develop a cross-functional AI transformation team to coordinate efforts across all 7 domains.`,
    ],
    roadmap90Days: [
      { title: 'Establish AI Steering Committee', description: 'Form a cross-functional group of leaders to govern AI priorities and unblock initiatives. Hold bi-weekly reviews.', domain: 'Leadership', priority: 'High' },
      { title: `${bottom3[0]?.domainName} Quick Win Sprint`, description: `Identify and execute 2–3 concrete improvements in ${bottom3[0]?.domainName} within 90 days to build momentum.`, domain: bottom3[0]?.domainName, priority: 'High' },
      { title: 'AI Use Case Inventory', description: 'Document all current and proposed AI initiatives. Prioritize top 5 by business value and feasibility.', domain: 'AI Use Cases', priority: 'High' },
      { title: 'Skills Gap Assessment', description: 'Audit current AI skills across teams. Identify top 3 skill gaps and launch targeted upskilling programs.', domain: 'Skills & Workforce', priority: 'Medium' },
    ],
    roadmap12Months: [
      { title: 'AI Strategy Formalized (Month 1–3)', description: 'Document and socialize a 12-month AI roadmap with clear KPIs, owners, and budget.', domain: 'AI Strategy', priority: 'High' },
      { title: `${bottom3[0]?.domainName} Maturity Uplift (Month 3–6)`, description: `Move ${bottom3[0]?.domainName} score from ${bottom3[0]?.score} to 60+ through targeted programs.`, domain: bottom3[0]?.domainName, priority: 'High' },
      { title: 'First AI Use Case at Scale (Month 6–9)', description: 'Take the highest-value AI use case from pilot to full production, demonstrating measurable ROI.', domain: 'AI Use Cases', priority: 'High' },
      { title: 'AI Governance Framework Live (Month 9–12)', description: 'Deploy AI ethics guidelines, risk assessment processes, and model monitoring infrastructure.', domain: 'Governance & Security', priority: 'Medium' },
      { title: 'Next Maturity Stage Achieved (Month 12)', description: `Reach a target overall score of ${Math.min(overallScore + 20, 100)}+, advancing to the next maturity stage with documented business impact.`, domain: 'AI Strategy', priority: 'High' },
    ],
  };
}

// ─────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────

/**
 * Generate a structured AI Maturity Report using Claude.
 * Falls back to a template-based report if Claude is unavailable.
 *
 * @param {{ overallScore, maturityStage, domainScores, orgName, industry }} params
 * @returns {Promise<object>} Structured report object
 */
export async function generateMaturityReport(params) {
  const { overallScore, maturityStage, domainScores, orgName, industry } = params;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ ANTHROPIC_API_KEY not set — using fallback report template.');
    return buildFallbackReport({ overallScore, maturityStage, domainScores });
  }

  try {
    console.log('🤖 Generating AI Maturity Report with Claude...');
    const prompt = buildReportPrompt({ overallScore, maturityStage, domainScores, orgName, industry });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0]?.text || '';
    const report  = parseReportResponse(rawText);

    console.log('✅ AI Maturity Report generated successfully.');
    return report;

  } catch (error) {
    console.error('❌ Claude report generation failed:', error.message);
    console.warn('⚠️ Falling back to template report.');
    return buildFallbackReport({ overallScore, maturityStage, domainScores });
  }
}

console.log('✅ SoorgaAI Report Generation Service loaded');
