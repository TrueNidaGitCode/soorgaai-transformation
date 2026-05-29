/**
 * SoorgaAI — Dynamic Question Generation Service
 *
 * Generates up to 20 executive-level, domain-personalized assessment questions
 * by composing KB context into a Claude prompt.
 *
 * Fallback: deterministic template questions built from focus areas (3 per area = 21, trimmed to 20).
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv    from 'dotenv';

dotenv.config();

const MAX_QUESTIONS = 20;
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildQuestionPrompt({ companyName, role, domain, subDomain, summary, maturityStages, focusAreas, domainStudy }) {
  const stagesSummary = maturityStages
    .map(s => `- ${s.stage} (${s.minScore}–${s.maxScore}): ${s.tagline}`)
    .join('\n');

  const focusSummary = focusAreas
    .map(f => `- ${f.id} | ${f.name}: ${f.description}`)
    .join('\n');

  // Trim domain study to avoid excessive token use
  const domainExcerpt = domainStudy.slice(0, 3000);

  return `You are SoorgaAI, an expert AI transformation advisor. You are generating a personalized AI maturity assessment for an executive leader.

RESPONDENT CONTEXT:
- Name/Role: ${role} at ${companyName}
- Discovered Industry Domain: ${domain}${subDomain ? ` / ${subDomain}` : ''}
- Company Summary: ${summary || 'Not available'}

AI MATURITY STAGES (scoring framework):
${stagesSummary}

ASSESSMENT FOCUS AREAS (7 capability domains):
${focusSummary}

INDUSTRY DOMAIN KNOWLEDGE:
${domainExcerpt}

INSTRUCTIONS:
Generate exactly ${MAX_QUESTIONS} assessment questions that:
1. Are written for a senior executive (CTO, Founder, Engineering Head) — no jargon, business-outcome focused
2. Cover all 7 focus areas (distribute questions: 3 for highest-priority areas, 2–3 for others)
3. Reference the specific industry context (${domain}) naturally — mention relevant AI use cases, tools, or challenges from that domain
4. Use a 5-point Likert scale with clear, meaningful labels
5. Probe different maturity levels — some questions reveal Scramble/Pivot, others reveal Transform/AI-Fueled Enterprise

Return ONLY valid JSON — no markdown, no code blocks, no explanation:
{
  "questions": [
    {
      "questionId": "q1",
      "focusAreaId": "ai-strategy",
      "stageHint": "AI Alignment",
      "text": "Full question text — specific, executive-friendly, references ${domain} context where relevant",
      "options": [
        { "value": 1, "label": "Not started" },
        { "value": 2, "label": "In early exploration" },
        { "value": 3, "label": "Pilots underway" },
        { "value": 4, "label": "Deployed and scaling" },
        { "value": 5, "label": "Industry-leading" }
      ]
    }
  ]
}

Valid focusAreaId values: ai-strategy, leadership, ai-use-cases, data-readiness, technology, skills-workforce, governance
Each question MUST have exactly 5 options with values 1–5.`;
}

// ── Response parser ───────────────────────────────────────────────────────────

function parseQuestions(rawText, focusAreas) {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed.questions)) throw new Error('Response missing questions array');

  const validFocusIds = focusAreas.map(f => f.id);

  return parsed.questions
    .filter(q => q.questionId && q.text && Array.isArray(q.options) && q.options.length === 5)
    .map(q => ({
      questionId:  q.questionId,
      text:        q.text,
      focusAreaId: validFocusIds.includes(q.focusAreaId) ? q.focusAreaId : validFocusIds[0],
      stageHint:   q.stageHint || '',
      options:     q.options.map(o => ({ label: String(o.label), value: Number(o.value) })),
      weight:      1,
    }))
    .slice(0, MAX_QUESTIONS);
}

// ── Template fallback ─────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'Minimally' },
  { value: 3, label: 'Partially' },
  { value: 4, label: 'Mostly' },
  { value: 5, label: 'Fully' },
];

const TEMPLATE_QUESTIONS = [
  // AI Strategy (3)
  { focusAreaId: 'ai-strategy', text: 'Does your organization have a documented AI strategy with executive sponsorship and a dedicated budget?' },
  { focusAreaId: 'ai-strategy', text: 'How well does your AI strategy align with your overall business objectives and competitive positioning?' },
  { focusAreaId: 'ai-strategy', text: 'To what extent are AI KPIs tracked and reported at the executive or board level?' },
  // Leadership (3)
  { focusAreaId: 'leadership', text: 'Do your senior leaders actively champion AI transformation with visible actions, not just statements?' },
  { focusAreaId: 'leadership', text: 'How would you rate the overall AI literacy of your C-suite and leadership team?' },
  { focusAreaId: 'leadership', text: 'Is your organizational culture supportive of experimentation, learning from AI failures, and rapid iteration?' },
  // AI Use Cases (3)
  { focusAreaId: 'ai-use-cases', text: 'Does your organization have AI use cases in production that are delivering measurable business value?' },
  { focusAreaId: 'ai-use-cases', text: 'Do you have a structured process for identifying, prioritizing, and scaling AI use cases across the business?' },
  { focusAreaId: 'ai-use-cases', text: 'How broadly are AI applications deployed — across multiple business functions or only in isolated teams?' },
  // Data (3)
  { focusAreaId: 'data-readiness', text: 'Is your data centralized, governed, and accessible enough to train and operate AI systems reliably?' },
  { focusAreaId: 'data-readiness', text: 'Do you have data quality standards, monitoring, and ownership clearly defined across the organization?' },
  { focusAreaId: 'data-readiness', text: 'Are your data privacy and regulatory compliance processes ready for AI-scale data usage?' },
  // Technology (2)
  { focusAreaId: 'technology', text: 'Does your technology infrastructure support rapid AI model development, deployment, and monitoring at scale?' },
  { focusAreaId: 'technology', text: 'Do you have MLOps practices in place for deploying, versioning, and monitoring AI models in production?' },
  // Skills (3)
  { focusAreaId: 'skills-workforce', text: 'Does your organization have the AI and machine learning talent needed to execute your AI strategy?' },
  { focusAreaId: 'skills-workforce', text: 'Are there formal AI upskilling programs for both technical teams and the broader workforce?' },
  { focusAreaId: 'skills-workforce', text: 'How effectively is your organization attracting and retaining AI talent versus competitors?' },
  // Governance (2)
  { focusAreaId: 'governance', text: 'Does your organization have a responsible AI framework covering ethics, risk assessment, and compliance?' },
  { focusAreaId: 'governance', text: 'Are AI-specific security risks (adversarial attacks, model theft, bias) addressed in your governance framework?' },
  // Extra question to round out to 20
  { focusAreaId: 'ai-strategy', text: 'How confident are you that your current AI investments will yield a competitive advantage within 18 months?' },
];

function buildFallbackQuestions() {
  return TEMPLATE_QUESTIONS.slice(0, MAX_QUESTIONS).map((q, i) => ({
    questionId:  `tq${i + 1}`,
    text:        q.text,
    focusAreaId: q.focusAreaId,
    stageHint:   '',
    options:     DEFAULT_OPTIONS,
    weight:      1,
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate up to 20 personalized assessment questions.
 *
 * @param {{ companyName, role, domain, subDomain, summary, maturityStages, focusAreas, domainStudy }} params
 * @returns {Promise<Array<Question>>}
 */
export async function generateQuestions(params) {
  const { focusAreas } = params;

  if (!anthropic) {
    console.warn('⚠️ Question Generator: ANTHROPIC_API_KEY not set — using template fallback');
    return buildFallbackQuestions();
  }

  try {
    console.log(`🤖 Question Generator: generating questions for ${params.domain}...`);

    const prompt = buildQuestionPrompt(params);

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0]?.text || '';
    const questions = parseQuestions(rawText, focusAreas);

    if (questions.length < 5) {
      throw new Error(`Too few valid questions parsed: ${questions.length}`);
    }

    console.log(`✅ Question Generator: ${questions.length} questions generated`);
    return questions;

  } catch (err) {
    console.error('❌ Question Generator: Claude call failed —', err.message);
    console.warn('⚠️ Question Generator: Using template fallback');
    return buildFallbackQuestions();
  }
}
