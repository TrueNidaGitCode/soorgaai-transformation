/**
 * Unit tests — frontend/login/login.js
 *
 * Design notes
 * ────────────
 * login.js evaluates `pendingRedirect = getValidRedirect()` at module-load
 * time by reading window.location.search.  Every test that depends on a
 * specific redirect param must:
 *   1. Call loadLoginModule(search) which vi.resetModules() + re-imports the
 *      module after setting window.location.search.
 *   2. Call the returned triggerDOMContentLoaded() to run checkExistingAuth()
 *      and wire up the form submit handler.
 *
 * loadLoginModule intercepts document.addEventListener so the DOMContentLoaded
 * handler is captured (not attached to the document).  This prevents handlers
 * from accumulating across tests when vi.resetModules() is used repeatedly.
 *
 * Mocks: global.fetch (vi.spyOn), window.location, localStorage.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLoginDOM() {
  document.body.innerHTML = `
    <form id="login-form">
      <input id="email"    type="email"    value="" />
      <input id="password" type="password" value="" />
      <button id="login-button">
        <span class="button-text" style="display:flex">Login</span>
        <span class="button-loader" style="display:none"></span>
      </button>
      <div id="error-message" style="display:none"></div>
    </form>
  `;
}

/** One event-loop turn — enough to flush resolved-Promise chains (real timers). */
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Resets the module registry, sets window.location.search, dynamically imports
 * login.js, and returns a helper that invokes the DOMContentLoaded handler
 * directly (without registering it on document).
 *
 * @param {string} search - The query string to set, e.g. '?redirect=/platform/'.
 */
async function loadLoginModule(search = '') {
  vi.resetModules();

  window.location = {
    href:     '',
    pathname: '/login/login.html',
    search,
    assign:   vi.fn(),
    replace:  vi.fn(),
  };

  let dclHandler = null;
  // Intercept addEventListener so the handler is captured but NOT registered.
  // Prevents handler accumulation on document across multiple loadLoginModule calls.
  const addSpy = vi.spyOn(document, 'addEventListener')
    .mockImplementation((evt, handler) => {
      if (evt === 'DOMContentLoaded') dclHandler = handler;
    });

  await import('../login/login.js');
  addSpy.mockRestore();   // restore document.addEventListener immediately

  return {
    /** Synchronously invoke the captured DOMContentLoaded handler. */
    triggerDOMContentLoaded() {
      dclHandler?.();
    },
  };
}

// ── getValidRedirect — valid relative paths ───────────────────────────────────

describe('getValidRedirect() — valid relative paths are accepted', () => {
  it('returns /platform/platform.html when redirect param is a valid absolute path', async () => {
    localStorage.setItem('token', 'jwt');
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=/platform/platform.html');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('/platform/platform.html');
  });

  it('returns a valid nested path redirect: /platform/sub/page', async () => {
    localStorage.setItem('token', 'jwt');
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=/platform/sub/page');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('/platform/sub/page');
  });

  it('falls back to dashboard when the redirect param is absent', async () => {
    localStorage.setItem('token', 'jwt');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('/dashboard/signaldashboard.html');
  });

  it('falls back to dashboard when ?redirect= is an empty string', async () => {
    localStorage.setItem('token', 'jwt');
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('/dashboard/signaldashboard.html');
  });
});

// ── getValidRedirect — security: open-redirect rejection ─────────────────────

describe('getValidRedirect() — security: open-redirect attacks are rejected', () => {
  /**
   * Helper: load module with an invalid redirect, trigger DOMContentLoaded
   * with a token, then assert the URL falls back to the safe default.
   */
  async function assertRedirectRejected(search) {
    localStorage.setItem('token', 'jwt');
    const { triggerDOMContentLoaded } = await loadLoginModule(search);
    triggerDOMContentLoaded();
    // pendingRedirect is null → falls back to the safe dashboard URL
    expect(window.location.href).toBe('/dashboard/signaldashboard.html');
  }

  it('rejects a protocol-relative URL: //evil.com', async () => {
    await assertRedirectRejected('?redirect=//evil.com');
  });

  it('rejects an absolute HTTP URL: http://evil.com', async () => {
    await assertRedirectRejected('?redirect=http://evil.com');
  });

  it('rejects an absolute HTTPS URL: https://evil.com', async () => {
    await assertRedirectRejected('?redirect=https://evil.com');
  });

  it('rejects a javascript: URI', async () => {
    await assertRedirectRejected('?redirect=javascript:alert(1)');
  });

  it('rejects a URL that does not start with /: relative-path', async () => {
    await assertRedirectRejected('?redirect=relative-path');
  });

  it('rejects an encoded protocol-relative URL: %2F%2Fevil.com (decoded = //evil.com)', async () => {
    // URLSearchParams.get() percent-decodes, so the guard sees //evil.com and rejects it.
    await assertRedirectRejected('?redirect=%2F%2Fevil.com');
  });
});

// ── checkExistingAuth — already authenticated ─────────────────────────────────

