/**
 * Health that is allowed to say no.
 *
 * /api answered `status: 'running'` — a string literal, returned identically
 * whether the database was reachable or the application was seconds from
 * falling over. It said running because it had been written to say running.
 *
 * A delivered application then sat crashed for a week while Svarg's sweep read
 * it as live, because the only question anyone asked was whether the address
 * answered. Railway's edge answers. The application did not.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

const conn = { readyState: 1, collection: () => ({ countDocuments: async () => 3 }) };
vi.mock('mongoose', () => ({ default: { connection: conn } }));

let index = [{ name: 'Roster' }, { name: 'Roll Call' }];
/*
 * What readIndex does, chosen per test by variable rather than by re-mocking.
 *
 * vi.doMock only affects imports made after it, and whether it has taken
 * effect before the module under test is imported is not guaranteed under
 * load. When it had not, readIndex returned the index variable, which the same
 * test had set to undefined — and the check reported "the dataset index could not be read"
 * instead of the thrown message. A rare, load-dependent failure that survived
 * several clean runs before it was caught.
 */
let readIndexThrows = '';
vi.mock('../eame-template/services/connectorService.js', () => ({
  readIndex: () => {
    if (readIndexThrows) throw new Error(readIndexThrows);
    return index;
  },
}));

const T = '../eame-template/services/selfCheck.js';
const check = async () => (await import(T)).selfCheck();
const by = (h, name) => h.checks.find(c => c.name === name);

let saved;
beforeEach(() => {
  vi.resetModules();
  saved = { ...process.env };
  conn.readyState = 1;
  index = [{ name: 'Roster' }, { name: 'Roll Call' }];
  readIndexThrows = '';
  process.env.PROVIDER_CHAIN = 'gemini';
  process.env.GOOGLE_API_KEY = 'k';
  process.env.APP_PUBLIC_ACCESS = 'true';
  delete process.env.APP_SEATS;
  delete process.env.SVARG_AUTH_URL;
  delete process.env.SVARG_AUTH_SECRET;
  delete process.env.APP_OWNER_KEY;
});
afterEach(() => { process.env = saved; });

describe('a healthy application', () => {
  it('says so, and says why it thinks so', async () => {
    const h = await check();
    expect(h.ok).toBe(true);
    expect(h.summary).toBe('everything this application needs is in place');
    expect(h.checks.map(c => c.name)).toEqual(['database', 'datasets', 'model', 'sign-in', 'access']);
  });
});

describe('every failure a customer would feel', () => {
  it('reports a database that is not connected', async () => {
    conn.readyState = 0;
    const h = await check();
    expect(h.ok).toBe(false);
    expect(by(h, 'database').detail).toBe('disconnected');
  });

  it('reports an application with no datasets', async () => {
    index = [];
    const h = await check();
    expect(h.ok).toBe(false);
    expect(by(h, 'datasets').detail).toMatch(/no datasets/);
  });

  it('reports a dataset index it cannot read', async () => {
    index = null;
    const h = await check();
    expect(by(h, 'datasets').ok).toBe(false);
  });

  it('reports no model provider configured', async () => {
    delete process.env.GOOGLE_API_KEY;
    const h = await check();
    expect(h.ok).toBe(false);
    expect(by(h, 'model').detail).toMatch(/no model provider/);
  });

  it('reports an application nobody can sign in to', async () => {
    delete process.env.APP_PUBLIC_ACCESS;
    const h = await check();
    expect(h.ok).toBe(false);
    expect(by(h, 'sign-in').detail).toMatch(/nobody can sign in/);
  });

  it('names every failure in the summary, not just the first', async () => {
    conn.readyState = 0;
    index = [];
    delete process.env.GOOGLE_API_KEY;
    const h = await check();
    for (const part of ['database', 'datasets', 'model']) expect(h.summary).toContain(part);
  });
});

