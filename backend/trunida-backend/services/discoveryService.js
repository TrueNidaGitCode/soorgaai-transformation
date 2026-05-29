/**
 * SoorgaAI — Company Context Discovery Service
 *
 * Uses Claude to infer a company's primary domain from its name.
 * Returns: { domain, subDomain, summary, confidence, welcomeMessage }
 *
 * Supported domains: Automotive, Healthcare, Finance, Manufacturing, Retail, Other
 * Fallback: defaults to Automotive (MVP domain) if Claude is unavailable.
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv    from 'dotenv';

dotenv.config();

const SUPPORTED_DOMAINS = ['Automotive', 'Healthcare', 'Finance', 'Manufacturing', 'Retail', 'Other'];
const MVP_DEFAULT_DOMAIN = 'Automotive';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildDiscoveryPrompt(companyName) {
  return `You are a business intelligence analyst. Given a company name, identify its primary industry domain for the purpose of an AI maturity assessment.

Company Name: "${companyName}"

Classify this company into ONE of these domains: Automotive, Healthcare, Finance, Manufacturing, Retail, Other.

- Automotive: OEMs, Tier-1/Tier-2 suppliers, embedded software firms for vehicles, ADAS companies, fleet management, automotive retail
- Healthcare: Hospitals, pharma, medical devices, health tech, diagnostics, insurance (health)
- Finance: Banks, insurance (non-health), investment firms, fintech, payments, capital markets
- Manufacturing: Industrial manufacturing, aerospace, defence, electronics, chemicals, FMCG
- Retail: E-commerce, brick-and-mortar retail, consumer goods, logistics and supply chain
- Other: Technology, consulting, education, energy, media, public sector, or genuinely unclear

Return ONLY valid JSON — no markdown, no explanation:
{
  "domain": "one of the six domains above",
  "subDomain": "more specific sub-category (e.g. 'Tier-1 Supplier', 'Digital Health', 'Investment Banking')",
  "summary": "1–2 sentence description of what this company likely does and its AI context",
  "confidence": 0.0 to 1.0
}`;
}

function buildWelcomeMessage(companyName, domain, subDomain, summary) {
  const domainContexts = {
    Automotive: `the automotive industry — an industry being transformed by software-defined vehicles, ADAS, and AI-powered manufacturing`,
    Healthcare: `the healthcare sector — where AI is reshaping diagnostics, clinical workflows, and patient outcomes`,
    Finance: `financial services — where AI is driving automation, risk intelligence, and personalized experiences at scale`,
    Manufacturing: `industrial manufacturing — where AI is powering predictive maintenance, quality automation, and supply chain resilience`,
    Retail: `retail and consumer — where AI is reinventing personalization, demand forecasting, and customer experience`,
    Other: `your industry — where AI is creating new competitive advantages and operational efficiencies`,
  };

  const ctx = domainContexts[domain] || domainContexts['Other'];
  return `Welcome to the SoorgaAI AI Transformation Assessment. Based on our analysis, ${companyName} operates in ${ctx}. ${summary ? summary + ' ' : ''}This assessment will generate up to 20 executive-level questions personalized to your organization's context and AI maturity journey.`;
}

// ── Fallback ──────────────────────────────────────────────────────────────────

function buildFallbackResult(companyName) {
  const domain = MVP_DEFAULT_DOMAIN;
  const summary = `${companyName} appears to operate in a domain we're continuing to analyze. We've applied our Automotive AI intelligence model for this assessment.`;
  return {
    domain,
    subDomain: 'General',
    summary,
    confidence: 0.3,
    welcomeMessage: buildWelcomeMessage(companyName, domain, '', summary),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Discover a company's domain context using Claude.
 *
 * @param {string} companyName
 * @returns {Promise<{ domain, subDomain, summary, confidence, welcomeMessage }>}
 */
export async function discoverCompany(companyName) {
  if (!companyName || !companyName.trim()) {
    return buildFallbackResult('Your organization');
  }

  if (!anthropic) {
    console.warn('⚠️ Discovery Service: ANTHROPIC_API_KEY not set — using fallback');
    return buildFallbackResult(companyName);
  }

  try {
    console.log(`🔍 Discovery: Analysing company "${companyName}"...`);

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: buildDiscoveryPrompt(companyName) }],
    });

    const rawText = message.content[0]?.text?.trim() || '';

    // Strip any accidental markdown fences
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Validate domain is one of the supported ones
    const domain = SUPPORTED_DOMAINS.includes(parsed.domain) ? parsed.domain : MVP_DEFAULT_DOMAIN;
    const subDomain  = parsed.subDomain  || '';
    const summary    = parsed.summary    || '';
    const confidence = typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7;

    // If Other + low confidence → fall back to Automotive for MVP
    const effectiveDomain = (domain === 'Other' && confidence < 0.5) ? MVP_DEFAULT_DOMAIN : domain;

    const welcomeMessage = buildWelcomeMessage(companyName, effectiveDomain, subDomain, summary);

    console.log(`✅ Discovery: "${companyName}" → ${effectiveDomain} (${(confidence * 100).toFixed(0)}% confidence)`);

    return { domain: effectiveDomain, subDomain, summary, confidence, welcomeMessage };

  } catch (err) {
    console.error('❌ Discovery Service: Claude call failed —', err.message);
    console.warn('⚠️ Discovery Service: Using fallback');
    return buildFallbackResult(companyName);
  }
}
