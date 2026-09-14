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

/** The model call with the application's conduct applied. */
export async function generate(opts = {}) {
  return coreGenerate({ ...opts, systemPrompt: frame(opts.systemPrompt, appIdentity()) });
}

/** The model call as it comes from llmCore: no conduct, no framing. */
export async function generateRaw(opts = {}) {
  return coreGenerate(opts);
}

export default { generate, generateRaw };
