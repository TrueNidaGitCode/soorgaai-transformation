/**
 * Svarg — LLM Gateway endpoints
 *
 * POST /api/gateway/v1/chat/completions
 * POST /api/gateway/v1/embeddings
 * POST /api/gateway/v1/signals        what a live application reports about itself
 *
 * These are the ONLY routes in this codebase authenticated by a deployment
 * token rather than a user JWT — the caller is a machine (a hosted customer
 * application), not a person. `protect` is deliberately not used; see
 * requireDeployment below, which is the whole auth story for this surface.
 *
 * Errors follow OpenAI's { error: { message, type } } shape, because the
 * caller is an OpenAI SDK client and will surface `error.message` from it.
 */

import {
  authenticate, checkAllowance, recordUsage, forwardChat,
  estimateCostUsd, estimateEmbeddingCostUsd, toChatCompletion, classifyUpstreamError,
} from '../services/gatewayService.js';
import { embedBatchWithUsage } from '../services/embeddingService.js';
import { acceptSignals } from '../services/tenantSignalService.js';
import { learnFromConversation } from '../services/customerUnderstandingService.js';

const MAX_MESSAGES = 50;
const MAX_EMBEDDING_INPUTS = 256;

function fail(res, status, message, type = 'invalid_request_error') {
  return res.status(status).json({ error: { message, type } });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

/**
 * Resolves the deployment and checks its allowance in one step. Returns null
 * and responds when the call must not proceed, so handlers can `if (!d) return;`.
 */
async function requireDeployment(req, res) {
  const deployment = await authenticate(bearer(req));
  if (!deployment) {
    fail(res, 401, 'Invalid or missing deployment token.', 'authentication_error');
    return null;
  }

  const allowance = checkAllowance(deployment);
  if (!allowance.allowed) {
    // A cap hit is reported as a rate-limit error so the SDK's own handling
    // treats it as retryable-later rather than as a bad request.
    fail(res, allowance.status || 429, allowance.reason,
      allowance.cap ? 'rate_limit_error' : 'authentication_error');
    return null;
  }

  req.deployment = deployment;
  req.rollover = !!allowance.rollover;
  return deployment;
}

export async function chatCompletions(req, res) {
  try {
    const deployment = await requireDeployment(req, res);
    if (!deployment) return;

    const { messages, max_tokens } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return fail(res, 400, 'messages must be a non-empty array.');
    }
    if (messages.length > MAX_MESSAGES) {
      return fail(res, 400, `messages must contain ${MAX_MESSAGES} entries or fewer.`);
    }

    const { text, inputTokens, outputTokens, apiModel } =
      await forwardChat(deployment, { messages, max_tokens });

    const costUsd = estimateCostUsd(deployment.model?.modelId, inputTokens, outputTokens);
    // Recorded before responding: a tenant that disconnects mid-response has
    // still spent Svarg's money, and the cap has to see it.
    await recordUsage(deployment._id, { inputTokens, outputTokens, costUsd, rollover: req.rollover });

    return res.json(toChatCompletion({ text, model: apiModel, inputTokens, outputTokens }));

  } catch (err) {
    if (err.status === 501) return fail(res, 501, err.message, 'invalid_request_error');
    console.error('[gateway] chat error:', err.message);
    return fail(res, 502, classifyUpstreamError(err.message), 'api_error');
  }
}

export async function embeddings(req, res) {
  try {
    const deployment = await requireDeployment(req, res);
    if (!deployment) return;

    const { input } = req.body || {};
    const texts = Array.isArray(input) ? input : (typeof input === 'string' ? [input] : null);
    if (!texts || !texts.length) {
      return fail(res, 400, 'input must be a string or a non-empty array of strings.');
    }
    if (texts.length > MAX_EMBEDDING_INPUTS) {
      return fail(res, 400, `input must contain ${MAX_EMBEDDING_INPUTS} items or fewer.`);
    }

    const { embeddings: vectors, promptTokens, model } = await embedBatchWithUsage(texts);

    const costUsd = estimateEmbeddingCostUsd(promptTokens);
    await recordUsage(deployment._id, { inputTokens: promptTokens, costUsd, rollover: req.rollover });

    return res.json({
      object: 'list',
      model,
      data: vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })),
      usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
    });

  } catch (err) {
    console.error('[gateway] embeddings error:', err.message);
    return fail(res, 502, classifyUpstreamError(err.message), 'api_error');
  }
}

/**
 * Signals from a live application: counts, votes, corrections, imports.
 * Never a message body or a row -- tenantSignalService refuses anything not
 * on the list. Authenticated by the deployment token; not subject to the
 * spend allowance, because reporting costs nothing and a capped application
 * is exactly the one whose usage we want to know about.
 *
 * A batch that carries a correction or a down-vote is a moment worth
 * learning from, so the Learner is nudged -- unawaited, as everywhere else.
 */
export async function signals(req, res) {
  try {
    const deployment = await authenticate(bearer(req));
    if (!deployment) return fail(res, 401, 'Invalid or missing deployment token.', 'authentication_error');

    const result = await acceptSignals(deployment, req.body?.signals);
    if (result.corrections || result.downvotes) {
      learnFromConversation({ userId: deployment.userId, blueprintId: deployment.blueprintId, force: true })
        .catch(err => console.error('[gateway] learner nudge failed:', err.message));
    }
    return res.json({ ok: true, kept: result.kept, refused: result.refused });
  } catch (err) {
    console.error('[gateway] signals error:', err.message);
    return fail(res, 500, 'Could not record the signals.', 'api_error');
  }
}