describe('checkExistingAuth() — token already in localStorage on page load', () => {
  it('redirects to the ?redirect= destination when a token is present', async () => {
    localStorage.setItem('token', 'jwt');
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=/platform/platform.html');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('/platform/platform.html');
  });

  it('redirects to localStorage redirectAfterLogin when no redirect param is set', async () => {
    localStorage.setItem('token', 'jwt');
    localStorage.setItem('redirectAfterLogin', '/signals/signal-page.html');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('/signals/signal-page.html');
  });

  it('clears redirectAfterLogin from localStorage after using it', async () => {
    localStorage.setItem('token', 'jwt');
    localStorage.setItem('redirectAfterLogin', '/signals/signal-page.html');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    expect(localStorage.getItem('redirectAfterLogin')).toBeNull();
  });

  it('redirects to /dashboard/signaldashboard.html when no redirect source is available', async () => {
    localStorage.setItem('token', 'jwt');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('/dashboard/signaldashboard.html');
  });
});

describe('checkExistingAuth() — no token on page load', () => {
  it('does not redirect when localStorage has no token', async () => {
    buildLoginDOM();
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=/platform/platform.html');
    triggerDOMContentLoaded();

    expect(window.location.href).toBe('');
  });
});

// ── handleLogin — successful authentication (200) ─────────────────────────────
//
// login.js uses setTimeout(..., 800) to delay the post-login redirect.
// We spy on globalThis.setTimeout and execute the callback immediately (synchronously)
// to avoid fake-timer / jsdom-navigation interactions.
// After the form submit, three microtask rounds flush the full async chain:
//   dispatchEvent → handleLogin → await fetch → await json → setTimeout(fn) → fn()

/** Mock that executes a setTimeout callback synchronously and immediately. */
function mockSetTimeoutSync() {
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => {
    fn();
    return 0;
  });
}

/** Flush three microtask ticks: fetch + json + post-json synchronous code. */
async function flushHandleLogin() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('handleLogin() — successful login (200 OK)', () => {
  it('stores the JWT token in localStorage after successful login', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'new-jwt', user: { email: 'user@test.com' } }),
    });
    mockSetTimeoutSync();
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'password123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushHandleLogin();

    expect(localStorage.getItem('token')).toBe('new-jwt');
  });

  it('stores the username derived from user.email when user.name is absent', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'new-jwt', user: { email: 'alice@example.com' } }),
    });
    mockSetTimeoutSync();
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'alice@example.com';
    document.getElementById('password').value = 'password123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushHandleLogin();

    expect(localStorage.getItem('username')).toBe('alice');
  });

  it('redirects to the ?redirect= destination after successful login', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'new-jwt' }),
    });
    mockSetTimeoutSync();
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=/platform/platform.html');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'password123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushHandleLogin();

    expect(window.location.href).toBe('/platform/platform.html');
  });

  it('redirects to dashboard when no redirect param is set', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'new-jwt' }),
    });
    mockSetTimeoutSync();
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'password123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushHandleLogin();

    expect(window.location.href).toBe('/dashboard/signaldashboard.html');
  });

  it('does not redirect to a rejected (malicious) redirect URL after successful login', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'new-jwt' }),
    });
    mockSetTimeoutSync();
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=//evil.com');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'password123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushHandleLogin();

    expect(window.location.href).not.toContain('evil.com');
    expect(window.location.href).toBe('/dashboard/signaldashboard.html');
  });
});

// ── handleLogin — failed authentication ──────────────────────────────────────

describe('handleLogin() — 401 Unauthorized from API', () => {
  it('shows an error message when the API returns 401', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    });
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=/platform/platform.html');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'wrongpass123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushPromises();

    const errorEl = document.getElementById('error-message');
    expect(errorEl.textContent).not.toBe('');
    expect(errorEl.style.display).toBe('block');
  });

  it('does not set a token in localStorage when login fails', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    });
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'wrongpass123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushPromises();

    expect(localStorage.getItem('token')).toBeNull();
  });

  it('does not redirect when the API returns 401 (redirect param is NOT honored)', async () => {
    buildLoginDOM();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    });
    const { triggerDOMContentLoaded } = await loadLoginModule('?redirect=/platform/platform.html');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'wrongpass123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flushPromises();

    expect(window.location.href).toBe('');
  });
});

// ── handleLogin — client-side form validation ─────────────────────────────────

describe('handleLogin() — client-side validation (no network call)', () => {
  it('shows an error and does not call fetch when email field is empty', async () => {
    buildLoginDOM();
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = '';
    document.getElementById('password').value = 'password123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.getElementById('error-message').style.display).toBe('block');
  });

  it('shows an error and does not call fetch when password field is empty', async () => {
    buildLoginDOM();
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = '';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.getElementById('error-message').style.display).toBe('block');
  });

  it('shows an error and does not call fetch when email format is invalid', async () => {
    buildLoginDOM();
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'not-an-email';
    document.getElementById('password').value = 'password123';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.getElementById('error-message').style.display).toBe('block');
  });

  it('shows an error and does not call fetch when password is shorter than 6 characters', async () => {
    buildLoginDOM();
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { triggerDOMContentLoaded } = await loadLoginModule('');
    triggerDOMContentLoaded();

    document.getElementById('email').value    = 'user@test.com';
    document.getElementById('password').value = 'short';
    document.getElementById('login-form').dispatchEvent(
      new Event('submit', { cancelable: true }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.getElementById('error-message').style.display).toBe('block');
  });
});
