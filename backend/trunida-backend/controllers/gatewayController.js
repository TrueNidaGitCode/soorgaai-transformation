/**
 * Svarg — LLM Gateway endpoints
 *
 * POST /api/gateway/v1/chat/completions
 * POST /api/gateway/v1/embeddings
 * POST /api/gateway/v1/signals        what a live application reports about itself
 * POST /api/gateway/v1/notify         an application telling its own owner something
 * GET  /api/gateway/v1/ops/:dataset   Svarg's own operations, for the tenant Svarg runs itself on
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
import { THINKING_HEADER } from '../services/llmService.js';
import { embedBatchWithUsage } from '../services/embeddingService.js';
import { acceptSignals } from '../services/tenantSignalService.js';
import { notifyOwner } from '../services/tenantNotifyService.js';
import { opsRows, DATASETS } from '../services/opsDatasetService.js';
import { learnFromConversation } from '../services/customerUnderstandingService.js';
import { considerCapabilities } from '../services/capabilityDecisionService.js';
import TransformationBlueprint from '../models/TransformationBlueprint.js';

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
    /*
     * A tenant can decline thinking, and pays less for it.
     *
     * Thinking is billed as output at the output rate, and a great many calls
     * an application makes are not reasoning — pulling JSON out of a
     * catalogue, wording a sentence from facts already computed. Only the
     * caller knows which of its calls those are, so it says so, here.
     * Anything that does not say so keeps thinking, as every caller did
     * before this existed.
     */
    const thinking = String(req.headers[THINKING_HEADER] || '').toLowerCase() === 'off'
      ? false
      : undefined;
    if (!Array.isArray(messages) || !messages.length) {
      return fail(res, 400, 'messages must be a non-empty array.');
    }
    if (messages.length > MAX_MESSAGES) {
      return fail(res, 400, `messages must contain ${MAX_MESSAGES} entries or fewer.`);
    }

    const { text, inputTokens, outputTokens, apiModel } =
      await forwardChat(deployment, { messages, max_tokens, thinking });

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
/**
 * Learn from what the application reported, decide whether it is worth
 * building, build it, and tell the customer when it is theirs.
 *
 * Each stage runs only if the one before it produced something, so a quiet day
 * costs a single query and a busy one cannot start two builds.
 */
async function continueLearning(deployment) {
  const { userId, blueprintId } = deployment;
  const learned = await learnFromConversation({ userId, blueprintId, force: true });
  if (!learned?.learned) return;

  const blueprint = await TransformationBlueprint.findById(blueprintId).lean().catch(() => null);
  const decided = await considerCapabilities({ userId, blueprintId, blueprint });
  if (!decided?.decided) return;
  /*
   * Planned, and left there on purpose.
   *
   * This used to build straight through, unattended. A build rewrites an
   * application somebody is relying on and spends real money, and neither
   * should happen because a coach complained twice — so the loop now stops at
   * a decision and the customer presses Build on the Blueprints page.
   */
  console.log(`[gateway] ${blueprintId}: planned "${decided.plan?.title || decided.need || ''}" — waiting to be built`);
}

export async function signals(req, res) {
  try {
    const deployment = await authenticate(bearer(req));
    if (!deployment) return fail(res, 401, 'Invalid or missing deployment token.', 'authentication_error');

    const result = await acceptSignals(deployment, req.body?.signals);
    // The loop that makes this a product rather than a delivery: what the
    // customer's own people do inside their application is what decides what
    // gets built into it next. It ran from Svarg's screen chat and stopped
    // here at learning, so a live application could report a correction every
    // day and nothing was ever built from it.
    //
    // Fired, never awaited: the application is waiting on this response, and a
    // build takes minutes. Every guard that makes an unattended build safe is
    // inside considerCapabilities — one request per requirement, one build at
    // a time, a monthly budget, and a planner that may refuse.
    if (result.corrections || result.downvotes) {
      continueLearning(deployment).catch(err => console.error('[gateway] learner nudge failed:', err.message));
    }
    return res.json({ ok: true, kept: result.kept, refused: result.refused });
  } catch (err) {
    console.error('[gateway] signals error:', err.message);
    return fail(res, 500, 'Could not record the signals.', 'api_error');
  }
}

/**
 * An application telling its owner what an agent found.
 *
 * The caller does not say who to write to, and cannot. Svarg resolves the
 * owner from the deployment behind the token and sends only there — see
 * tenantNotifyService for why that is the whole abuse story rather than a
 * convenience.
 */
export async function notify(req, res) {
  try {
    const deployment = await authenticate(bearer(req));
    if (!deployment) return fail(res, 401, 'Invalid or missing deployment token.', 'authentication_error');

    const r = await notifyOwner(deployment, {
      subject: req.body?.subject,
      lines: req.body?.lines,
    });

    // A refusal is a 200 with a reason, not an error: the application must
    // record that it could not tell anybody and carry on, never retry-loop
    // against a daily cap.
    return res.json(r);
  } catch (err) {
    console.error('[gateway] notify error:', err.message);
    return fail(res, 500, 'Could not send the message.', 'api_error');
  }
}

/**
 * Svarg's own operations, as rows.
 *
 * Refused unless the deployment carries the internal flag, which no API can
 * set. See opsDatasetService for why that single flag is the whole gate.
 */
export async function ops(req, res) {
  try {
    const deployment = await authenticate(bearer(req));
    if (!deployment) return fail(res, 401, 'Invalid or missing deployment token.', 'authentication_error');

    const rows = await opsRows(deployment, req.params.dataset);
    return res.json({ dataset: req.params.dataset, rows });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message, 'invalid_request_error');
    console.error('[gateway] ops error:', err.message);
    return fail(res, 500, 'Could not read the operations data.', 'api_error');
  }
}

/** Which datasets there are, so a connector can offer them without guessing. */
export async function opsCatalogue(req, res) {
  const deployment = await authenticate(bearer(req));
  if (!deployment) return fail(res, 401, 'Invalid or missing deployment token.', 'authentication_error');
  if (!deployment.internal) return fail(res, 403, 'This deployment may not read Svarg operations data.');
  return res.json({ datasets: DATASETS });
}
