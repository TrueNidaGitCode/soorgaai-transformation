import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// Initialize both AI clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * ============================================
 * SOORGA NARRATIVE SERVICE
 * AI-powered LinkedIn post generation
 * Supports both OpenAI and Claude (Anthropic)
 * ============================================
 */

/**
 * System prompt (hardcoded - defines Soorga's personality)
 */
const SYSTEM_PROMPT = `You are Soorga — an internal institutional narrative engine.

Your task is to convert structured urban and infrastructure signals into calm, long-horizon LinkedIn narratives.

You do NOT market.
You do NOT hype.
You do NOT persuade.

You observe, interpret, and compress.

You write for people who already understand cities — urban observers, real estate professionals, infrastructure analysts, and institutional investors in India.

Your style:
- Calm, measured tone
- Evidence-based observations
- Long-horizon perspective (3-15 years)
- No speculation beyond institutional evidence
- Maximum one subtle emoji (if any)
- 5-7 short, crisp lines
- No call-to-action
- No marketing language
- Focus on what institutions are actually doing, not what might happen`;

/**
 * Generate LinkedIn post from signal using AI
 * Routes to OpenAI or Claude based on AI_PROVIDER env variable
 * @param {Object} signal - Signal data object
 * @returns {Promise<Object>} - Generated LinkedIn post with metadata
 */
export async function generateInfluencerPost(signal) {
  const aiProvider = process.env.AI_PROVIDER || "openai"; // Default to OpenAI

  console.log(`🤖 Using AI Provider: ${aiProvider.toUpperCase()}`);

  if (aiProvider === "claude") {
    return await generateWithClaude(signal);
  } else {
    return await generateWithOpenAI(signal);
  }
}

/**
 * Generate LinkedIn post using Claude (Anthropic)
 */
async function generateWithClaude(signal) {
  try {
    console.log(`🤖 Generating AI post with Claude for signal: ${signal.title}`);

    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("⚠️ ANTHROPIC_API_KEY not configured, using fallback template");
      return {
        linkedinPost: generateFallbackTemplate(signal),
        metadata: {
          model: "fallback-template",
          error: "ANTHROPIC_API_KEY not configured",
        },
      };
    }

    // Construct user prompt with signal data
    const userPrompt = `Convert the following signal into a LinkedIn post suitable for Indian urban observers and real estate influencers.

Rules:
- Use ONLY the information provided below
- Do NOT add facts not present in the signal
- Do NOT exaggerate impact
- Maximum one subtle emoji (or none)
- 5-7 short lines
- No call-to-action
- No marketing hype

Signal Data:

Title: ${signal.title}
Category: ${signal.category}
Time Horizon: ${signal.timeHorizon}

Institutional Evidence:
${signal.institutionalEvidence}

Interpretation:
${signal.interpretation}

City Impact:
${signal.cityImpact}

Narrative Seed (use as inspiration, not verbatim):
${signal.narrativeSeed}

Generate the LinkedIn post now:`;

    // Call Claude API
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
      max_tokens: 500,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const generatedPost = message.content[0].text.trim();

    console.log("✅ Claude post generated successfully");
    console.log(`📊 Tokens used: ${message.usage.input_tokens + message.usage.output_tokens}`);

    return {
      linkedinPost: generatedPost,
      metadata: {
        provider: "claude",
        model: message.model,
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        estimatedCost: calculateClaudeCost(message.usage.input_tokens, message.usage.output_tokens, message.model),
      },
    };
  } catch (error) {
    console.error("❌ Error generating Claude post:", error);
    console.log("⚠️ Falling back to template generation");
    return {
      linkedinPost: generateFallbackTemplate(signal),
      metadata: {
        provider: "claude",
        model: "fallback-template",
        error: error.message,
      },
    };
  }
}

/**
 * Generate LinkedIn post using OpenAI
 */
