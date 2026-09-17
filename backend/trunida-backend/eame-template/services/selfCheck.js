/**
 * What is actually true about this application right now.
 *
 * `/api` used to answer `status: 'running'` — a string literal, returned
 * identically whether the database was reachable, the datasets readable, the
 * model configured, or none of the above. It said running because it had been
 * written to say running.
 *
 * That is not a hypothetical failure. A delivered application sat crashed for
 * a week while Svarg's sweep read it as live, because the only question anyone
 * asked was whether the address answered. Railway's edge answers. The
 * application did not.
 *
 * So this reports what it can verify, and nothing it cannot:
 *
 *   database    is the connection actually open
 *   datasets    can the index be read, and does it hold anything
 *   model       is there a provider configured to answer with
 *   sign-in     can anybody get in — a key, Svarg, or open access
 *   access      how many seats, and how many are used
 *
 * Every check is cheap and local. Nothing here calls the model or spends
 * anything: a health endpoint that costs money is one nobody dares poll.
 */

import mongoose from 'mongoose';

/** A check that throws is a failed check, never a failed health endpoint. */
async function attempt(name, fn) {
  try {
    const out = await fn();
    return { name, ...out };
  } catch (err) {
    return { name, ok: false, detail: err.message.slice(0, 160) };
  }
}

const READY = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export async function selfCheck() {
  const checks = [];

  checks.push(await attempt('database', async () => {
    const state = mongoose.connection.readyState;
    return state === 1
      ? { ok: true, detail: 'connected' }
      : { ok: false, detail: READY[state] || `state ${state}` };
  }));

  checks.push(await attempt('datasets', async () => {
    // Imported here rather than at module load: a delivered application that
    // cannot read its own connector layer should report that, not fail to
    // start the health endpoint along with everything else.
    const { readIndex } = await import('./connectorService.js');
    const index = readIndex();
    if (!Array.isArray(index)) return { ok: false, detail: 'the dataset index could not be read' };
    return index.length
      ? { ok: true, detail: `${index.length} dataset${index.length === 1 ? '' : 's'}` }
      : { ok: false, detail: 'no datasets are configured' };
  }));

  checks.push(await attempt('model', async () => {
    const chain = (process.env.PROVIDER_CHAIN || 'gemini,claude,openai').split(',').map(s => s.trim());
    const keyed = chain.filter(p => (
      (p === 'gemini' && (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) ||
      (p === 'claude' && process.env.ANTHROPIC_API_KEY) ||
      (p === 'openai' && process.env.OPENAI_API_KEY) ||
      (p === 'selfhosted' && process.env.SELFHOSTED_BASE_URL)
    ));
    // Configured, not reachable. Asking a provider whether it is up costs
    // money on every poll, and the question here is whether this application
    // was wired up — which is the thing that actually goes wrong.
    return keyed.length
      ? { ok: true, detail: `${keyed.join(', ')} configured` }
      : { ok: false, detail: 'no model provider is configured' };
  }));

  checks.push(await attempt('sign-in', async () => {
    if (process.env.SVARG_AUTH_URL && process.env.SVARG_AUTH_SECRET) {
      return { ok: true, detail: 'through Svarg' };
    }
    if (process.env.APP_PUBLIC_ACCESS === 'true') return { ok: true, detail: 'open access' };
    if (process.env.APP_OWNER_KEY) return { ok: true, detail: 'owner key only' };
    return { ok: false, detail: 'nobody can sign in — no Svarg sign-in, no owner key, no open access' };
  }));

  checks.push(await attempt('access', async () => {
    const seats = parseInt(process.env.APP_SEATS || '', 10);
    /*
     * Not asked when the database is down.
     *
     * Mongoose buffers a query against a dead connection and resolves it ten
     * seconds later, so this check alone made the health endpoint take ten
     * seconds to answer — precisely when something was wrong, and well past
     * the five-second timeout the sweep polls it with. A health check that
     * hangs while unhealthy reports nothing at all.
     */
    if (mongoose.connection.readyState !== 1) {
      return { ok: true, detail: 'not counted — the database is not connected' };
    }
    const used = await mongoose.connection.collection('svarg_users').countDocuments({});
    if (!Number.isFinite(seats) || seats <= 0) {
      return { ok: true, detail: `${used} ${used === 1 ? 'person' : 'people'}, no seat limit` };
    }
    // Over the limit is worth saying and is not a failure: people who already
    // had an account are never turned away, by design.
    return { ok: true, detail: `${used} of ${seats} seat${seats === 1 ? '' : 's'} used`, over: used > seats };
  }));

  const failed = checks.filter(c => !c.ok);
  return {
    ok: failed.length === 0,
    checks,
    // The one line a human or a sweep reads first.
    summary: failed.length
      ? failed.map(c => `${c.name}: ${c.detail}`).join('; ')
      : 'everything this application needs is in place',
  };
}
