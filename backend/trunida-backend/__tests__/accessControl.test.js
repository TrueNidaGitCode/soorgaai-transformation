/**
 * The owner of a delivered application, and who they let in.
 *
 * Before this, anyone Svarg could sign in got an account on first arrival. The
 * person who asked for the application had no way to say who their colleagues
 * are and no way to see who had let themselves in — and the only "owner" was
 * whoever still had the key they were shown once on a screen at go-live.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

const users = [];
const collection = {
  findOne: vi.fn(async (q) => users.find(u => u.email === q.email) || null),
  countDocuments: vi.fn(async () => users.length),
  insertOne: vi.fn(async (doc) => { users.push(doc); return { insertedId: '1' }; }),
  deleteOne: vi.fn(async (q) => {
    const i = users.findIndex(u => u.email === q.email);
    if (i < 0) return { deletedCount: 0 };
    users.splice(i, 1);
    return { deletedCount: 1 };
  }),
  updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
  find: vi.fn(() => ({ sort: () => ({ limit: () => ({ toArray: async () => users }) }) })),
};

vi.mock('mongoose', () => ({
  default: { connection: { collection: () => collection }, Types: { ObjectId: class {} } },
}));

const T = '../eame-template/controllers/accessController.js';

let saved;
beforeEach(() => {
  vi.resetModules();
  users.length = 0;
  saved = { ...process.env };
  delete process.env.APP_OWNER_EMAIL;
  delete process.env.APP_SEATS;
  delete process.env.APP_PLAN_LABEL;
  process.env.APP_NAME = 'Six Cricket';
});
afterEach(() => { process.env = saved; });

describe('the owner is whoever asked for the application', () => {
  it('is named by email, not by a key somebody had to keep', async () => {
    process.env.APP_OWNER_EMAIL = 'Ravi@Academy.com';
    const a = await import(T);
    // Case and spacing are how a real email arrives; the owner must survive both.
    expect(a.ownerEmail()).toBe('ravi@academy.com');
  });

  it('lets the owner in even when every seat is taken', async () => {
    process.env.APP_OWNER_EMAIL = 'ravi@academy.com';
    process.env.APP_SEATS = '1';
    users.push({ email: 'coach@academy.com' });
    const a = await import(T);
    expect((await a.maySignIn('ravi@academy.com')).allowed).toBe(true);
  });
});

describe('who may sign in', () => {
  it('never turns away somebody who already has an account', async () => {
    process.env.APP_OWNER_EMAIL = 'ravi@academy.com';
    process.env.APP_SEATS = '1';
    users.push({ email: 'ravi@academy.com' }, { email: 'coach@academy.com' });
    const a = await import(T);
    expect((await a.maySignIn('coach@academy.com')).allowed).toBe(true);
  });

  it('is invite-only once an owner is named', async () => {
    process.env.APP_OWNER_EMAIL = 'ravi@academy.com';
    const a = await import(T);
    const out = await a.maySignIn('stranger@elsewhere.com');
    expect(out.allowed).toBe(false);
    expect(out.error).toMatch(/invite-only/);
    expect(out.error).toMatch(/Ask the person who set it up/);
  });

  it('leaves applications delivered before this wide open, as they were', async () => {
    // No APP_OWNER_EMAIL and no APP_SEATS: exactly the old behaviour.
    const a = await import(T);
    expect((await a.maySignIn('anyone@anywhere.com')).allowed).toBe(true);
  });

  it('names the plan and the follow-up when seats run out', async () => {
    process.env.APP_SEATS = '1';
    process.env.APP_PLAN_LABEL = 'Pro';
    users.push({ email: 'first@academy.com' });
    const a = await import(T);
    const out = await a.maySignIn('second@academy.com');
    expect(out.allowed).toBe(false);
    expect(out.error).toContain('Pro plan');
    expect(out.error).toContain('one account');
    expect(out.error).toContain('The SvargAI team will get back to you');
  });

  it('lets people in when the check itself breaks', async () => {
    process.env.APP_OWNER_EMAIL = 'ravi@academy.com';
    collection.findOne.mockRejectedValueOnce(new Error('database gone'));
    const a = await import(T);
    // A check that cannot run must not become a locked door.
    expect((await a.maySignIn('coach@academy.com')).allowed).toBe(true);
  });
});

describe('granting and removing access', () => {
  const res = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };

  it('refuses an address that is not one', async () => {
    const a = await import(T);
    const r = res();
    await a.grantAccess({ body: { email: 'not-an-email' }, user: {} }, r);
    expect(r.code).toBe(400);
  });

  it('refuses past the seat limit, and says who to ask', async () => {
    process.env.APP_SEATS = '1';
    process.env.APP_PLAN_LABEL = 'Pro';
    users.push({ email: 'ravi@academy.com' });
    const a = await import(T);
    const r = res();
    await a.grantAccess({ body: { email: 'coach@academy.com' }, user: {} }, r);
    expect(r.code).toBe(409);
    expect(r.body.full).toBe(true);
    expect(r.body.error).toContain('The SvargAI team will get back to you about enabling a higher plan');
  });

  it('adds somebody who has room, before they ever sign in', async () => {
    process.env.APP_SEATS = '5';
    const a = await import(T);
    const r = res();
    await a.grantAccess({ body: { email: 'Coach@Academy.com' }, user: { email: 'ravi@academy.com' } }, r);
    expect(r.body.added).toBe(true);
    expect(users[0].email).toBe('coach@academy.com');
    expect(users[0].invited).toBe(true);
    expect(users[0].lastSeenAt).toBe(null);
  });

  it('will not remove the person who created the application', async () => {
    process.env.APP_OWNER_EMAIL = 'ravi@academy.com';
    users.push({ email: 'ravi@academy.com' });
    const a = await import(T);
    const r = res();
    await a.revokeAccess({ params: { email: 'ravi@academy.com' }, user: { email: 'ravi@academy.com' } }, r);
    expect(r.code).toBe(400);
    expect(users.length).toBe(1);
  });

  it('will not let somebody remove their own access', async () => {
    users.push({ email: 'coach@academy.com' });
    const a = await import(T);
    const r = res();
    await a.revokeAccess({ params: { email: 'coach@academy.com' }, user: { email: 'coach@academy.com' } }, r);
    expect(r.code).toBe(400);
  });

  it('frees the seat when somebody is removed', async () => {
    users.push({ email: 'ravi@academy.com' }, { email: 'coach@academy.com' });
    const a = await import(T);
    const r = res();
    await a.revokeAccess({ params: { email: 'coach@academy.com' }, user: { email: 'ravi@academy.com' } }, r);
    expect(r.body.removed).toBe(true);
    expect(r.body.message).toMatch(/the seat is free/);
    expect(users.length).toBe(1);
  });
});

describe('only the owner manages access', () => {
  it('refuses a signed-in colleague', async () => {
    process.env.APP_OWNER_EMAIL = 'ravi@academy.com';
    const a = await import(T);
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    let passed = false;
    await a.ownerOnly({ user: { role: 'user', email: 'coach@academy.com', userId: 'x' } }, r, () => { passed = true; });
    expect(passed).toBe(false);
    expect(r.code).toBe(403);
    expect(r.body.error).toMatch(/Only the person who created this application/);
  });

  it('admits the owner by email, with no key to hold', async () => {
    process.env.APP_OWNER_EMAIL = 'ravi@academy.com';
    const a = await import(T);
    let passed = false;
    await a.ownerOnly({ user: { role: 'user', email: 'Ravi@Academy.com' } }, {}, () => { passed = true; });
    expect(passed).toBe(true);
  });
});

describe('the pieces that carry it', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('ships the panel, the controller and the route', async () => {
    const { buildManifest } = await import('../services/eameProjectBuilder.js');
    const paths = buildManifest({ includeJira: true, appName: 'Six Cricket' }).map(f => f.path);
    expect(paths).toContain('controllers/accessController.js');
    expect(paths).toContain('routes/accessRoutes.js');
    expect(paths).toContain('frontend/access.js');
  });

  it('tells the application who its owner is', () => {
    const deploy = read('../services/deployTargetService.js');
    expect(deploy).toContain('APP_OWNER_EMAIL: String(ownerEmail).toLowerCase()');
    const ctrl = read('../controllers/deploymentController.js');
    expect(ctrl).toContain("ownerEmail: owner?.email || ''");
  });

  it('asks before creating the account, not after', () => {
    const auth = read('../eame-template/controllers/authController.js');
    const gate = auth.indexOf('const may = await maySignIn(email)');
    const upsert = auth.indexOf('findOneAndUpdate');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(upsert);
  });

  it('keeps the panel out of the page script that cannot fail', () => {
    // access.js is its own file on purpose: a syntax error inside index.html's
    // main script takes sign-in down with it, which happened once already.
    const page = read('../eame-template/frontend/index.html');
    expect(page).toContain('<script src="access.js"></script>');
  });
});
