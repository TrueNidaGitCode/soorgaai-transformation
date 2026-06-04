/**
 * Unit tests — frontend/platform/platform.js
 *
 * platform.js attaches a single DOMContentLoaded listener at import time.
 * That one listener fires on every manual dispatchEvent call, keeping tests
 * isolated without handler accumulation.
 *
 * setup.js resets DOM, localStorage, window.location, and vi mocks before
 * each test — no extra teardown needed here.
 *
 * Mocks: global.fetch (vi.spyOn — auto-restored by vi.restoreAllMocks).
 */

import '../platform/platform.js';

// ── DOM fixture ───────────────────────────────────────────────────────────────

function buildPlatformDOM() {
  document.body.innerHTML = `
    <p id="platform-greeting"></p>
    <div id="platform-loading" style="display:block"></div>
    <div id="platform-content" style="display:none">
      <article class="workspace-card">
        <h2 class="workspace-card__title">Assessments</h2>
      </article>
      <article class="workspace-card">
        <h2 class="workspace-card__title">Roadmaps</h2>
      </article>
      <article class="workspace-card">
        <h2 class="workspace-card__title">Benchmark Reports</h2>
      </article>
      <article class="workspace-card">
        <h2 class="workspace-card__title">AI Recommendations</h2>
      </article>
    </div>
  `;
}

// ── Fetch mock factories ──────────────────────────────────────────────────────

function mockFetchOk(userData = { user: { name: 'Alice' } }) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => userData,
  });
}

function mockFetch401() {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Unauthorized' }),
  });
}

function mockFetch500() {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: 'Internal Server Error' }),
  });
}

/**
 * Dispatches DOMContentLoaded and waits for the async handler to fully settle.
 * Three microtask rounds cover: outer async body → `await fetch` → `await .json()`.
 */
async function triggerLoad() {
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ── No token — redirect guard ─────────────────────────────────────────────────

describe('platform auth guard — no token in localStorage', () => {
  it('redirects to the login page when no token is present', async () => {
    buildPlatformDOM();

    await triggerLoad();

    expect(window.location.href).toBe('/login/login.html?redirect=/platform/platform.html');
  });

  it('includes a ?redirect= param pointing back to platform in the login URL', async () => {
    buildPlatformDOM();

    await triggerLoad();

    expect(window.location.href).toContain('redirect=/platform/platform.html');
  });

  it('does not call fetch when no token is present', async () => {
    buildPlatformDOM();
    const fetchSpy = vi.spyOn(global, 'fetch');

    await triggerLoad();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ── Valid token — 200 OK ──────────────────────────────────────────────────────

describe('platform auth guard — valid token, 200 response', () => {
  it('calls /api/users/me with an Authorization: Bearer header', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    const fetchSpy = mockFetchOk();

    await triggerLoad();

    expect(fetchSpy).toHaveBeenCalledWith('/api/users/me', {
      headers: { Authorization: 'Bearer valid-jwt' },
    });
  });

  it('renders greeting using user.name from the API response', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetchOk({ user: { name: 'Alice' } });

    await triggerLoad();

    expect(document.getElementById('platform-greeting').textContent)
      .toBe('Welcome back, Alice.');
  });

  it('falls back to email prefix for greeting when user.name is absent', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetchOk({ user: { email: 'bob@example.com' } });

    await triggerLoad();

    expect(document.getElementById('platform-greeting').textContent)
      .toBe('Welcome back, bob.');
  });

  it('falls back to localStorage username when API response has no name or email', async () => {
    localStorage.setItem('token', 'valid-jwt');
    localStorage.setItem('username', 'charlie');
    buildPlatformDOM();
    mockFetchOk({ user: {} });

    await triggerLoad();

    expect(document.getElementById('platform-greeting').textContent)
      .toBe('Welcome back, charlie.');
  });

  it('falls back to "there" when no user identity is derivable', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetchOk({ user: {} });

    await triggerLoad();

    expect(document.getElementById('platform-greeting').textContent)
      .toBe('Welcome back, there.');
  });

  it('hides platform-loading after successful auth', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetchOk();

    await triggerLoad();

    expect(document.getElementById('platform-loading').style.display).toBe('none');
  });

  it('shows platform-content after successful auth', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetchOk();

    await triggerLoad();

    expect(document.getElementById('platform-content').style.display).toBe('block');
  });

  it('does not redirect when auth succeeds', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetchOk();

    await triggerLoad();

    expect(window.location.href).toBe('');
  });

  it('all four workspace cards are present in the DOM after successful auth', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetchOk();

    await triggerLoad();

    const titles = [...document.querySelectorAll('.workspace-card__title')]
      .map(el => el.textContent);

    expect(titles).toContain('Assessments');
    expect(titles).toContain('Roadmaps');
    expect(titles).toContain('Benchmark Reports');
    expect(titles).toContain('AI Recommendations');
  });
});

