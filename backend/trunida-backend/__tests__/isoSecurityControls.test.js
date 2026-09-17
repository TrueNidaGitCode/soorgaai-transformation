/**
 * Security checks that produce evidence for a named control.
 *
 * ── The claim that must never be made ──────────────────────────────────────
 *
 * ISO/IEC 42001 certifies an organisation's AI management system and 27001 its
 * information security management system. Both are awarded by an accredited
 * body auditing how people work; neither is something an application can pass.
 * A product claiming to run "the ISO tests" is describing something that does
 * not exist, and a customer who repeats that claim to their own auditor is the
 * one who gets hurt.
 *
 * What is honest and genuinely saleable: evidence for specific Annex A
 * controls, dated, from one deployment, with an auditor still deciding. These
 * tests hold that line as much as they test the checks.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

const { state } = vi.hoisted(() => ({ state: { ready: 1, turns: 7, files: {}, throwOn: '' } }));

vi.mock('mongoose', () => ({
  default: { connection: { get readyState() { return state.ready; } } },
}));
vi.mock('fs', async (orig) => {
  const real = await orig();
  return {
    ...real,
    default: {
      ...real.default,
      existsSync: (p) => !!state.files[String(p).split(/[\\/]/).pop()],
      readFileSync: (p, ...rest) => {
        const name = String(p).split(/[\\/]/).pop();
        if (state.throwOn && name === state.throwOn) throw new Error('unreadable');
        if (state.files[name] !== undefined && typeof state.files[name] === 'string') return state.files[name];
        return real.default.readFileSync(p, ...rest);
      },
    },
  };
});
vi.mock('../eame-template/services/turnLog.js', () => ({
  turnsCollection: () => ({ countDocuments: async () => state.turns }),
}));

const S = '../eame-template/services/securityControls.js';
let securityChecks, CONTROLS;

/**
 * An app with routers mounted, in the shape express actually produces.
 *
 * `app.use('/api/data', router)` compiles the mount path to the regular
 * expression `^\/api\/data\/?(?=\/|$)`. Guessing at that shape is how the
 * first version of the extractor came to return `/api` for every router.
 */
const appWith = (bases) => ({
  _router: {
    stack: bases.map(b => ({
      handle: { stack: [{}] },
      regexp: { source: `^${b.split('/').join('\\/')}\\/?(?=\\/|$)` },
    })),
  },
});

const by = (rows, id) => rows.find(r => r.id === id);

beforeEach(async () => {
  vi.resetModules();
  state.ready = 1;
  state.turns = 7;
  state.throwOn = '';
  state.files = { 'authController.js': "const SESSION_TTL = '30d';", '.env.example': true };
  global.fetch = vi.fn(async () => ({ status: 401, text: async () => '{"ok":true}' }));
  ({ securityChecks, CONTROLS } = await import(S));
});

describe('every check names the control it evidences', () => {
  it('cites a real ISO control on each one', async () => {
    for (const c of await securityChecks({ app: appWith(['/api/data']) })) {
      expect(c.control, c.id).toBeTruthy();
      expect(c.control.id, c.id).toMatch(/^ISO\/IEC (42001|27001) A\./);
      expect(c.control.name, c.id).toBeTruthy();
    }
  });

  it('never claims the application is certified or conformant', () => {
    const src = readFileSync(new URL(S, import.meta.url), 'utf8');
    const conf = readFileSync(new URL('../eame-template/services/conformance.js', import.meta.url), 'utf8');
    for (const text of [src, conf]) {
      expect(text).not.toMatch(/ISO[- ]certified/i);
      expect(text).not.toMatch(/\bcertification passed\b/i);
    }
    expect(conf).toContain('Not a conformity assessment');
    expect(src).toMatch(/neither is something an\s*\n?\s*\*?\s*application can pass/);
  });
});

describe('A.8.3 — a caller with no credentials gets nothing', () => {
  it('knocks on the real routes rather than reading the source', async () => {
    /*
     * Middleware that is imported but never mounted reads identically to
     * middleware that works. Only a request over the real stack tells them
     * apart, which is why this makes one.
     */
    const rows = await securityChecks({ app: appWith(['/api/data', '/api/chat']) });
    expect(global.fetch).toHaveBeenCalled();
    const c = by(rows, 'anonymous-access-refused');
    expect(c.passed).toBe(true);
    expect(c.detail).toMatch(/refused a request carrying no credentials/);
  });

  it('fails, and names the route, when one answers anyway', async () => {
    global.fetch = vi.fn(async (url) => ({
      status: String(url).includes('/api/data') ? 200 : 401,
      text: async () => '',
    }));
    const c = by(await securityChecks({ app: appWith(['/api/data', '/api/chat']) }), 'anonymous-access-refused');
    expect(c.passed).toBe(false);
    expect(c.detail).toContain('/api/data');
    expect(c.detail).toContain('200');
  });

  it('does not test the doors that are meant to be open', async () => {
    // The health endpoint and the sign-in routes answer anonymously by design.
    const rows = await securityChecks({ app: appWith(['/api', '/api/auth', '/api/data']) });
    const called = global.fetch.mock.calls.map(c => String(c[0]));
    expect(called.some(u => u.endsWith('/api/data'))).toBe(true);
    expect(called.some(u => u.endsWith('/api/auth'))).toBe(false);
    expect(by(rows, 'anonymous-access-refused').passed).toBe(true);
  });

  it('skips rather than passes when it is not inside a served application', async () => {
    // Nothing is listening, and a check that could not run must not read as one
    // that succeeded.
    const c = by(await securityChecks({}), 'anonymous-access-refused');
    expect(c.skipped).toBe(true);
    expect(c.passed).toBeUndefined();
  });
});

