/**
 * Sign-in for delivered applications, brokered through Svarg: the secret is
 * derived and stable, the environment carries the door, Svarg only sends
 * people back to the address it has on record, an assertion is good for
 * one application only, and the application turns it into its own session.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const DEP = { _id: '66f1a2b3c4d5e6f708192a3b', railway: { url: 'https://app-production-94d4.up.railway.app' } };

describe('the tenant secret and environment', () => {
  const ORIGINAL = process.env.JWT_SECRET;
  beforeEach(() => { process.env.JWT_SECRET = 'svarg-root'; });
  afterEach(() => { process.env.JWT_SECRET = ORIGINAL; });

  it('derives the same secret every time, a different one per application, none without a root', async () => {
    const { tenantAuthSecret } = await import('../services/tenantAuthService.js');
    const a = tenantAuthSecret(DEP._id);
    expect(a).toHaveLength(64);
    expect(tenantAuthSecret(DEP._id)).toBe(a);
    expect(tenantAuthSecret('66f1a2b3c4d5e6f708192a3c')).not.toBe(a);
    process.env.JWT_SECRET = '';
    expect(tenantAuthSecret(DEP._id)).toBe('');
  });

  it('gives the environment the door and the secret, on the gateway origin', async () => {
    const { tenantAuthEnv, tenantAuthSecret } = await import('../services/tenantAuthService.js');
    const env = tenantAuthEnv({ deployment: DEP, gatewayBaseUrl: 'https://www.svargai.com/api/gateway' });
    expect(env.SVARG_AUTH_URL).toBe(`https://www.svargai.com/api/auth/oauth/google?tenant=${DEP._id}`);
    expect(env.SVARG_AUTH_SECRET).toBe(tenantAuthSecret(DEP._id));
    expect(tenantAuthEnv({ deployment: {}, gatewayBaseUrl: 'https://x' })).toEqual({});
  });

  it('is part of what Go Live writes to the tenant', async () => {
    const { buildTenantEnv } = await import('../services/deployTargetService.js');
    const env = buildTenantEnv({
      deployment: { ...DEP, blueprintId: '000000000000000000000001', model: { modelId: 'gemini-flash' } },
      model: { type: 'frontier', apiModel: 'gemini-3.8-flash', displayName: 'Gemini' },
      gatewayToken: 'svd_x', gatewayBaseUrl: 'https://svarg.example/api/gateway',
      clusterUri: 'mongodb+srv://u:p@cluster.example/svarg', appName: 'App',
    });
    expect(env.SVARG_AUTH_URL).toMatch(/^https:\/\/svarg\.example\/api\/auth\/oauth\/google\?tenant=/);
    expect(env.SVARG_AUTH_SECRET).toHaveLength(64);
  });
});

describe('where Svarg sends people back', () => {
  it('accepts the recorded address and nothing else', async () => {
    const { returnOrigin } = await import('../services/tenantAuthService.js');
    expect(returnOrigin(DEP, 'https://app-production-94d4.up.railway.app')).toBe('https://app-production-94d4.up.railway.app');
    expect(returnOrigin(DEP, 'https://app-production-94d4.up.railway.app/some/path?x=1')).toBe('https://app-production-94d4.up.railway.app');
    expect(returnOrigin(DEP, 'https://evil.example')).toBe('');
    expect(returnOrigin(DEP, 'https://app-production-94d4.up.railway.app.evil.example')).toBe('');
    expect(returnOrigin(DEP, 'not a url')).toBe('');
    expect(returnOrigin({ railway: { url: '' } }, 'https://app-production-94d4.up.railway.app')).toBe('');
  });

  it('treats a bare recorded host as https', async () => {
    const { returnOrigin } = await import('../services/tenantAuthService.js');
    expect(returnOrigin({ railway: { url: 'app.example.com' } }, 'https://app.example.com')).toBe('https://app.example.com');
  });
});

describe('the assertion', () => {
  const ORIGINAL = process.env.JWT_SECRET;
  beforeEach(() => { process.env.JWT_SECRET = 'svarg-root'; });
  afterEach(() => { process.env.JWT_SECRET = ORIGINAL; });

  it('is signed for one application and says who this is', async () => {
    const { signAssertion, tenantAuthSecret } = await import('../services/tenantAuthService.js');
    const a = signAssertion({ deployment: DEP, profile: { sub: '1', email: 'Coach@Example.com', name: 'Coach', picture: 'p' } });
    const who = jwt.verify(a, tenantAuthSecret(DEP._id), { issuer: 'svarg', audience: DEP._id });
    expect(who.email).toBe('coach@example.com');
    expect(who.provider).toBe('google');
    expect(() => jwt.verify(a, tenantAuthSecret('66f1a2b3c4d5e6f708192a3c'))).toThrow();
    expect(() => jwt.verify(a, tenantAuthSecret(DEP._id), { audience: 'someone-else' })).toThrow();
  });
});

describe('the application side', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  function res() {
    const r = { redirected: '', body: null, code: 200 };
    r.redirect = (u) => { r.redirected = u; };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  }

  it('offers Google when configured, and the open session only when not', async () => {
    const { providers } = await import('../eame-template/controllers/authController.js');
    process.env.APP_PUBLIC_ACCESS = 'true';
    delete process.env.SVARG_AUTH_URL; delete process.env.SVARG_AUTH_SECRET;
    let r = res(); providers({}, r);
    expect(r.body).toEqual({ google: false, public: true });
    process.env.SVARG_AUTH_URL = 'https://svarg.example/api/auth/oauth/google?tenant=' + DEP._id;
    process.env.SVARG_AUTH_SECRET = 'shared';
    r = res(); providers({}, r);
    expect(r.body).toEqual({ google: true, public: false });
  });

  it('sends people to Svarg with its own address to come back to', async () => {
    const { google } = await import('../eame-template/controllers/authController.js');
    process.env.SVARG_AUTH_URL = 'https://svarg.example/api/auth/oauth/google?tenant=' + DEP._id;
    process.env.SVARG_AUTH_SECRET = 'shared';
    const r = res();
    google({ protocol: 'https', get: () => 'app.example.com' }, r);
    const u = new URL(r.redirected);
    expect(u.origin + u.pathname).toBe('https://svarg.example/api/auth/oauth/google');
    expect(u.searchParams.get('tenant')).toBe(DEP._id);
    expect(u.searchParams.get('return_to')).toBe('https://app.example.com');
  });

  it('turns a good assertion into its own session and refuses one for another application', async () => {
    process.env.JWT_SECRET = 'svarg-root';
    const { signAssertion, tenantAuthSecret } = await import('../services/tenantAuthService.js');
    const assertion = signAssertion({ deployment: DEP, profile: { sub: '1', email: 'coach@example.com', name: 'Coach' } });
    const other = signAssertion({ deployment: { ...DEP, _id: '66f1a2b3c4d5e6f708192a3c' }, profile: { sub: '1', email: 'coach@example.com', name: 'Coach' } });

    // The application's environment, as Go Live wrote it.
    process.env.SVARG_AUTH_URL = 'https://svarg.example/api/auth/oauth/google?tenant=' + DEP._id;
    process.env.SVARG_AUTH_SECRET = tenantAuthSecret(DEP._id);
    process.env.JWT_SECRET = 'app-secret';

    const stored = [];
    vi.resetModules();
    vi.doMock('mongoose', () => ({
      default: {
        connection: { collection: () => ({
          findOneAndUpdate: async (q, u) => { const doc = { _id: 'u1', email: q.email, name: u.$set.name, role: 'user' }; stored.push(doc); return { value: doc }; },
        }) },
        isValidObjectId: () => true,
        Types: { ObjectId: class { constructor(v) { this.v = v; } } },
      },
    }));
    const { callback } = await import('../eame-template/controllers/authController.js');
    const req = (q) => ({ query: q, protocol: 'https', get: () => 'app.example.com' });

    let r = res(); await callback(req({ assertion }), r);
    expect(r.redirected.startsWith('https://app.example.com/#token=')).toBe(true);
    const token = new URLSearchParams(r.redirected.split('#')[1]).get('token');
    const session = jwt.verify(token, 'app-secret');
    expect(session.userId).toBe('u1');
    expect(session.email).toBe('coach@example.com');
    expect(stored[0].name).toBe('Coach');

    r = res(); await callback(req({ assertion: other }), r);
    expect(r.redirected).toContain('#signin-error=');

    r = res(); await callback(req({ error: 'Google sign-in was cancelled.' }), r);
    expect(r.redirected).toContain('signin-error=Google+sign-in+was+cancelled.');
    vi.doUnmock('mongoose');
  });
});
