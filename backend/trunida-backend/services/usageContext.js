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
 * Mark this request as anonymous-but-real.
 *
 * A guest preview has no account, so nothing was attributed and nothing was
 * recorded — the free tier was the one thing Svarg pays for and could not
 * measure. This does not identify anyone; it says "this spend was a preview",
 * which is the only distinction the ledger needs.
 */
export function attributeGuest(guestId) {
  const store = storage.getStore();
  if (store) { store.guest = true; store.guestId = guestId || ''; }
}

/**
 * Start accounting for one piece of work — a blueprint run, a build.
 *
 * The ledger answers "what did this month cost". This answers "what did THAT
 * cost", which is the question anyone asks after watching a provider bill go
 * up. Lives on the request store, so a run started fire-and-forget inside a
 * request keeps accumulating after the response has gone.
 */
export function beginRun(label) {
  const store = storage.getStore();
  if (!store) return null;
  store.run = {
    label: label || 'run',
    calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0,
    startedAt: Date.now(),
  };
  return store.run;
}

/** @returns {object|null} the run in progress, if any. */
export function currentRun() {
  return storage.getStore()?.run || null;
}

/**
 * Log what the run in progress has cost, and return it.
 *
 * One line, at the end of the work, naming the number anyone actually wants:
 * "[cost] guest preview 68b… : 6 calls, 41,220 in / 9,840 out, $0.0312 in 47s".
 * Reading that off a deploy log is the difference between knowing what a
 * blueprint costs and inferring it from a provider bill a week later.
 */
export function reportRun(extra = '') {
  const run = currentRun();
  if (!run || !run.calls) return null;
  const secs = Math.round((Date.now() - run.startedAt) / 1000);
  // The currency symbol is concatenated rather than interpolated. Written as
  // `$${...}` inside a template literal it has now been eaten twice by the
  // escaping between an edit script and this file, leaving a bare number that
  // reads as tokens rather than dollars.
  const usd = '$' + run.costUsd.toFixed(4);
  console.log(
    `[cost] ${run.label}: ${run.calls} calls, `
    + `${run.inputTokens.toLocaleString('en-US')} in / ${run.outputTokens.toLocaleString('en-US')} out, `
    + `${usd} in ${secs}s${extra ? ' — ' + extra : ''}`
  );
  return run;
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

/** @returns {{userId: string|null, stage: string, guest?: boolean}} — never null. */
export function currentUsage() {
  return storage.getStore() || { userId: null, stage: '', guest: false };
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