async function generateWithOpenAI(signal) {
  try {
    console.log(`🤖 Generating AI post with OpenAI for signal: ${signal.title}`);

    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.warn("⚠️ OPENAI_API_KEY not configured, using fallback template");
      return {
        linkedinPost: generateFallbackTemplate(signal),
        metadata: {
          model: "fallback-template",
          error: "OPENAI_API_KEY not configured",
        },
      };
    }

    // Construct user prompt with signal data
    const userPrompt = `Convert the following signal into a LinkedIn post suitable for Indian urban observers and real estate influencers.

Rules:
- Use ONLY the information provided below
- Do NOT add facts not present in the signal
- Do NOT exaggerate impact
- Maximum one subtle emoji (or none)
- 5-7 short lines
- No call-to-action
- No marketing hype

Signal Data:

Title: ${signal.title}
Category: ${signal.category}
Time Horizon: ${signal.timeHorizon}

Institutional Evidence:
${signal.institutionalEvidence}

Interpretation:
${signal.interpretation}

City Impact:
${signal.cityImpact}

Narrative Seed (use as inspiration, not verbatim):
${signal.narrativeSeed}

Generate the LinkedIn post now:`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
      top_p: 1,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
    });

    const generatedPost = completion.choices[0].message.content.trim();

    console.log("✅ OpenAI post generated successfully");
    console.log(`📊 Tokens used: ${completion.usage.total_tokens}`);

    return {
      linkedinPost: generatedPost,
      metadata: {
        provider: "openai",
        model: completion.model,
        tokensUsed: completion.usage.total_tokens,
        inputTokens: completion.usage.prompt_tokens,
        outputTokens: completion.usage.completion_tokens,
        estimatedCost: calculateOpenAICost(completion.usage.prompt_tokens, completion.usage.completion_tokens, completion.model),
      },
    };
  } catch (error) {
    console.error("❌ Error generating OpenAI post:", error);
    console.log("⚠️ Falling back to template generation");
    return {
      linkedinPost: generateFallbackTemplate(signal),
      metadata: {
        provider: "openai",
        model: "fallback-template",
        error: error.message,
      },
    };
  }
}

/**
 * Fallback template if AI fails
 */
function generateFallbackTemplate(signal) {
  return `I've been tracking institutional infrastructure moves across Indian cities.

${signal.narrativeSeed}

${signal.institutionalEvidence.substring(0, 250)}...

${signal.interpretation.substring(0, 150)}...

When institutional capital moves at this scale, it's not speculative. It's positional.`;
}

/**
 * Calculate estimated cost for OpenAI API
 * GPT-4o-mini: $0.15 / 1M input tokens, $0.60 / 1M output tokens
 * GPT-4o: $2.50 / 1M input tokens, $10.00 / 1M output tokens
 */
function calculateOpenAICost(inputTokens, outputTokens, model) {
  const costs = {
    "gpt-4o-mini": { input: 0.15, output: 0.60 },
    "gpt-4o": { input: 2.50, output: 10.00 },
    "gpt-4-turbo": { input: 10.00, output: 30.00 },
  };

  const modelCosts = costs[model] || { input: 0.15, output: 0.60 }; // Default to mini
  const inputCost = (inputTokens / 1_000_000) * modelCosts.input;
  const outputCost = (outputTokens / 1_000_000) * modelCosts.output;

  return `$${(inputCost + outputCost).toFixed(4)}`;
}

/**
 * Calculate estimated cost for Claude API
 * Claude Sonnet 4.5: $3.00 / 1M input tokens, $15.00 / 1M output tokens
 * Claude Haiku 4.5: $1.00 / 1M input tokens, $5.00 / 1M output tokens
 */
function calculateClaudeCost(inputTokens, outputTokens, model) {
  const costs = {
    "claude-sonnet-4-5-20250929": { input: 3.00, output: 15.00 },
    "claude-haiku-4-5-20251001": { input: 1.00, output: 5.00 },
    "claude-4.5-sonnet": { input: 3.00, output: 15.00 },
    "claude-4.5-haiku": { input: 1.00, output: 5.00 },
  };

  const modelCosts = costs[model] || { input: 3.00, output: 15.00 }; // Default to Sonnet
  const inputCost = (inputTokens / 1_000_000) * modelCosts.input;
  const outputCost = (outputTokens / 1_000_000) * modelCosts.output;

  return `$${(inputCost + outputCost).toFixed(4)}`;
}

console.log("✅ Soorga Narrative Service loaded");
