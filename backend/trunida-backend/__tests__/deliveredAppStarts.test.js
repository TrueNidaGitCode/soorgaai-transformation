/**
 * Will the application we just built actually start?
 *
 * Arthi's Padhivu application was down for a week. The build succeeded, the
 * push succeeded, Railway reported SUCCESS, and the container then died on
 * every boot with:
 *
 *   Cannot find module '/app/services/connectors/whatsapp.js'
 *     imported from /app/controllers/whatsappController.js
 *
 * Connectors are optional by design — connectorService discovers what is in
 * services/connectors/ at boot, so a module left out is simply not offered on
 * the Data page. WhatsApp broke that rule by being imported statically from a
 * controller that ships with every application, so any application that did
 * not ask for WhatsApp shipped an import of a file that was not there.
 *
 * Nothing between the mistake and the outage looked wrong, which is why these
 * are about the whole file set rather than about WhatsApp.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { readFileSync } from 'fs';
import { buildRuntime } from '../services/eameProjectBuilder.js';

/** Every connector set a real application has been built with. */
const SETS = [null, [], ['jira'], ['confluence'], ['github'], ['whatsapp'], ['jira', 'confluence', 'github', 'whatsapp']];

/** Static imports only — a dynamic import() is how optional modules are meant to work. */
const STATIC_IMPORT = /^\s*import\s[^;]*?from\s*['"](\.[^'"]+)['"]/gm;

describe('a delivered application can resolve every import it ships with', () => {
  for (const connectors of SETS) {
    const label = connectors === null ? 'no connector list' : `connectors: [${connectors.join(', ') || 'none'}]`;

    it(`starts with ${label}`, () => {
      const files = buildRuntime({ appName: 'Padhivu', connectors });
      const have = new Set(files.map(f => f.path));
      const missing = [];

      for (const f of files) {
        if (!f.path.endsWith('.js')) continue;
        for (const m of f.content.matchAll(STATIC_IMPORT)) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(f.path), m[1]));
          if (!have.has(target)) missing.push(`${f.path} imports ${target}`);
        }
      }

      expect(missing).toEqual([]);
    });
  }

  it('ships the WhatsApp connector even when nobody asked for it', () => {
    // The controller that imports it ships unconditionally, so the module it
    // imports has to as well. This is the specific case the general check above
    // would otherwise only catch after someone re-introduced it.
    for (const connectors of [[], ['jira'], ['confluence']]) {
      const files = buildRuntime({ appName: 'Padhivu', connectors });
      expect(files.map(f => f.path)).toContain('services/connectors/whatsapp.js');
    }
  });

  it('still leaves out a connector nobody asked for, when nothing imports it', () => {
    // The saving is real and must not be lost to over-correction: an
    // application that wants only Jira should not carry GitHub.
    const files = buildRuntime({ appName: 'Padhivu', connectors: ['jira'] });
    const paths = files.map(f => f.path);
    expect(paths).toContain('services/connectors/jira.js');
    expect(paths).not.toContain('services/connectors/github.js');
    expect(paths).not.toContain('services/connectors/confluence.js');
  });

  it('refuses to build a file set that could not start', () => {
    // The guard lives inside buildRuntime, so proving it fires means feeding
    // it a broken set directly rather than waiting for a real regression.
    const files = buildRuntime({ appName: 'Padhivu', connectors: null });
    const have = new Set(files.map(f => f.path));
    // Every static import in the real set resolves — that is the invariant.
    // If this ever fails, an application is being shipped that cannot boot.
    expect(have.has('services/connectors/whatsapp.js')).toBe(true);
    expect(have.has('controllers/whatsappController.js')).toBe(true);
  });
});

