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
    /*
     * Nothing waits the full time unnecessarily — the poll resolves on the
     * first response of any kind.
     *
     * It used to resolve only on a status under 500, which is why the
     * timeout mattered so much: an application answering 503 was polled
     * until the clock ran out and then called dead. Both halves of that are
     * now fixed, and this asserts the half that made the other one visible.
     */
    expect(verifier).toMatch(/const res = await fetch\(`http:\/\/127\.0\.0\.1:\$\{port\}\$\{smokePath\}`\);\s*\n\s*clearInterval\(poll\);/);
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

describe('a degraded sandbox is not a broken application', () => {
  /*
   * ── Three builds, three wrong diagnoses ──────────────────────────────────
   *
   * `/api` on a delivered application is its health endpoint. It answers 503
   * when anything a customer depends on is missing — added deliberately, after
   * a crashed application was read as live for a week.
   *
   * The boot gate polls that same path and accepted only a status under 500.
   * The verification child is started from nothing, on purpose, so that a build
   * cannot depend on a variable that happens to be set on the build machine —
   * which means no model key and no sign-in secret, which means an honest 503.
   *
   * So every build failed at boot, reporting "the server did not start" about
   * an application that had started, connected, seeded, listened and begun
   * watching. The log inside the failure said so. A physiotherapy clinic lost
   * three attempts to it.
   *
   * The two questions are now separate: did it start (does it answer at all),
   * and is it well (this). Only the checks the sandbox itself makes impossible
   * are forgiven.
   */
  const verifier = readFileSync(
    new URL('../services/generatedProjectVerifier.js', import.meta.url), 'utf8');

  it('treats any answer as proof the server started', () => {
    // Whether the answer is acceptable belongs to the smoke gate, one stage
    // down. Conflating them is what produced the wrong diagnosis.
    expect(verifier).not.toContain('if (res.status < 500) { clearInterval(poll)');
    expect(verifier).toMatch(/Any answer proves it started/);
  });

  it('forgives only what a sandbox cannot supply', () => {
    expect(verifier).toContain("const SANDBOX_BLIND = new Set(['model', 'sign-in']);");
  });

  it('still fails a build whose database or datasets are broken', () => {
    /*
     * The half that must not be lost. Neither is the sandbox's fault: the
     * verifier hands the child a working database, and the dataset index
     * ships with the project. A 503 naming either is a real failure.
     */
    expect(verifier).toMatch(/const real = failed\.filter\(name => !SANDBOX_BLIND\.has\(name\)\)/);
    expect(verifier).toMatch(/the application reports \$\{detail\}/);
  });

  it('refuses a 5xx that is not an honest health report', () => {
    // A 500 with no checks is a crash, not candour.
    expect(verifier).toMatch(/answered 503 with no health report/);
    expect(verifier).toMatch(/answered 503 but reported nothing wrong/);
  });

  it('says on the record that it passed a degraded application', () => {
    // A pass that hides what it forgave is how the next real degradation gets
    // through. The note travels with the verdict.
    expect(verifier).toMatch(/note: `answered \$\{started\.status\}: \$\{verdict\.why\}`/);
  });
});

