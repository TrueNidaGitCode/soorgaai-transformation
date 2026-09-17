/**
 * Unit tests — frontend/shared/ctaRouter.js
 *
 * CTARouter is assigned to window at module load time.
 * Mocks: localStorage and window.location (stubbed by setup.js beforeEach).
 * No network calls; CTARouter does a synchronous token check only.
 *
 * ANONYMOUS is the one fact these tests keep asserting, and it has moved: the
 * anonymous destination was the site root, then became /cob.html, where the
 * prompt box that starts generation actually lives. These asserted the old
 * literal for long enough to stop meaning anything — read it from the router's
 * own contract so a deliberate move updates one line, not seven.
 */

import '../shared/ctaRouter.js';

const ANONYMOUS = '/cob.html';       // the prompt box, where generation starts
const SIGNED_IN = '/domain/domain.html';

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
  it('sets window.location.href to the landing page (prompt box)', () => {
    // localStorage cleared by setup.js — getItem('token') returns null

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe(ANONYMOUS);
  });

  it('does not navigate directly to the platform page when no token is present', () => {
    // Anonymous users go to the landing prompt box, never the blueprint view.
    window.CTARouter.routeToWorkspace();

    expect(window.location.href).not.toBe(SIGNED_IN);
    expect(window.location.href).toBe(ANONYMOUS);
  });
});

// ── Anonymous user — empty-string token ──────────────────────────────────────

describe('CTARouter.routeToWorkspace() — empty string token', () => {
  it('treats an empty-string token as unauthenticated and sends them to the prompt box', () => {
    localStorage.setItem('token', '');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe(ANONYMOUS);
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

    expect(window.location.href).toBe('/domain/domain.html');
  });
});

// ── Authenticated user ────────────────────────────────────────────────────────

describe('CTARouter.routeToWorkspace() — authenticated user', () => {
  it('sets window.location.href to /domain/domain.html for a valid JWT', () => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe('/domain/domain.html');
  });

  it('routes to platform for any non-empty token string', () => {
    localStorage.setItem('token', 'any-opaque-string');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).toBe('/domain/domain.html');
  });

  it('does not navigate to the login page when a valid token is present', () => {
    localStorage.setItem('token', 'valid-jwt');

    window.CTARouter.routeToWorkspace();

    expect(window.location.href).not.toContain('/login/');
  });
});

// ── Isolation: reads localStorage fresh on every call ────────────────────────

describe('CTARouter.routeToWorkspace() — reads localStorage on every invocation', () => {
  it('switches back to the anonymous route when the token is removed between calls', () => {
    localStorage.setItem('token', 'jwt');
    window.CTARouter.routeToWorkspace();
    expect(window.location.href).toBe(SIGNED_IN);

    // Simulate token expiry / manual removal
    window.location.href = '';
    localStorage.removeItem('token');

    window.CTARouter.routeToWorkspace();
    expect(window.location.href).toBe(ANONYMOUS);
  });
});
