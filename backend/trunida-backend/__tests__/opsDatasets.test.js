/**
 * Svarg's own operations, readable by exactly one application.
 *
 * Svarg is going to run itself on Svarg: one tenant whose agents watch
 * deployments, leads and blueprints. That tenant reads data no customer's
 * application may ever see — every other customer's deployment, and the whole
 * pipeline — over a gateway token that is the same kind every customer
 * application holds.
 *
 * So the gate is the only thing standing between a compromised tenant and all
 * of it, and these are about the gate.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { opsRows, DATASETS } from '../services/opsDatasetService.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('who may read it', () => {
  it('refuses a deployment without the flag', async () => {
    await expect(opsRows({ internal: false }, 'deployments')).rejects.toThrow(/may not read/i);
    await expect(opsRows({}, 'deployments')).rejects.toThrow(/may not read/i);
    await expect(opsRows(null, 'deployments')).rejects.toThrow(/may not read/i);
  });

  it('refuses before it looks at what was asked for', async () => {
    // Order matters: an unflagged caller must not be able to learn which
    // datasets exist by watching which names give a different error.
    await expect(opsRows({ internal: false }, 'nonsense')).rejects.toThrow(/may not read/i);
  });

  it('answers 403, not 404, so the refusal is the refusal', async () => {
    await expect(opsRows({ internal: false }, 'deployments')).rejects.toMatchObject({ status: 403 });
  });

  it('refuses an unknown dataset even when flagged', async () => {
    await expect(opsRows({ internal: true }, 'passwords')).rejects.toMatchObject({ status: 404 });
  });

  it('has the flag off by default on the model', () => {
    const model = read('../models/HostedDeployment.js');
    expect(model).toMatch(/internal: \{ type: Boolean, default: false \}/);
  });

  it('is set by a command and by nothing else', () => {
    /*
     * No API writes it. There is no admin toggle. Turning it on takes a
     * person, a shell and a script — the right amount of friction for a
     * switch that opens every customer's record to one container.
     */
    const ctrl = read('../controllers/gatewayController.js');
    expect(ctrl).not.toMatch(/internal\s*=/);
    expect(ctrl).not.toMatch(/internal:\s*true/);

    const script = read('../scripts/mark_internal.mjs');
    expect(script).toContain('dep.internal = !!on;');
    // And it will not act on an ambiguous match.
    expect(script).toContain('Refusing to guess.');
  });
});

describe('only what monitoring needs', () => {
  const svc = read('../services/opsDatasetService.js');

  it('never returns a token, a hash or a key', () => {
    // Every row is built field by field. A spread of a deployment document
    // would carry gatewayTokenHash and ownerKeyHash straight out.
    expect(svc).not.toMatch(/\.\.\.d\b/);
    expect(svc).not.toMatch(/gatewayToken/);
    expect(svc).not.toMatch(/ownerKey/);
    expect(svc).not.toMatch(/dbName/);
  });

  it('leaves a prospect’s contact details behind', () => {
    /*
     * Agents report; they never write to anybody. The company, the lane and
     * the state are enough to say "nine walk-ins have sat untouched for a
     * fortnight", and a second copy of every prospect's email and phone is a
     * liability with no use.
     */
    const leads = svc.slice(svc.indexOf('async function leads()'), svc.indexOf('async function blueprints()'));
    // The fields actually read off the lead, not the word. "emailsSent" is a
    // count of messages, and is exactly what an agent needs to say "we wrote
    // three times and heard nothing" — it is not a way to reach anybody.
    for (const field of ['l.email', 'l.phone', 'l.name', 'l.linkedinUrl', 'l.orgContext', 'l.note']) {
      expect(leads, field).not.toContain(field);
    }
  });

  it('carries the one number Steward exists to read', () => {
    // The difference between a customer getting value and one quietly gone,
    // which nothing on the Svarg side reports today.
    expect(svc).toContain('daysSinceUse');
    expect(svc).toContain('daysSinceContact');
  });

  it('offers three datasets and says which', () => {
    expect(DATASETS).toEqual(['deployments', 'leads', 'blueprints']);
  });
});

describe('the connector that reads it', () => {
  const mod = read('../eame-template/services/connectors/svarg.js');

  it('asks the owner for no credential at all', () => {
    /*
     * Every other connector asks for a token, because the credential is the
     * owner's. This one uses the gateway token the container already holds —
     * so there is nothing here to steal that was not already there.
     */
    expect(mod).toContain("name: 'dataset'");
    expect(mod).not.toMatch(/secret:\s*true/);
    expect(mod).toContain('process.env.SELFHOSTED_API_KEY');
    expect(mod).toContain('process.env.SVARG_OPS_URL');
  });

  it('says plainly when Svarg refuses it', () => {
    expect(mod).toContain('this application is not the one allowed to read operations data');
  });

  it('reaches only an application that asked for it', async () => {
    /*
     * Not in ALWAYS_SHIPPED: a customer's Data page must not offer a source
     * that would only ever refuse them.
     */
    const { buildRuntime } = await import('../services/eameProjectBuilder.js');
    const shipped = (connectors) =>
      new Set(buildRuntime({ appName: 'P', connectors }).map(f => f.path)).has('services/connectors/svarg.js');
    expect(shipped(['jira'])).toBe(false);
    expect(shipped([])).toBe(false);
    expect(shipped(['svarg'])).toBe(true);
  });

  it('is offered by name, so a build can ask for it', async () => {
    const { CONNECTOR_MODULES } = await import('../services/sourceCatalogService.js');
    expect(CONNECTOR_MODULES.svarg).toBe('services/connectors/svarg.js');
  });
});

describe('every application is told the address', () => {
  it('but only a flagged one is answered', () => {
    // Handing out the URL costs nothing — the gate is on the answer, not on
    // whether somebody knows where to knock.
    const deploy = read('../services/deployTargetService.js');
    expect(deploy).toContain('SVARG_OPS_URL: `${gatewayBaseUrl}/v1/ops`');

    const routes = read('../routes/gatewayRoutes.js');
    expect(routes).toContain("router.get ('/ops/:dataset',     ops);");
  });
});
