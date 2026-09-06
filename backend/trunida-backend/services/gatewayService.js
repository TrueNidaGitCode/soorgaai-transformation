/**
 * Svarg — LLM Gateway
 *
 * Hosted customer applications call Svarg here instead of calling a provider
 * directly. That indirection exists for one reason: Svarg's API keys pay for
 * these calls, and a key handed to a tenant cannot be metered, cannot be
 * capped, and can be read by anyone with access to their container. Keeping
 * the keys on this side is what makes HostedDeployment.usage trustworthy and
 * HostedDeployment.limits enforceable.
 *
 * The wire format is OpenAI's, which costs the delivered application nothing:
 * its llmService 'selfhosted' provider and its embeddingService are already
 * plain OpenAI SDK clients pointed at an arbitrary baseURL. Hosting is
 * therefore an environment-variable change in the tenant, not a code change.
 *
 * Only frontier models are servable here. An open-weight pick means a GPU,
 * which Svarg does not run for tenants — see provisionDeployment, which
 * refuses that combination up front rather than failing at request time.
 */

import crypto from 'crypto';
import HostedDeployment from '../models/HostedDeployment.js';
import { ADVISORY_CATALOG } from '../config/modelCatalog.js';
import { generate } from './llmService.js';

const TOKEN_PREFIX = 'svd_';