describe('A.8.5 — a session stops working on its own', () => {
  it('reports the lifetime it found', async () => {
    const c = by(await securityChecks({}), 'sessions-expire');
    expect(c.passed).toBe(true);
    expect(c.detail).toContain('30d');
  });

  it('fails when a token would be valid forever', async () => {
    state.files['authController.js'] = 'const SESSION = "no ttl here";';
    const c = by(await securityChecks({}), 'sessions-expire');
    expect(c.passed).toBe(false);
    expect(c.detail).toMatch(/valid forever/);
  });
});

describe('A.8.12 — diagnostics do not disclose what they report', () => {
  it('fails when a configured secret appears in the response', async () => {
    process.env.JWT_SECRET = 'a-real-looking-secret-value';
    global.fetch = vi.fn(async () => ({ status: 200, text: async () => '{"jwt":"a-real-looking-secret-value"}' }));
    const c = by(await securityChecks({ app: appWith(['/api/data']) }), 'no-secret-disclosed');
    expect(c.passed).toBe(false);
    delete process.env.JWT_SECRET;
  });

  it('passes when it names what is configured without its value', async () => {
    process.env.JWT_SECRET = 'a-real-looking-secret-value';
    const c = by(await securityChecks({ app: appWith(['/api/data']) }), 'no-secret-disclosed');
    expect(c.passed).toBe(true);
    delete process.env.JWT_SECRET;
  });

  it('ignores a value too short to be a secret', async () => {
    // A three-character setting appearing in a response is a coincidence, and
    // treating it as a leak would make the check cry wolf.
    process.env.JWT_SECRET = 'dev';
    global.fetch = vi.fn(async () => ({ status: 200, text: async () => '{"mode":"dev"}' }));
    const c = by(await securityChecks({ app: appWith(['/api/data']) }), 'no-secret-disclosed');
    expect(c.passed).toBe(true);
    delete process.env.JWT_SECRET;
  });
});

describe('A.8.15 — every answer is recorded', () => {
  it('counts what the audit trail holds', async () => {
    const c = by(await securityChecks({}), 'answers-are-recorded');
    expect(c.passed).toBe(true);
    expect(c.detail).toContain('7');
  });

  it('passes an application nobody has asked anything yet', async () => {
    // Zero recorded answers is honest for a new deployment, not a finding.
    state.turns = 0;
    const c = by(await securityChecks({}), 'answers-are-recorded');
    expect(c.passed).toBe(true);
    expect(c.detail).toMatch(/no questions have been asked yet/);
  });

  it('does not hang when the database is down', async () => {
    /*
     * Mongoose buffers a query against a dead connection and resolves it ten
     * seconds later, so this one check would make the whole report take ten
     * seconds — precisely when something is already wrong. The health endpoint
     * learned this the same way.
     */
    state.ready = 0;
    const t0 = Date.now();
    const c = by(await securityChecks({}), 'answers-are-recorded');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(c.skipped).toBe(true);
  });
});

describe('A.8.9 — configuration comes from the environment', () => {
  it('fails when a .env ships with the code', async () => {
    state.files['.env'] = true;
    const c = by(await securityChecks({}), 'configuration-not-hardcoded');
    expect(c.passed).toBe(false);
    expect(c.detail).toMatch(/must not ship with the code/);
  });

  it('fails when nothing documents what configuration is required', async () => {
    delete state.files['.env.example'];
    expect(by(await securityChecks({}), 'configuration-not-hardcoded').passed).toBe(false);
  });

  it('passes when the environment supplies it and a template documents it', async () => {
    expect(by(await securityChecks({}), 'configuration-not-hardcoded').passed).toBe(true);
  });
});

describe('the build-time half, on the Yusu screen', () => {
  const yusu = readFileSync(new URL('../../../frontend/domain/yusuScreen.js', import.meta.url), 'utf8');

  it('no longer claims work it does not do', () => {
    /*
     * It passed with "Vulnerability scan, dependency check, configuration
     * validation" — three activities none of which it performs. It reads
     * filenames. Shown to a customer in a security conversation, that line was
     * simply untrue.
     */
    const code = yusu.split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(code).not.toContain('Vulnerability scan, dependency check');
  });

  it('cites the control it does evidence', () => {
    expect(yusu).toContain('ISO/IEC 27001 A.8.9, A.8.5');
  });

  it('says an auditor decides, not the screen', () => {
    expect(yusu).toMatch(/an auditor decides conformity/);
  });
});