// ── 401 Unauthorized ──────────────────────────────────────────────────────────

describe('platform auth guard — 401 Unauthorized', () => {
  it('removes the token from localStorage on 401', async () => {
    localStorage.setItem('token', 'expired-jwt');
    buildPlatformDOM();
    mockFetch401();

    await triggerLoad();

    expect(localStorage.getItem('token')).toBeNull();
  });

  it('redirects to the login page on 401', async () => {
    localStorage.setItem('token', 'expired-jwt');
    buildPlatformDOM();
    mockFetch401();

    await triggerLoad();

    expect(window.location.href).toBe('/login/login.html?redirect=/platform/platform.html');
  });

  it('does not show platform content on 401', async () => {
    localStorage.setItem('token', 'expired-jwt');
    buildPlatformDOM();
    mockFetch401();

    await triggerLoad();

    expect(document.getElementById('platform-content').style.display).toBe('none');
  });
});

// ── 500 Server error ──────────────────────────────────────────────────────────

describe('platform auth guard — 500 server error (graceful degradation)', () => {
  it('shows platform-content on 500 (no hard redirect)', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetch500();

    await triggerLoad();

    expect(document.getElementById('platform-content').style.display).toBe('block');
  });

  it('renders no greeting text on 500', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetch500();

    await triggerLoad();

    expect(document.getElementById('platform-greeting').textContent).toBe('');
  });

  it('does not redirect to login on 500', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetch500();

    await triggerLoad();

    expect(window.location.href).toBe('');
  });

  it('does not clear the token from localStorage on 500', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    mockFetch500();

    await triggerLoad();

    expect(localStorage.getItem('token')).toBe('valid-jwt');
  });
});

// ── Network failure ───────────────────────────────────────────────────────────

describe('platform auth guard — network failure (fetch rejects)', () => {
  it('shows platform-content when fetch throws a network error', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await triggerLoad();

    expect(document.getElementById('platform-content').style.display).toBe('block');
  });

  it('does not redirect to login on a network error', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await triggerLoad();

    expect(window.location.href).toBe('');
  });

  it('does not clear the token on a network error', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await triggerLoad();

    expect(localStorage.getItem('token')).toBe('valid-jwt');
  });
});

// ── CONFIG verify URL override ────────────────────────────────────────────────

describe('platform auth guard — window.CONFIG.AUTH.VERIFY override', () => {
  afterEach(() => {
    delete window.CONFIG;
  });

  it('uses CONFIG.AUTH.VERIFY endpoint when defined', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    window.CONFIG = { AUTH: { VERIFY: '/api/v2/auth/verify' } };
    const fetchSpy = mockFetchOk();

    await triggerLoad();

    expect(fetchSpy).toHaveBeenCalledWith('/api/v2/auth/verify', expect.any(Object));
  });

  it('falls back to /api/users/me when window.CONFIG is not defined', async () => {
    localStorage.setItem('token', 'valid-jwt');
    buildPlatformDOM();
    window.CONFIG = undefined;
    const fetchSpy = mockFetchOk();

    await triggerLoad();

    expect(fetchSpy).toHaveBeenCalledWith('/api/users/me', expect.any(Object));
  });
});