/** A new gateway token. The plaintext is returned once and never stored. */
export function issueToken() {
  const token = TOKEN_PREFIX + crypto.randomBytes(24).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

/**
 * Resolve a bearer token to its deployment. Looks up by hash, so a dump of
 * this collection cannot be replayed against the gateway.
 */
export async function authenticate(token) {
  if (!token || !String(token).startsWith(TOKEN_PREFIX)) return null;
  return HostedDeployment.findOne({ gatewayTokenHash: hashToken(token) });
}

// ── Cost ────────────────────────────────────────────────────────────────────
// Prices are per million tokens, carried on the catalog row. They are list
// prices and drift, so they are used to enforce a CEILING, not to bill: a
// slightly stale rate changes when a tenant is cut off, never what they owe.
const EMBEDDING_PRICE_PER_M = Number(process.env.GATEWAY_EMBEDDING_PRICE || 0.02);

/**
 * A catalog row by either name it goes by.
 *
 * Rows carry two ids: the advisory id a customer picks in Arth ('gemini-flash')
 * and the real API id it resolves to ('gemini-3.8-flash'). Matching only the
 * first was fine while the gateway was the only caller, because a deployment
 * stores the advisory id. The usage ledger reports what llmService actually
 * called, which is the API id — so every internal call missed, fell through to
 * the "unknown model" branch below, and was priced at Opus rates. A Gemini
 * Flash call was being recorded at roughly fifty times its cost, in the one
 * record meant to tell us what a tier really costs.
 */
export function findCatalogModel(modelId) {
  if (!modelId) return null;
  return ADVISORY_CATALOG.find(m => m.id === modelId)
      || ADVISORY_CATALOG.find(m => m.apiModel === modelId)
      || null;
}

export function estimateCostUsd(modelId, inputTokens = 0, outputTokens = 0) {
  const m = findCatalogModel(modelId);
  // An unknown model is costed at the most expensive row rather than zero —
  // an unpriced model must not become an uncapped one.
  const priceIn  = m?.priceIn  ?? Math.max(...ADVISORY_CATALOG.map(x => x.priceIn  || 0));
  const priceOut = m?.priceOut ?? Math.max(...ADVISORY_CATALOG.map(x => x.priceOut || 0));
  return (inputTokens / 1e6) * priceIn + (outputTokens / 1e6) * priceOut;
}

export function estimateEmbeddingCostUsd(tokens = 0) {
  return (tokens / 1e6) * EMBEDDING_PRICE_PER_M;
}

// ── Cap ─────────────────────────────────────────────────────────────────────

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether this deployment may make another call. Checked BEFORE forwarding:
 * the cap is a ceiling on Svarg's exposure, so the last request may overshoot
 * it slightly but no request starts once it is reached.
 */
export function checkAllowance(deployment, now = new Date()) {
  if (!deployment) return { allowed: false, status: 401, reason: 'Unknown deployment token.' };
  if (deployment.status === 'destroyed') return { allowed: false, status: 410, reason: 'This deployment has been destroyed.' };
  if (deployment.status === 'suspended') {
    return { allowed: false, status: 429, reason: deployment.suspendedReason || 'This deployment is suspended.' };
  }

  const u = deployment.usage || {};
  const l = deployment.limits || {};
  const periodOver = u.periodStart && (now - new Date(u.periodStart)) > PERIOD_MS;
  // A rolled-over period starts clean, so an expired window never blocks.
  if (periodOver) return { allowed: true, rollover: true };

  if (l.maxCostUsd > 0 && (u.costUsd || 0) >= l.maxCostUsd) {
    return {
      allowed: false, status: 429, cap: true,
      reason: `Monthly spend limit of $${l.maxCostUsd} reached for this deployment.`,
    };
  }
  if (l.maxRequests > 0 && (u.requests || 0) >= l.maxRequests) {
    return {
      allowed: false, status: 429, cap: true,
      reason: `Monthly request limit of ${l.maxRequests} reached for this deployment.`,
    };
  }
  return { allowed: true };
}

/**
 * Record what a call cost. Uses $inc so concurrent requests from the same
 * tenant cannot lose an increment to a read-modify-write race — which would
 * make the cap leaky in exactly the runaway-loop case it exists to stop.
 */
export async function recordUsage(deploymentId, { inputTokens = 0, outputTokens = 0, costUsd = 0, rollover = false }) {
  const now = new Date();
  if (rollover) {
    return HostedDeployment.updateOne({ _id: deploymentId }, {
      $set: {
        'usage.requests': 1,
        'usage.inputTokens': inputTokens,
        'usage.outputTokens': outputTokens,
        'usage.costUsd': costUsd,
        'usage.periodStart': now,
        'usage.lastRequestAt': now,
      },
    });
  }
  return HostedDeployment.updateOne({ _id: deploymentId }, {
    $inc: {
      'usage.requests': 1,
      'usage.inputTokens': inputTokens,
      'usage.outputTokens': outputTokens,
      'usage.costUsd': costUsd,
    },
    $set: { 'usage.lastRequestAt': now },
  });
}

// ── OpenAI wire format ──────────────────────────────────────────────────────

/**
 * Flatten an OpenAI messages array into the { systemPrompt, userMessage } pair
 * llmService takes. The delivered application sends exactly one system and one
 * user message, so that case is lossless; longer conversations are labelled by
 * role rather than silently collapsed.
 */
export function messagesToPrompt(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  const system = list.filter(m => m?.role === 'system').map(m => textOf(m.content)).filter(Boolean);
  const rest   = list.filter(m => m?.role !== 'system');

  const userMessage = rest.length === 1
    ? textOf(rest[0].content)
    : rest.map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${textOf(m.content)}`).join('\n\n');

  return { systemPrompt: system.join('\n\n'), userMessage };
}

// Content may be a string or OpenAI's array-of-parts form.
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(p => (typeof p === 'string' ? p : p?.text || '')).join('');
  return '';
}

export function toChatCompletion({ text, model, inputTokens, outputTokens }) {
  return {
    id: 'chatcmpl-' + crypto.randomBytes(12).toString('hex'),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}

/**
 * Forward a chat request to the provider the tenant's Arth choice pinned.
 * The provider is NOT the failover chain: the customer chose a specific model
 * and the cost is attributed to that model's rate, so silently answering from
 * a different one would misreport both the answer and the bill.
 */
/**
 * Categorise an upstream failure into something a tenant can act on. The raw
 * provider error goes to Svarg's logs; only the category crosses the wire, so
 * "your app is broken" and "Svarg needs to top up" stop looking identical
 * without disclosing which provider or account is behind the gateway.
 */
export function classifyUpstreamError(message = '') {
  const m = String(message);
  if (/no credits remaining|credit balance|billing|quota/i.test(m)) {
    return 'The model provider rejected the request for lack of credit. This is on Svarg to resolve, not your application.';
  }
  if (/rate limit|429/i.test(m)) {
    return 'The model provider is rate limiting requests. Retry shortly.';
  }
  if (/not configured|api key|401|403|invalid.*key/i.test(m)) {
    return 'The model provider is not configured correctly on Svarg. This is on Svarg to resolve.';
  }
  return 'The upstream model provider could not be reached.';
}

export async function forwardChat(deployment, { messages, max_tokens }) {
  // Both catalogs, because a tenant can now be deployed on either: the original
  // ten, or a benchmark row that has since been given an endpoint. Reading only
  // the first meant every model Arth recommends came back as 501 "not
  // configured with a model Svarg can serve" — about a model the catalog page
  // showed as available.
  //
  // Still an allow-list. An unrecognised modelId must not fall through to
  // whatever providerId happens to sit on the deployment record, and resolution
  // requires an apiModel, so there is always something concrete to ask for.
  const { resolveSelectableModel } = await import('./selectableModelService.js');
  const catalog = findCatalogModel(deployment.model?.modelId)
    || await resolveSelectableModel(deployment.model?.modelId);

  // Open weight means a GPU Svarg does not run for tenants.
  if (!catalog || catalog.type !== 'frontier' || !catalog.apiModel) {
    // Three different situations, and the fix differs for each — a single
    // message would send someone to the wrong one.
    const err = new Error(
      !catalog
        ? 'This deployment is not configured with a model Svarg can serve.'
        : catalog.type !== 'frontier'
          ? 'This deployment is configured for an open-weight model, which Svarg does not host. Point SELFHOSTED_BASE_URL at your own inference endpoint.'
          : `${catalog.displayName || catalog.id} has no API model configured, so there is nothing to ask its provider for.`);
    err.status = 501;
    throw err;
  }

  const provider = catalog.providerId;
  const { systemPrompt, userMessage } = messagesToPrompt(messages);

  const result = await generate({
    systemPrompt,
    userMessage,
    model: catalog?.apiModel,
    maxTokens: max_tokens,
    provider: provider || undefined,
  });

  return { ...result, apiModel: catalog?.apiModel || provider || 'unknown' };
}
