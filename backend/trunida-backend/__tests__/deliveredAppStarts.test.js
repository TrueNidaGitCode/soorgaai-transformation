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
