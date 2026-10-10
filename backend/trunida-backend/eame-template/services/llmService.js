/**
 * The model, as this application calls it.
 *
 * Everything about providers, failover, keys and the gateway is in
 * llmCore.js, which is Svarg's own module copied in unchanged. This file is
 * the thin layer above it, and it exists for one reason: the conduct in
 * services/assistant.js has to reach every answer, including answers produced
 * by code that was generated before the conduct existed.
 *
 * The generated service writes the prompt that knows the subject — which
 * records matter, what a session means here, how to read a roll call. It does
 * not decide how the application speaks. That is a product standard, it is
 * the same in every Svarg application, and it is applied here so no build can
 * quietly drop it.
 *
 * Generated code calls generate({ systemPrompt, userMessage, ... }) exactly as
 * before; nothing about the contract changes. What changes is that the system
 * prompt arrives framed.
 *
 * generateRaw() is the same call without the frame, for the rare model call
 * that is not an answer to a person — classifying a message, extracting a
 * field. Conduct written for a reader would only get in its way.
 */

import { generate as coreGenerate } from './llmCore.js';
import { frame, appIdentity } from './assistant.js';

export * from './llmCore.js';

/**
 * Every model call, with the customers' names covered on the way out and put
 * back in the answer (services/nameGuard.js). Here rather than at each call
 * site so code generated later is covered too.
 *
 * Loaded on first use, not imported: the guard reads the datasets through
 * connectorService, which loads the connectors, one of which imports this
 * file -- a cycle that would stall the server's start.
 */
async function covered(opts) {
  let guard;
  try {
    guard = await (await import('./nameGuard.js')).currentGuard();
  } catch (err) {
    // Refused rather than sent uncovered: the promise is that no customer
    // name reaches the model, and a call that cannot keep it does not go.
    console.warn('[names] the names could not be covered, so nothing was sent —', err.message);
    throw new Error('This could not be sent to the AI model without exposing customer names, so it was not sent.');
  }
  const c = guard.cover([opts.systemPrompt || '', opts.userMessage || '']);
  const res = await coreGenerate({ ...opts, systemPrompt: c.texts[0], userMessage: c.texts[1] });
  if (res && typeof res.text === 'string') return { ...res, text: c.restore(res.text), covered: c.count };
  return res;
}

/** The model call with the application's conduct applied. */
export async function generate(opts = {}) {
  return covered({ ...opts, systemPrompt: frame(opts.systemPrompt, appIdentity()) });
}

/** The model call without the frame -- names covered all the same. */
export async function generateRaw(opts = {}) {
  return covered(opts);
}

export default { generate, generateRaw };
