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
    await ownerSession({ body: { key: 'sok_right' }, header: () => '' }, ok);
    expect(ok.code).toBe(200);
    expect(jwt.verify(ok.body.token, 'test-secret').role).toBe('owner');

    const bad = res();
    await ownerSession({ body: { key: 'sok_wrong' }, header: () => '' }, bad);
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

/**
 * A fixed runtime file documents the JSON a model must return, and that JSON
 * has a "from" key. `"from":"a"` read as an import of ":" and refused a build
 * for a package nobody had written, in a file nobody had generated — which
 * broke every build, not only the one that found it.
 */
describe('prose in a file is not a dependency', () => {
  it('ignores a JSON key that happens to be called from', async () => {
    const { extractImports } = await import('../services/generatedProjectVerifier.js');
    const src = `const RULES = ['  {"id":"b","op":"derive","from":"a","entity":"player_name"}'];
import axios from 'axios';
import { x } from './local.js';`;
    const out = extractImports(src);
    expect(out.bare).toEqual(['axios']);
    expect(out.relative).toEqual(['./local.js']);
  });

  it('still finds every real specifier', async () => {
    const { extractImports } = await import('../services/generatedProjectVerifier.js');
    const out = extractImports(`
      import a from 'axios';
      export * from './re.js';
      const m = await import('mongoose');
      const r = require('express');
      import '@scope/pkg/side-effect.js';
    `);
    expect(out.bare.sort()).toEqual(['@scope/pkg/side-effect.js', 'axios', 'express', 'mongoose']);
    expect(out.relative).toEqual(['./re.js']);
  });
});

describe('the Data page names the systems a business runs on', () => {
  /*
   * ── What changed, and why ────────────────────────────────────────────────
   *
   * The page drew one list: whatever data/sources.json named for the
   * industry, in the file's order, with Documents folded in among them. For
   * a clinic that meant a folder of spreadsheets and WhatsApp, as equals,
   * and no phone at all — although the phone connector ships in every
   * application and the demonstration this product is sold on turns on a
   * phone call.
   *
   * Two groups now. The systems a business runs on are connected once and
   * keep arriving; a folder of spreadsheets is sent again every time it
   * changes. They are different acts and they no longer look like the same
   * one.
   */
  const ui = fs.readFileSync(new URL('../eame-template/frontend/data.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../eame-template/frontend/index.html', import.meta.url), 'utf8');

  it('offers the three whether or not the industry thought to name them', () => {
    /*
     * The industry's own block is still the source of truth for what ELSE
     * a business has — Jira for a software team, a diary for a clinic. It
     * is not the source of truth for the phone, because a connector nobody
     * can see on this page is a connector nobody uses.
     */
    expect(ui).toContain("var CORE = ['database', 'phone', 'whatsapp'];");
    expect(ui).toContain('if (!shipped(kind)) return;');
  });

  it('leads with the database', () => {
    /*
     * It is the system a business already keeps its records in, so it is
     * the one connection that makes every watcher work at once, and the one
     * a reader recognises without being told what it is for. The phone and
     * WhatsApp add what the records never had: what was actually said.
     */
    const core = ui.slice(ui.indexOf('var CORE ='), ui.indexOf('var CORE =') + 60);
    expect(core).toMatch(/\['database'/);
  });

  it('connects WhatsApp to the business account, with no export beside it', () => {
    /*
     * An exported chat is a file somebody remembers to send: a day old when
     * it lands, and it stops arriving the week everybody is busy. The point
     * of watching WhatsApp is that a customer said something an hour ago.
     *
     * Offering both made the weaker one look like an equal choice. It is
     * the fallback for an application with no WhatsApp Business connector,
     * and nothing more — so the branch turns on the connector existing, not
     * on what the industry's providers list happens to say. That list was
     * written before the connector existed, and was still sending
     * applications that could connect live off to find a file.
     */
    expect(ui).toContain("if (biz) {");
    expect(ui).toContain("d.goAction = 'whatsapp-business';");
    expect(ui).not.toContain("Import an exported chat</button>");
    expect(ui).not.toContain("providers.indexOf('business-account')");
  });

  it('keeps the export as the only way in when there is no connector', () => {
    // Removing it outright would leave an application that shipped without
    // the WhatsApp Business module with a card and no way through it.
    expect(ui).toContain("d.go = w.length ? 'Import another export' : 'Import an exported chat'; d.goAction = 'whatsapp';");
  });

  it('never offers a card for a connector this application does not have', () => {
    // A Connect button that opens a flow the server will refuse is worse
    // than no button: it reads as a product that does not work.
    expect(ui).toContain('function shipped(kind)');
    expect(ui).toContain("k.kind === kind || (kind === 'whatsapp' && k.kind === 'whatsapp-business')");
  });

  it('keeps Documents out of the systems, under its own heading', () => {
    expect(ui).toContain("s.kind !== 'form' && s.kind !== 'file' && s.kind !== 'folder'");
    expect(ui).toContain('function otherCards() { return [DEFAULT_FOLDER]; }');
    expect(html).toContain('<h3 class="dt-other__head">Other data</h3>');
    expect(html).toContain('id="dt-other-cards"');
  });

  it('puts one line on a card and leaves the detail to the flow', () => {
    // The spec sheet — PostgreSQL and MySQL, read-only — is true and is the
    // answer to a question nobody has asked before pressing Connect.
    expect(ui).toContain("d.note = 'Capture calls and call signals.';");
    expect(ui).toContain("d.note = 'Customer conversations and requests.';");
    expect(ui).toContain("d.note = 'Your existing application data.';");
    expect(ui).toContain("d.note = 'Bring spreadsheets and existing business records.';");
  });

  it('still says where the records stay, below rather than in the headline', () => {
    /*
     * The promise was the second half of the subheading, where it met
     * somebody who had not yet decided to connect anything. It is still
     * made — it is the reason a business can connect its phone system at
     * all — just where the question actually occurs.
     */
    expect(html).toContain('Records stay in this application&rsquo;s own database. Nothing reaches Svarg.');
    expect(ui).toContain('Bring the systems your business already uses. Svarg reads them together to find what needs attention.');
  });
});
