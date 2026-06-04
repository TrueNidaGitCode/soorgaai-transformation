/**
 * Unit tests — frontend/profile-setup/profile.js
 *
 * Pattern mirrors login.test.js:
 *  - vi.resetModules() + dynamic import per test (module evaluates window.location at load time).
 *  - document.addEventListener intercepted to capture DOMContentLoaded handler.
 *  - fetch mocked via vi.spyOn(global, 'fetch').
 *  - window.location stubbed by setup.js beforeEach.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildProfileDOM() {
  document.body.innerHTML = `
    <form id="profile-form">
      <input id="orgName"         type="text"   value="" />
      <select id="role">
        <option value="">Select</option>
        <option value="CTO">CTO</option>
        <option value="Engineering Manager">Engineering Manager</option>
      </select>
      <select id="industryDomain">
        <option value="">Select</option>
        <option value="ADAS">ADAS</option>
        <option value="General">General</option>
      </select>
      <div id="profile-error" style="display:none"></div>
      <button id="profile-submit" type="submit">
        <span class="button-text">Submit</span>
        <span class="button-loader" style="display:none"></span>
      </button>
    </form>
  `;
}

const flushPromises = () => new Promise(r => setTimeout(r, 0));

async function loadProfileModule() {
  vi.resetModules();
  window.location = {
    href:     '',
    pathname: '/profile-setup/profile.html',
    hostname: '127.0.0.1',
    search:   '',
    assign:   vi.fn(),
    replace:  vi.fn(),
  };

  let dclHandler = null;
  const spy = vi.spyOn(document, 'addEventListener').mockImplementation((evt, fn) => {
    if (evt === 'DOMContentLoaded') dclHandler = fn;
  });

  await import('../profile-setup/profile.js');
  spy.mockRestore();

  return {
    triggerDOMContentLoaded: () => dclHandler?.(),
  };
}

// ── Auth guard — no JWT ───────────────────────────────────────────────────────

describe('profile.js — auth guard', () => {
  it('redirects to login when no token is in localStorage', async () => {
    // No token set — localStorage cleared by setup.js
    const { triggerDOMContentLoaded } = await loadProfileModule();
    buildProfileDOM();
    triggerDOMContentLoaded();
    await flushPromises();

    expect(window.location.href).toContain('/login/login.html');
  });
});

// ── Skip setup — profile already exists ──────────────────────────────────────

describe('profile.js — profile already exists', () => {
  it('redirects to workspace when GET /api/profile/me returns 200', async () => {
    localStorage.setItem('token', 'valid-jwt');
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ profile: { orgName: 'Acme' } }),
    });
    const { triggerDOMContentLoaded } = await loadProfileModule();
    buildProfileDOM();
    triggerDOMContentLoaded();
    await flushPromises();

    expect(window.location.href).toContain('/workspace/workspace.html');
  });
});

// ── Form validation — client-side ─────────────────────────────────────────────

describe('profile.js — client-side validation', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'valid-jwt');
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false, status: 404, json: async () => ({ error: 'Not found' }),
    });
  });

  it('shows error and does not call POST /api/profile when orgName is empty', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (url.includes('/profile/me')) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
    });

    const { triggerDOMContentLoaded } = await loadProfileModule();
    buildProfileDOM();
    triggerDOMContentLoaded();
    await flushPromises();

    document.getElementById('role').value          = 'CTO';
    document.getElementById('industryDomain').value = 'ADAS';
    document.getElementById('orgName').value        = '';

    document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));

    const errorEl = document.getElementById('profile-error');
    expect(errorEl.style.display).toBe('block');
    // POST should not have been called — only the GET /profile/me probe
    const postCalls = fetchSpy.mock.calls.filter(([url, opts]) => opts?.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('shows error when role is not selected', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    const { triggerDOMContentLoaded } = await loadProfileModule();
    buildProfileDOM();
    triggerDOMContentLoaded();
    await flushPromises();

    document.getElementById('orgName').value         = 'Acme';
    document.getElementById('role').value            = '';
    document.getElementById('industryDomain').value  = 'ADAS';

    document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));

    expect(document.getElementById('profile-error').style.display).toBe('block');
  });
});

// ── Successful profile creation ───────────────────────────────────────────────

describe('profile.js — successful profile creation', () => {
  it('redirects to workspace on 201 response from POST /api/profile', async () => {
    localStorage.setItem('token', 'valid-jwt');

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (url.includes('/profile/me')) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true, status: 201,
        json: async () => ({ profile: { orgName: 'Acme' }, created: true }),
      });
    });

    const { triggerDOMContentLoaded } = await loadProfileModule();
    buildProfileDOM();
    triggerDOMContentLoaded();
    // Flush: GET /profile/me + json response
    await Promise.resolve(); await Promise.resolve();

    document.getElementById('orgName').value         = 'Acme Motors GmbH';
    document.getElementById('role').value            = 'CTO';
    document.getElementById('industryDomain').value  = 'ADAS';

    document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
    // Flush: POST fetch + json response + redirect assignment
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    expect(window.location.href).toContain('/workspace/workspace.html');
  });
});

// ── API error ─────────────────────────────────────────────────────────────────

describe('profile.js — API error on form submit', () => {
  it('shows error message when POST /api/profile returns an error', async () => {
    localStorage.setItem('token', 'valid-jwt');

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (url.includes('/profile/me')) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: false, status: 500,
        json: async () => ({ error: 'Failed to save profile. Please try again.' }),
      });
    });

    const { triggerDOMContentLoaded } = await loadProfileModule();
    buildProfileDOM();
    triggerDOMContentLoaded();
    await flushPromises();

    document.getElementById('orgName').value         = 'Acme';
    document.getElementById('role').value            = 'CTO';
    document.getElementById('industryDomain').value  = 'ADAS';

    document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    const errorEl = document.getElementById('profile-error');
    expect(errorEl.style.display).toBe('block');
    expect(errorEl.textContent.length).toBeGreaterThan(0);
  });

  it('does NOT redirect to workspace when POST returns an error', async () => {
    localStorage.setItem('token', 'valid-jwt');

    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (url.includes('/profile/me')) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: false, status: 400,
        json: async () => ({ error: 'Invalid role.' }),
      });
    });

    const { triggerDOMContentLoaded } = await loadProfileModule();
    buildProfileDOM();
    triggerDOMContentLoaded();
    await flushPromises();

    document.getElementById('orgName').value         = 'Acme';
    document.getElementById('role').value            = 'CTO';
    document.getElementById('industryDomain').value  = 'ADAS';

    document.getElementById('profile-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(window.location.href).toBe('');
  });
});