describe('a delivered application runs no script of Svarg\'s', () => {
  it('ships no seed script that executes itself on import', async () => {
    /*
     * ── What this cost ─────────────────────────────────────────────────────
     *
     * scripts/seed_defect_records.mjs was copied from the platform into every
     * delivered application. It ends with `run().catch(err => { ...;
     * process.exit(1) })` — it runs the moment it is imported.
     *
     * seedIfEmpty() imports every scripts/seed*.mjs to look for the default
     * export the seed contract requires. Importing this one started a Svarg
     * maintenance job inside the customer's application, which needed a key
     * the application does not have, and killed the process seconds after it
     * began listening.
     *
     * The same rule as the auth middleware, learned twice in one afternoon: a
     * customer's application carries nothing that exists for Svarg's benefit.
     */
    const { buildManifest } = await import('../services/eameProjectBuilder.js');
    const seeds = buildManifest({ appName: 'Probe' })
      .filter(f => /^scripts\/seed.*\.m?js$/i.test(f.path));

    for (const s of seeds) {
      expect(s.content, `${s.path} must export the default the seed contract asks for`)
        .toMatch(/export\s+default/);
      expect(s.content, `${s.path} must not run itself on import`)
        .not.toMatch(/^\s*(run|main)\(\)\s*[.;]/m);
    }
  });

  it('ships nothing that can end the process on its own', async () => {
    /*
     * A file that calls process.exit is a file that can take a customer's
     * application down for a reason of its own. server.js may — it owns the
     * startup — and the token minting script is run by hand from a shell.
     */
    const { buildManifest } = await import('../services/eameProjectBuilder.js');
    const offenders = buildManifest({ appName: 'Probe' })
      .filter(f => /\.m?js$/.test(f.path))
      .filter(f => /process\.exit\(/.test(f.content))
      .map(f => f.path)
      .filter(p => !['server.js', 'scripts/mint-token.mjs'].includes(p));
    expect(offenders).toEqual([]);
  });
});

describe('every screen is a page of the same application', () => {
  /*
   * ── What the customer saw ────────────────────────────────────────────────
   *
   * Home and Ask sat inside the shell and kept the sidebar. Data, Watchers and
   * People were siblings of it and hid the whole thing to show themselves — so
   * three screens out of five threw away the navigation and looked like a
   * different product, with no way back except a "Back to the chat" link.
   *
   * Each of them also carried its own copy of the hiding, in its own file, so
   * one symptom was three separate bugs. They now sit inside the main pane and
   * go through one switcher.
   */
  const shell = readFileSync(
    new URL('../eame-template/frontend/index.html', import.meta.url), 'utf8');

  /** Everything between the shell opening and its matching close. */
  const insideShell = (() => {
    const start = shell.indexOf('<div class="ch-app" id="ch-app"');
    const main = shell.indexOf('<div class="ch-main" id="ch-main">', start);
    // ch-main closes before ch-app; take to the end of the shell either way.
    const end = shell.indexOf('\n  </div>', main);
    return shell.slice(start, end);
  })();

  it('keeps every panel inside the shell, so the sidebar never disappears', () => {
    for (const id of ['ch-findings', 'ch-finding', 'ch-agents', 'ch-data']) {
      expect(insideShell, `${id} must live inside the shell`).toContain(`id="${id}"`);
    }
  });

  it('has one switcher rather than a copy per panel', () => {
    expect(shell).toContain('window.svargShowPanel = showPanel;');
    expect(shell).toMatch(/var PANELS = \[/);
  });

  it('never hides the shell to show a panel', () => {
    /*
     * The line that caused it, in three files. Each may still fall back to the
     * old behaviour when the switcher is absent — an application built before
     * this and updated in place — but must reach for the switcher first.
     */
    for (const f of ['data.js', 'agents.js', 'access.js']) {
      const js = readFileSync(
        new URL(`../eame-template/frontend/${f}`, import.meta.url), 'utf8');
      expect(js, `${f} must ask the shell to switch`).toMatch(/window\.svarg(ShowPanel|GoHome)/);
    }
  });

  it('puts the People panel in the shell rather than on the body', () => {
    const js = readFileSync(
      new URL('../eame-template/frontend/access.js', import.meta.url), 'utf8');
    expect(js).toContain("document.querySelector('.ch-main') || document.body");
  });

  it('lets a panel scroll, because the pane it now lives in does not', () => {
    /*
     * .ch-main is height:100vh with overflow:hidden — right for a chat log
     * that scrolls itself, and it would CLIP a long panel rather than let it
     * move. Without this the bottom of Watchers is simply unreachable.
     */
    const css = readFileSync(
      new URL('../eame-template/frontend/app.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.ch-main > \.ag,/);
    expect(css).toMatch(/overflow-y: auto;/);
  });
});