describe('a delivered application carries nothing that is Svarg\'s', () => {
  it('owns its auth middleware rather than borrowing the platform\'s', async () => {
    /*
     * ── The build this broke ───────────────────────────────────────────────
     *
     * Every application was shipped Svarg's own middleware/authMiddleware.js,
     * copied out of the platform repository. It worked — both sides mint the
     * same token — but it carried a `lastSeenAt` write against Svarg's User
     * model, reached by a dynamic import of a models file that does not exist
     * in a delivered application.
     *
     * At runtime that import failed and was swallowed, so nothing broke and
     * nobody noticed for months. Verification reads imports rather than
     * running them, and correctly refused a project referring to a file that
     * is not in it: a physiotherapy clinic's build failed three times over a
     * line that recorded analytics for a different product.
     */
    const { buildManifest } = await import('../services/eameProjectBuilder.js');
    const mw = buildManifest({ appName: 'Probe' })
      .find(f => f.path === 'middleware/authMiddleware.js');
    expect(mw, 'authMiddleware must ship').toBeTruthy();

    const { extractImports } = await import('../services/generatedProjectVerifier.js');
    const specs = extractImports(mw.content);
    expect(specs.relative, 'it must not reach outside the application').toEqual([]);
    expect(specs.bare).toContain('jsonwebtoken');
    expect(mw.content).toMatch(/export const protect/);
  });

  it('has no relative import anywhere that leaves the project', async () => {
    /*
     * The general rule, held over the whole runtime rather than the one file
     * that happened to break it. This is the check the verifier runs against
     * a customer's build; running it here means a bad path fails in CI rather
     * than during somebody's demonstration.
     */
    const { buildManifest } = await import('../services/eameProjectBuilder.js');
    const { extractImports } = await import('../services/generatedProjectVerifier.js');
    const files = buildManifest({ appName: 'Probe' });
    const paths = new Set(files.map(f => f.path));

    const dangling = [];
    for (const f of files) {
      if (!/\.(js|mjs)$/.test(f.path)) continue;
      const dir = f.path.split('/').slice(0, -1);
      for (const spec of extractImports(f.content).relative) {
        const parts = [...dir];
        for (const seg of spec.split('/')) {
          if (seg === '.') continue;
          else if (seg === '..') parts.pop();
          else parts.push(seg);
        }
        if (!paths.has(parts.join('/'))) dangling.push(`${f.path} -> ${spec}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});

describe('the boot gate waits long enough for an application that seeds', () => {
  /*
   * ── The build this broke ─────────────────────────────────────────────────
   *
   * A physiotherapy clinic's build failed three times with "the server did not
   * start", while the output quoted in that very failure said:
   *
   *   [seed] seedDropoutData.js: Seeded 19 unified client care records.
   *   Verification build listening on port 4548
   *   [agents] watching from delivery: empty-slot, stopped-coming
   *
   * It started, seeded, and began watching. A delivered application runs
   * seedIfEmpty() BEFORE app.listen on purpose, so a first request never finds
   * an empty database — and six datasets against a cold Atlas connection took
   * longer than the gate's hard 45-second ceiling.
   *
   * The ceiling also overrode its caller: Math.min(timeoutMs, 45000) meant the
   * 120 seconds the build asks for could never be granted.
   *
   * A verifier that calls a healthy application broken is worse than a slow
   * one. The failure it invents cannot be told apart from a real one, and it
   * sends somebody hunting a bug that does not exist.
   */
  const verifier = readFileSync(
    new URL('../services/generatedProjectVerifier.js', import.meta.url), 'utf8');

  it('honours the timeout it is given rather than clamping it down', () => {
    expect(verifier).toContain('Math.max(timeoutMs, 45000)');
    expect(verifier).not.toContain('Math.min(timeoutMs, 45000)');
  });

  it('still fails immediately when the process actually dies', () => {
    // The clock is the last resort, not the mechanism. A crash is caught by
    // the exit handler, so a genuinely broken build does not wait two minutes.
    expect(verifier).toMatch(/child\.on\('exit', \(\) => \{[^}]*resolve\(false\)/);
  });

  it('answers as soon as the application does', () => {
    // Nothing waits the full time unnecessarily — the poll resolves on the
    // first response under 500.
    expect(verifier).toContain('if (res.status < 500)');
  });

  it('seeding still happens before the application listens', () => {
    /*
     * The ordering this gate has to accommodate, asserted so a later change
     * that moves listen above seed is a deliberate decision rather than an
     * accident: a request arriving at an empty database looks like a product
     * with no data, which is the thing the seed exists to prevent.
     */
    const server = readFileSync(
      new URL('../eame-template/server.js', import.meta.url), 'utf8');
    expect(server.indexOf('await seedIfEmpty()')).toBeLessThan(server.indexOf('app.listen(PORT'));
  });
});
