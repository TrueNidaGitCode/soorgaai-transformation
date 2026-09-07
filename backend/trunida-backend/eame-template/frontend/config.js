/**
 * Svarg — runtime configuration for the delivered application.
 *
 * Fixed runtime. Eame does not write this file, and the generated frontend
 * should not need to think about either thing it does.
 *
 * ── Why the API base is relative ───────────────────────────────────────────
 *
 * server.js serves this page AND mounts the API on the same Express app, so
 * the API is always same-origin. This used to ship as a literal
 * 'http://localhost:3000/api' with a comment asking whoever deployed it to
 * edit the file. Nobody did, and for a Svarg-hosted tenant nobody can: every
 * request from the deployed page went to the reader's own machine and failed.
 * A relative base is correct in every environment — local, Railway, a custom
 * domain — and there is nothing left to remember.
 *
 * ── Why the session is minted here ─────────────────────────────────────────
 *
 * Every route the application exposes is behind `protect`, and a visitor
 * arrives with no token. server.js offers POST /api/session for exactly this
 * and it is the runtime's job to call it, not the generated code's: the app
 * shipped reading localStorage for a token that nothing ever wrote, so every
 * click returned 401. Doing it in the fetch layer means it works whether or
 * not the generated frontend knows this endpoint exists.
 */
(function () {
  const API_BASE = window.location.origin + '/api';

  let tokenPromise = null;

  /** Mint once per page load; every caller awaits the same request. */
  function session() {
    if (!tokenPromise) {
      tokenPromise = fetch(API_BASE + '/session', { method: 'POST' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('session ' + r.status))))
        .then(d => {
          if (d.token) localStorage.setItem('token', d.token);
          return d.token || '';
        })
        .catch(err => {
          // A deployment with public access off is a configuration choice, not
          // a fault: the app is expected to carry its own sign-in. Reset so a
          // later call can retry rather than caching the failure forever.
          console.warn('[config] no public session —', err.message);
          tokenPromise = null;
          return '';
        });
    }
    return tokenPromise;
  }

  const nativeFetch = window.fetch.bind(window);

  /**
   * Attach the session token to the application's own API calls.
   *
   * Scoped to same-origin /api requests, and never overwrites an Authorization
   * header the caller set — an application that brings its own sign-in keeps
   * it. A 401 is retried exactly once with a freshly minted token, which is
   * what makes an expired tab recover instead of erroring on every click.
   */
  window.fetch = async function (input, init = {}) {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    const url = new URL(raw, window.location.origin);
    const ours = url.origin === window.location.origin
      && url.pathname.startsWith('/api/')
      && url.pathname !== '/api/session';

    if (!ours) return nativeFetch(input, init);

    const headers = new Headers(init.headers || (input && input.headers) || {});
    if (!headers.get('Authorization')) {
      const t = (await session()) || localStorage.getItem('token') || '';
      if (t) headers.set('Authorization', 'Bearer ' + t);
    }

    let res = await nativeFetch(input, { ...init, headers });
    if (res.status === 401) {
      localStorage.removeItem('token');
      tokenPromise = null;
      const t = await session();
      if (t) {
        headers.set('Authorization', 'Bearer ' + t);
        res = await nativeFetch(input, { ...init, headers });
      }
    }
    return res;
  };

  window.CONFIG = {
    API_BASE,
    /** Await this before the first call if you want the token in hand early. */
    ready: session(),
    session,
    authHeaders: async () => ({
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ((await session()) || ''),
    }),
  };
})();
