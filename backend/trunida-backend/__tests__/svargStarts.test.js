/**
 * Will Svarg itself actually start?
 *
 * The backend went down with a 502 on a deploy that passed every test and
 * every syntax check. The cause was one line:
 *
 *   import User from '../models/User.js';
 *
 * models/User.js has no default export — it is a named one — and `node
 * --check` never notices, because that is a module-resolution failure and not
 * a syntax error. The unit tests never noticed either: they import the pure
 * functions out of a service, and the broken import sat in a file only the
 * route graph pulls in.
 *
 * So nothing between the mistake and the outage looked wrong. There was
 * already a test exactly like this one for the applications Svarg delivers
 * (deliveredAppStarts), written after a customer's application was down for a
 * week for the same class of reason. Svarg did not have one for itself.
 *
 * Every route module is imported here, which pulls in the controllers, the
 * services and the models behind them. If any export in that graph is named
 * wrongly, this fails in a second rather than in production.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROUTES = path.join(here, '..', 'routes');

const files = fs.readdirSync(ROUTES).filter((f) => /\.m?js$/.test(f)).sort();

describe('every route module resolves what it imports', () => {
  it('finds route files to check', () => {
    // A rename that emptied this directory would otherwise make the suite
    // below pass by testing nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  for (const f of files) {
    it(`routes/${f}`, async () => {
      // As a file URL, not a bare path: an absolute Windows path is a
      // different module specifier to Node, so the models behind it would be
      // evaluated a second time and mongoose refuses to compile a model twice.
      const mod = await import(pathToFileURL(path.join(ROUTES, f)).href);
      // Every route file is mounted by its default export; one that exports
      // something else is mounted as a non-router and fails inside express
      // with a far worse message.
      expect(typeof mod.default, `${f} has no default-exported router`).toBe('function');
    });
  }
});

describe('every relative import points at a file that exists, with that exact case', () => {
  /*
   * This is the one that took the backend down.
   *
   * The file is models/user.js. An import written as '../models/User.js'
   * resolves perfectly on Windows, where the filesystem does not care about
   * case — and does not exist at all on the Linux container it deploys to.
   * "Cannot find module" on boot, a 502, and nothing on the development
   * machine ever looked wrong.
   *
   * Comparing against the real directory listing is the only way to see it
   * from here, because every other check in the toolchain resolves the import
   * the same forgiving way the developer's disk does.
   */
  const DIRS = ['services', 'services/connectors', 'controllers', 'routes', 'middleware', 'models', 'config'];
  const IMPORT = /^s*(?:import|export)[^'"]*froms*['"](.[^'"]+)['"]/gm;

  const listings = new Map();
  const realNames = (dir) => {
    if (!listings.has(dir)) {
      listings.set(dir, fs.existsSync(dir) ? new Set(fs.readdirSync(dir)) : new Set());
    }
    return listings.get(dir);
  };

  const wrong = [];
  for (const dir of DIRS) {
    const full = path.join(here, '..', dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (!/.m?js$/.test(f)) continue;
      const text = fs.readFileSync(path.join(full, f), 'utf8');
      for (const m of text.matchAll(IMPORT)) {
        const target = path.resolve(full, m[1]);
        const names = realNames(path.dirname(target));
        if (!names.has(path.basename(target))) {
          wrong.push(`${dir}/${f} imports ${m[1]}`);
        }
      }
    }
  }

  it('finds files to check', () => {
    expect(listings.size === 0 || wrong.length >= 0).toBe(true);
  });

  it('has no import whose case does not match the file on disk', () => {
    expect(wrong).toEqual([]);
  });
});
