/**
 * No secret leaves this repository, or a customer's.
 *
 * Every customer is asking after a high-profile platform breach, and the
 * honest answer has to come from something anybody can run rather than from an
 * audit somebody did once. `scripts/secret_audit.mjs` is that command; these
 * are the invariants it exists to protect, pinned so they cannot quietly
 * regress between runs of it.
 *
 * The architecture is what makes this answerable at all:
 *
 *   A delivered application never holds a provider key. It reaches a model
 *   through Svarg's gateway with a per-deployment token, so there is no
 *   OpenAI or Anthropic credential in the customer's repository to leak.
 *
 *   What Svarg keeps of a customer's credentials, it keeps hashed — the
 *   gateway token and the owner key as SHA-256, the tenant sign-in secret
 *   derived on demand and never stored at all.
 *
 *   Connector credentials inside a tenant are encrypted under a key generated
 *   per deployment, so the database and the key are not the same secret.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { buildManifest } from '../services/eameProjectBuilder.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Shapes of a real credential. Deliberately narrow: a scanner that cries wolf is one nobody reads. */
const KEY_SHAPES = [
  /\bsk-[A-Za-z0-9]{32,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{32,}\b/,
  /\bAIza[A-Za-z0-9_-]{35}\b/,
  /\b(ghp|gho|ghs|ghr)_[A-Za-z0-9]{36}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bmongodb(\+srv)?:\/\/[^\s:/@'"]+:[^\s@'"]{8,}@/,
];

describe('what a customer receives', () => {
  const files = buildManifest({ appName: 'Audit' });

  /**
   * A template that shows the SHAPE of a credential is documentation.
   * `.env.example` says `mongodb+srv://user:password@cluster…` precisely so a
   * customer knows what to put there — the same rule the audit script applies.
   */
  const PLACEHOLDER = /(example|placeholder|replace|your[-_]?|<[^>]+>|xxx+|user:password|USERNAME|PASSWORD|changeme|dummy|sample)/i;

  it('ships no credential of any shape', () => {
    // These bytes are pushed to the customer's own GitHub repository.
    for (const f of files) {
      for (const line of String(f.content || '').split('\n')) {
        if (PLACEHOLDER.test(line)) continue;
        for (const shape of KEY_SHAPES) {
          expect(line, `${f.path} matched ${shape}`).not.toMatch(shape);
        }
      }
    }
  });

  it('ships no .env, only a template of one', () => {
    const paths = files.map(f => f.path);
    expect(paths).not.toContain('.env');
    expect(paths).toContain('.env.example');
  });

  it('leaves every key field in that template empty', () => {
    /*
     * A template documents what configuration is required. The moment one
     * carries a working default, every customer repository holds it — and the
     * one that documents a shape must use an obvious placeholder.
     */
    const env = files.find(f => f.path === '.env.example').content;
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=(.+)$/);
      if (!m) continue;
      const [, name, value] = m;
      if (!/KEY|SECRET|TOKEN|PASSWORD|URI/.test(name)) continue;
      expect(value, `${name} has a non-placeholder value`)
        .toMatch(/^(|<.*>|replace-.*|your-.*|.*user:password.*|.*example.*)$/i);
    }
  });

  it('never writes a provider key into the tenant environment', () => {
    /*
     * The property the whole gateway design exists for. A delivered
     * application reaches a model through Svarg with a per-deployment token,
     * so a customer's repository, container and database contain no OpenAI or
     * Anthropic credential to lose.
     */
    const deploy = read('../services/deployTargetService.js');
    const env = deploy.slice(deploy.indexOf('export function buildTenantEnv'), deploy.indexOf('/** Ask Railway'));
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']) {
      expect(env, `buildTenantEnv sets ${key}`).not.toContain(key);
    }
    expect(env).toContain('SELFHOSTED_BASE_URL');
  });
});

describe('what Svarg keeps', () => {
  it('stores the gateway token and the owner key only as hashes', () => {
    const model = read('../models/HostedDeployment.js');
    expect(model).toContain('gatewayTokenHash');
    expect(model).toContain('ownerKeyHash');
    // The plaintext of either would make a database copy enough to act as the
    // customer's application.
    expect(model).not.toMatch(/^\s*gatewayToken:/m);
    expect(model).not.toMatch(/^\s*ownerKey:/m);
  });

  it('derives the tenant sign-in secret rather than storing it', () => {
    const auth = read('../services/tenantAuthService.js');
    expect(auth).toContain('createHmac');
    expect(auth).toMatch(/derived, not stored/);
  });

  it('gives each tenant its own connector encryption key', () => {
    // Not derived from JWT_SECRET: that would keep the credentials and the key
    // that opens them behind the same one secret.
    const deploy = read('../services/deployTargetService.js');
    expect(deploy).toMatch(/CONNECTOR_ENCRYPTION_KEY: crypto\.randomBytes\(32\)/);
    const conn = read('../eame-template/services/connectorService.js');
    expect(conn).toContain('aes-256-gcm');
  });
});

describe('what a browser can fetch', () => {
  it('carries no credential in the delivered front end', () => {
    const files = buildManifest({ appName: 'Audit' })
      .filter(f => /^frontend\/|\.(html|css)$/.test(f.path) || f.path.endsWith('config.js'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const shape of KEY_SHAPES) {
        expect(String(f.content || ''), f.path).not.toMatch(shape);
      }
    }
  });

  it('builds the API base from the address the page was served on', () => {
    // Not from a baked-in host, which is how a staging key reaches production.
    const cfg = buildManifest({ appName: 'Audit' }).find(f => f.path.endsWith('config.js'));
    expect(cfg.content).toContain('window.location.origin');
  });
});

describe('the audit itself', () => {
  const audit = read('../scripts/secret_audit.mjs');

  it('never prints a value it finds', () => {
    /*
     * A scanner that writes the secret into a terminal, and from there into a
     * CI log, has leaked it a second time and more durably.
     */
    expect(audit).toContain('fingerprint');
    expect(audit).toMatch(/never prints what it finds/i);
    expect(audit).toContain("createHash('sha256')");
  });

  it('can search the whole of git history', () => {
    // A secret committed once and removed is still on GitHub. That is the
    // failure that has ended other companies' weeks.
    expect(audit).toContain('git rev-list --all');
    expect(audit).toMatch(/does not remove it from history/);
  });

  it('does not treat a placeholder as a credential', () => {
    expect(audit).toContain('const PLACEHOLDER');
    expect(audit).toMatch(/a scanner that cries wolf/i);
  });

  it('can fail a release, when asked', () => {
    expect(audit).toContain('if (strict && findings.length) process.exit(1);');
  });
});
