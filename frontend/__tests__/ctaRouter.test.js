/**
 * Unit tests — frontend/shared/ctaRouter.js
 *
 * CTARouter is assigned to window at module load time.
 * Mocks: localStorage and window.location (stubbed by setup.js beforeEach).
 * No network calls; CTARouter does a synchronous token check only.
 */

import '../shared/ctaRouter.js';

// ── Global exposure ───────────────────────────────────────────────────────────

describe('window.CTARouter — global exposure', () => {
  it('window.CTARouter is defined after module load', () => {
    expect(window.CTARouter).toBeDefined();
  });

  it('routeToWorkspace is a callable function', () => {
    expect(typeof window.CTARouter.routeToWorkspace).toBe('function');
  });
});

// ── Anonymous user — null token ───────────────────────────────────────────────

describe('CTARouter.routeToWorkspace() — anonymous user (null token)', () => {
  it('sets window.location.href to the login page with a redirect param', () => {
    // localStorage cleared by setup.js — getItem('token') returns null

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe('/login/login.html?redirect=/platform/platform.html');
  });

  it('does not navigate directly to the platform page when no token is present', () => {
    // The redirect URL /login/...?redirect=/platform/platform.html contains the platform path as a
    // query param, so we check the href is NOT equal to the bare platform URL.
    window.CTARouter.routeToWorkspace();

    expect(window.location.href).not.toBe('/platform/platform.html');
    expect(window.location.href).toContain('/login/');
  });
});

// ── Anonymous user — empty-string token ──────────────────────────────────────

describe('CTARouter.routeToWorkspace() — empty string token', () => {
  it('treats an empty-string token as unauthenticated and routes to login', () => {
    localStorage.setItem('token', '');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe('/login/login.html?redirect=/platform/platform.html');
  });
});

// ── Edge case — whitespace-only token ────────────────────────────────────────

describe('CTARouter.routeToWorkspace() — whitespace-only token', () => {
  it('routes to PLATFORM for "   " — whitespace is truthy in JS (documents actual behavior)', () => {
    // The implementation uses `if (!token)` without trimming.
    // A whitespace-only string is truthy, so the guard passes and the user is
    // sent to the platform page (the platform page's own auth guard then applies).
    localStorage.setItem('token', '   ');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe('/platform/platform.html');
  });
});

// ── Authenticated user ────────────────────────────────────────────────────────

describe('CTARouter.routeToWorkspace() — authenticated user', () => {
  it('sets window.location.href to /platform/platform.html for a valid JWT', () => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe('/platform/platform.html');
  });

  it('routes to platform for any non-empty token string', () => {
    localStorage.setItem('token', 'any-opaque-string');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe('/platform/platform.html');
  });

  it('does not navigate to the login page when a valid token is present', () => {
    localStorage.setItem('token', 'valid-jwt');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).not.toContain('/login/');
  });
});

// ── Isolation: reads localStorage fresh on every call ────────────────────────

describe('CTARouter.routeToWorkspace() — reads localStorage on every invocation', () => {
  it('switches from platform to login route when token is removed between calls', () => {
    localStorage.setItem('token', 'jwt');
    window.CTARouter.routeToWorkspace();
    expect(window.location.href).toBe('/platform/platform.html');

    // Simulate token expiry / manual removal
    window.location.href = '';
    localStorage.removeItem('token');

    window.CTARouter.routeToWorkspace();
    expect(window.location.href).toBe('/login/login.html?redirect=/platform/platform.html');
  });
});
