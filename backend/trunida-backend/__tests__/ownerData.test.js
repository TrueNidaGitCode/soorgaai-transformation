/**
 * Phase A of "connectors in the application": the owner key reaches the
 * tenant, the Data page refuses everyone but the owner, an import lands as a
 * file with _source=own and calls the seed script for that dataset, and a
 * generated seed script that cannot be called per dataset fails the build.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';

vi.mock('dotenv', () => ({ default: { config: () => {} } }));

// ── The owner key in the tenant's environment ───────────────────────────────

describe('buildTenantEnv', () => {
  it('carries the owner key to the application, and nothing when there is none', async () => {
    const { buildTenantEnv } = await import('../services/deployTargetService.js');
    const base = {
      deployment: { blueprintId: '000000000000000000000001', model: { modelId: 'gemini-flash' } },
      model: { type: 'frontier', apiModel: 'gemini-3.8-flash', displayName: 'Gemini' },
      gatewayToken: 'svd_x', gatewayBaseUrl: 'https://svarg.example/api/gateway',
      clusterUri: 'mongodb+srv://u:p@cluster.example/svarg?retryWrites=true', appName: 'App',
    };
    expect(buildTenantEnv({ ...base, ownerKey: 'sok_abc' }).APP_OWNER_KEY).toBe('sok_abc');
    expect(buildTenantEnv(base)).not.toHaveProperty('APP_OWNER_KEY');
  });
});

// ── The Data page's back end, as shipped in the template ────────────────────

const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

describe('the owner session', () => {
  const ORIGINAL = process.env.APP_OWNER_KEY;
  beforeEach(() => { process.env.APP_OWNER_KEY = 'sok_right'; process.env.JWT_SECRET = 'test-secret'; });
  afterEach(() => { process.env.APP_OWNER_KEY = ORIGINAL; });

  it('exchanges the right key for an owner session and refuses a wrong one', async () => {
    const { ownerSession, requireOwner } = await import('../eame-template/controllers/dataController.js');
    const ok = res();
    ownerSession({ body: { key: 'sok_right' } }, ok);
    expect(ok.code).toBe(200);
    expect(jwt.verify(ok.body.token, 'test-secret').role).toBe('owner');

    const bad = res();
    ownerSession({ body: { key: 'sok_wrong' } }, bad);
    expect(bad.code).toBe(401);

    // The public chat session is not the owner.
    const refused = res(); let passed = false;
    requireOwner({ user: { role: 'user' } }, refused, () => { passed = true; });
    expect(passed).toBe(false);
    expect(refused.code).toBe(403);
    requireOwner({ user: { role: 'owner' } }, res(), () => { passed = true; });
    expect(passed).toBe(true);
  });

  it('says so when no key is configured at all', async () => {
    process.env.APP_OWNER_KEY = '';
    const { ownerSession, ownerStatus } = await import('../eame-template/controllers/dataController.js');
    const r = res(); ownerSession({ body: { key: 'anything' } }, r);
    expect(r.code).toBe(503);
    const s = res(); ownerStatus({}, s);
    expect(s.body).toEqual({ configured: false });
  });
});

// ── The seed contract, enforced on generated projects ───────────────────────

describe('staticGates: the seed script must import per dataset', () => {
  const project = (seedSource) => [
    { path: 'routes/thingRoutes.js', content: 'export default 1;' },
    { path: 'services/thingService.js', content: 'export const a = 1;' },
    { path: 'frontend/app.js', content: '// ui' },
    { path: 'scripts/seedThing.js', content: seedSource },
  ];

  it('fails a seed script that cannot be called with { datasetName, filePath }', async () => {
    const { staticGates } = await import('../services/generatedProjectVerifier.js');
    const r = staticGates(project('export default async function seed() { return { message: "done" }; }'));
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('completeness');
    expect(r.failures.join(' ')).toMatch(/datasetName, filePath/);
  });

  it('accepts one that does, as far as the completeness gate goes', async () => {
    const { staticGates } = await import('../services/generatedProjectVerifier.js');
    const r = staticGates(project('export default async function seed({ datasetName, filePath } = {}) { return { message: "done" }; }'));
    expect(r.stage === 'completeness' && r.ok === false).toBe(false);
  });
});
