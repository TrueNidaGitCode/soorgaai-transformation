/**
 * Unit tests — frontend/login/authState.js
 *
 * Tests both the named ES module exports (isAuthenticated, getRoadmapHref)
 * and the window.SoorgaAuth global set for classic-script consumers.
 */

import { isAuthenticated, getRoadmapHref } from '../login/authState.js';

// ── isAuthenticated ───────────────────────────────────────────────────────────

describe('isAuthenticated', () => {
  it('returns true when a JWT token is present in localStorage', () => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiJ9.payload.sig');

    const result = isAuthenticated();

    expect(result).toBe(true);
  });

  it('returns false when no token key exists in localStorage', () => {
    // localStorage cleared in beforeEach (setup.js)

    const result = isAuthenticated();

    expect(result).toBe(false);
  });

  it('returns false when the token value is an empty string', () => {
    localStorage.setItem('token', '');

    const result = isAuthenticated();

    expect(result).toBe(false);
  });

  it('returns false gracefully when localStorage.getItem throws (private-browsing simulation)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage access denied');
    });

    const result = isAuthenticated();

    expect(result).toBe(false);
  });

  it('does not throw when called with any localStorage state', () => {
    localStorage.setItem('token', null);

    expect(() => isAuthenticated()).not.toThrow();
  });

  it('is idempotent — returns the same result on successive calls without state change', () => {
    localStorage.setItem('token', 'stable-token');

    const first  = isAuthenticated();
    const second = isAuthenticated();

    expect(first).toBe(second);
  });

  it('reflects a token that is added after module import', () => {
    // token absent initially
    expect(isAuthenticated()).toBe(false);

    // add the token
    localStorage.setItem('token', 'late-token');

    expect(isAuthenticated()).toBe(true);
  });

  it('reflects a token that is removed after it was present', () => {
    localStorage.setItem('token', 'abc');
    expect(isAuthenticated()).toBe(true);

    localStorage.removeItem('token');

    expect(isAuthenticated()).toBe(false);
  });
});

// ── getRoadmapHref ────────────────────────────────────────────────────────────

describe('getRoadmapHref', () => {
  it('returns a non-empty string', () => {
    const href = getRoadmapHref();

    expect(typeof href).toBe('string');
    expect(href.trim().length).toBeGreaterThan(0);
  });

  it('returns a URL path that starts with /', () => {
    const href = getRoadmapHref();

    expect(href.startsWith('/')).toBe(true);
  });

  it('returns the dynamic assessment start URL for all users (current open-access implementation)', () => {
    const href = getRoadmapHref();

    expect(href).toBe('/dynamic-assessment/start.html');
  });

  it('returns the same value regardless of authentication state', () => {
    localStorage.removeItem('token');
    const unauthenticated = getRoadmapHref();

    localStorage.setItem('token', 'any-token');
    const authenticated = getRoadmapHref();

    expect(unauthenticated).toBe(authenticated);
  });

  it('is idempotent — returns the same value on successive calls', () => {
    const first  = getRoadmapHref();
    const second = getRoadmapHref();

    expect(first).toBe(second);
  });

  // When a premium auth gate is introduced, remove the skip and implement these:
  it.todo('returns /assessment/assessment.html when user is authenticated (pending auth gate)');
  it.todo('returns /login/signup.html?next=/assessment/assessment.html when unauthenticated (pending auth gate)');
});

// ── window.SoorgaAuth global ──────────────────────────────────────────────────

describe('window.SoorgaAuth global (for classic-script consumers)', () => {
  it('is defined after the module loads', () => {
    expect(window.SoorgaAuth).toBeDefined();
  });

  it('exposes isAuthenticated as a function', () => {
    expect(typeof window.SoorgaAuth.isAuthenticated).toBe('function');
  });

  it('exposes getRoadmapHref as a function', () => {
    expect(typeof window.SoorgaAuth.getRoadmapHref).toBe('function');
  });

  it('window.SoorgaAuth.isAuthenticated returns the same result as the named export', () => {
    localStorage.setItem('token', 'shared-token');

    expect(window.SoorgaAuth.isAuthenticated()).toBe(isAuthenticated());
  });

  it('window.SoorgaAuth.getRoadmapHref returns the same result as the named export', () => {
    expect(window.SoorgaAuth.getRoadmapHref()).toBe(getRoadmapHref());
  });
});