describe('what it must never do', () => {
  it('does not hang when the database is down', async () => {
    /*
     * Mongoose buffers a query against a dead connection and resolves it ten
     * seconds later. That one check made the endpoint take ten seconds to
     * answer — precisely when something was wrong, and twice the timeout the
     * sweep polls it with. A health check that hangs while unhealthy reports
     * nothing at all.
     */
    conn.readyState = 0;
    conn.collection = () => ({ countDocuments: () => new Promise(() => {}) });
    const t0 = Date.now();
    const h = await check();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(by(h, 'access').detail).toMatch(/not connected/);
    conn.collection = () => ({ countDocuments: async () => 3 });
  });

  it('survives a check that throws, rather than failing the endpoint', async () => {
    readIndexThrows = 'the connector layer is broken';
    const h = await check();
    expect(by(h, 'datasets').ok).toBe(false);
    expect(by(h, 'datasets').detail).toMatch(/broken/);
    // And the rest still ran.
    expect(h.checks).toHaveLength(5);
  });

  it('costs nothing — it never calls the model', async () => {
    const src = readFileSync(new URL(T, import.meta.url), 'utf8');
    // A health endpoint that spends money is one nobody dares poll, and the
    // sweep polls this over every live deployment.
    expect(src).not.toMatch(/generate\(|llmService/);
    expect(src).toContain('Configured, not reachable');
  });

  it('does not call being over seats a failure', async () => {
    // People who already had an account are never turned away, by design.
    process.env.APP_SEATS = '1';
    const h = await check();
    expect(by(h, 'access').ok).toBe(true);
    expect(by(h, 'access').over).toBe(true);
    expect(h.ok).toBe(true);
  });
});

describe('the endpoint and the sweep that reads it', () => {
  const server = readFileSync(new URL('../eame-template/server.js', import.meta.url), 'utf8');
  const target = readFileSync(new URL('../services/deployTargetService.js', import.meta.url), 'utf8');

  it('no longer hardcodes running', () => {
    expect(server).not.toContain("status: 'running', version: '1.0.0', routes: mounted }");
    expect(server).toContain("status: health.ok ? 'running' : 'degraded'");
  });

  it('answers 503 when it is unwell, so a status code alone tells the truth', () => {
    expect(server).toContain('.status(health.ok ? 200 : 503)');
  });

  it('never lets the health check itself take the endpoint down', () => {
    expect(server).toContain('the health check could not run');
  });

  it('makes the sweep ask, rather than assume a 200 means well', () => {
    expect(target).toContain('const health = await askHealth(url)');
    expect(target).toContain("status: 'degraded'");
  });

  it('treats an older application with no opinion as it always was', () => {
    // Absence of an opinion is not evidence of illness.
    expect(target).toContain("if (!body || typeof body.ok !== 'boolean') return null;");
  });

  it('keeps a degraded deployment inside the sweep that would repair it', () => {
    const live = readFileSync(new URL('../services/liveUpdateService.js', import.meta.url), 'utf8');
    expect(live).toContain("status: { $in: ['live', 'attaching', 'degraded'] }");
    expect(live).toContain("status: { $in: ['attaching', 'degraded'] }");
  });

  it('allows degraded on the model, or the write is silently invalid', () => {
    const model = readFileSync(new URL('../models/HostedDeployment.js', import.meta.url), 'utf8');
    expect(model).toContain("'live', 'degraded', 'failed'");
  });
});

describe('which build is answering', () => {
  const server = readFileSync(new URL('../eame-template/server.js', import.meta.url), 'utf8');

  /*
   * There was no way to tell. A fix was pushed, the platform rebuilt, and the
   * only way to know whether the container in front of you was the new one was
   * to guess from the clock. A verification ran against the old build, handed
   * back the old failure, and looked exactly like the fix not working.
   *
   * Svarg reports its own commit on its root endpoint for precisely this
   * reason, and every deploy check in this repository relies on it.
   */
  it('reports the commit it was built from', () => {
    expect(server).toContain("commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7)");
  });

  it('reports when this container came up, so a restart is visible too', () => {
    expect(server).toContain('const STARTED_AT = new Date().toISOString();');
    expect(server).toContain('startedAt: STARTED_AT,');
  });

  it('takes the timestamp once at boot, not per request', () => {
    // Per request it would only ever say "now", which answers nothing.
    const at = server.indexOf('const STARTED_AT');
    expect(server.slice(at, server.indexOf('\n', at))).not.toContain('()  =>');
    expect(server).not.toContain('startedAt: new Date()');
  });
});
