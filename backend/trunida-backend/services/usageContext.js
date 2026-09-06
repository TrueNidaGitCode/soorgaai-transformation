/**
 * Svarg — who a model call is for
 *
 * The ledger has to attribute every generation to an account, and there are
 * roughly thirty call sites reaching generate(). Threading a userId through
 * all of them would attribute the ones anyone remembered to change, and a cost
 * ledger that silently under-reports is worse than none — it reads as
 * measurement while being a sample.
 *
 * So the request carries it instead. An AsyncLocalStorage store is opened per
 * request and the auth middleware fills in the user; every generate() inside
 * that request reads it without knowing it exists.
 *
 * ── It survives the response ───────────────────────────────────────────────
 *
 * Blueprint generation is deliberately fire-and-forget: the handler returns an
 * id and the work continues for minutes afterwards. That async chain was
 * started inside the request, so it keeps the store — which is the whole
 * reason this is AsyncLocalStorage and not a request-scoped variable. The
 * expensive part of Svarg happens after the response, and attributing only
 * what finishes before it would miss almost all of the spend.
 *
 * The store is mutable on purpose: it is created before the JWT is verified,
 * because the middleware that creates it runs before the one that reads the
 * token.
 */

import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage();

/** Express middleware: open a store for this request and everything it starts. */
export function usageContextMiddleware(req, res, next) {
  storage.run({ userId: null, stage: '' }, () => next());
}

/** Called by the auth middleware once the token has been verified. */
export function attributeTo(userId) {
  const store = storage.getStore();
  if (store) store.userId = userId || null;
}

/**
 * Name the pipeline stage for the current request.
 *
 * Optional. Unset, the stage is derived from the call's label, which is right
 * often enough — this is for the cases where it is not.
 */
export function setUsageStage(stage) {
  const store = storage.getStore();
  if (store) store.stage = stage || '';
}

/** @returns {{userId: string|null, stage: string}} — never null. */
export function currentUsage() {
  return storage.getStore() || { userId: null, stage: '' };
}

/**
 * Run something under an explicit attribution.
 *
 * For work with no request behind it — a cron job, a script, a background
 * recovery pass — that should still land in the ledger.
 */
export function runAttributed({ userId, stage }, fn) {
  return storage.run({ userId: userId || null, stage: stage || '' }, fn);
}
