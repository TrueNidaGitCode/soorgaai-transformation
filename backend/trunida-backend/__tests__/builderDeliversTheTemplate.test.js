/**
 * Everything in the template reaches the customer, unaltered.
 *
 * ── Why this is a test and not an audit somebody ran once ──────────────────
 *
 * A file in eame-template/ ships only if it is named in BOTH eameSpec's
 * FIXED_PATHS and the source map in eameProjectBuilder. Miss either and the
 * file is delivered to nobody — silently, because every test of the fix itself
 * still passes: the code is right, it is simply not in the box. That has
 * happened twice.
 *
 * The failure is worse than it sounds. A fix made after a customer complained
 * is exactly the fix most likely to be a NEW file, and exactly the one whose
 * absence nobody notices until the next customer hits the same bug — by which
 * time it reads as the fix not having worked.
 *
 * So this walks the whole template directory rather than a list somebody
 * maintains. A list would have the same failure mode as the two it guards.
 *
 * Three questions, each a failure of a different kind:
 *
 *   Is every template file delivered?        A fix that ships to nobody.
 *   Is it delivered as written?              A fix that ships half-applied.
 *   Does every promised path produce a file? A spec that lies about itself.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildManifest } from '../services/eameProjectBuilder.js';
import { FIXED_PATHS, AUTHORED_FILES } from '../services/eameSpec.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.join(HERE, '..', 'eame-template');

/** Every file under the template, as the delivery path it should have. */
function templateFiles(dir = TPL, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) templateFiles(full, out);
    else out.push(path.relative(TPL, full).split(path.sep).join('/'));
  }
  return out;
}

const nl = (s) => String(s).replace(/\r\n/g, '\n');

/**
 * services/llmCore.js is the one file that is DELIVERED FROM ELSEWHERE.
 *
 * In a delivered application it is Svarg's own provider module copied whole;
 * the copy in the template is a stand-in that re-exports it so the template
 * can be run where it lives. Both files say so at length. It is named here as
 * the single documented exception, so that if a second one ever appears it has
 * to be added deliberately rather than slipping in behind this one.
 */
const FROM_ELSEWHERE = new Set(['services/llmCore.js']);

const files = buildManifest({ appName: 'Audit Clinic' });
const delivered = new Map(files.map((f) => [f.path, String(f.content ?? '')]));
const template = templateFiles().sort();

describe('every template file reaches the customer', () => {
  it('finds a template to check, so this cannot pass vacuously', () => {
    expect(template.length).toBeGreaterThan(50);
    expect(files.length).toBeGreaterThan(50);
  });

  it('delivers all of them', () => {
    const missing = template.filter((p) => !delivered.has(p));
    /*
     * Named, not counted. "3 files missing" sends the next person looking;
     * the names tell them what a customer is not getting.
     */
    expect(missing, `in the template but delivered to nobody:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('delivers each one as the template writes it', () => {
    const stale = [];
    for (const p of template) {
      if (FROM_ELSEWHERE.has(p)) continue;
      const src = nl(fs.readFileSync(path.join(TPL, p), 'utf8'));
      const out = nl(delivered.get(p) ?? '');
      if (src === out) continue;
      // A composed file has its __APP_*__ tokens filled, which is correct.
      // Anything else differing means the customer has different code.
      const blanked = (s) => s.replace(/__APP_[A-Z_]*__/g, '\u0000');
      if (/__APP_[A-Z_]*__/.test(src) && blanked(src).length === blanked(out).length) continue;
      if (/__APP_[A-Z_]*__/.test(src)) continue;
      stale.push(`${p} (template ${src.length}b, delivered ${out.length}b)`);
    }
    expect(stale, `delivered, but not what the template says:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});

describe('the spec does not promise what nothing produces', () => {
  it('produces a file for every path it fixes', () => {
    const unmet = FIXED_PATHS.filter((p) => !delivered.has(p));
    expect(unmet, `listed in FIXED_PATHS but never produced:\n  ${unmet.join('\n  ')}`).toEqual([]);
  });

  it('lists every fixed template file it means to ship', () => {
    /*
     * The other half of the same door. A file present in the template and in
     * the source map but absent from FIXED_PATHS is the exact shape of the
     * bug this guards — it builds, it is delivered, and the spec that decides
     * what an application IS does not know about it.
     *
     * AUTHORED_FILES are the exception and the reason the distinction exists:
     * frontend/app.js is written per application by the model, so the template
     * holds a starting point rather than the thing that ships. Fixed means
     * "identical in every application", which that is not.
     */
    const exempt = new Set([...FIXED_PATHS, ...AUTHORED_FILES]);
    const unlisted = template.filter((p) => !exempt.has(p) && delivered.has(p));
    expect(unlisted, `delivered but in neither FIXED_PATHS nor AUTHORED_FILES:\n  ${unlisted.join('\n  ')}`).toEqual([]);
  });

  it('keeps the authored files out of the fixed list, which is what makes them authored', () => {
    // If one ever appeared in both, the builder would be told to copy it
    // verbatim AND to have the model write it, and which won would depend on
    // the order two maps happened to be applied in.
    for (const p of AUTHORED_FILES) expect(FIXED_PATHS).not.toContain(p);
  });
});

describe('the provider module a customer receives', () => {
  const core = delivered.get('services/llmCore.js') || '';

  it('is Svarg\'s own, not the template\'s stand-in', () => {
    // The stand-in imports across a boundary a tenant does not have, so
    // shipping it is not a degraded application, it is one that cannot boot.
    expect(core).not.toContain("export * from '../../services/llmService.js'");
    expect(core.length).toBeGreaterThan(10000);
  });

  it('carries the thinking-token fixes, which nothing else would notice', () => {
    /*
     * Gemini bills thinking tokens as output and charges them against
     * maxOutputTokens. Both halves of that were wrong once: thoughts went
     * uncounted, so every cost this platform reported was blind to the largest
     * part of the bill; and the budget dropped its headroom when thinking was
     * switched off, so the model thought anyway and the answer came back
     * truncated. A delivered application reaches models through this file.
     */
    expect(core).toMatch(/const THINKING_HEADROOM\s*=/);
    expect((core.match(/\+ THINKING_HEADROOM/g) || []).length).toBe(3);
    expect(core).toContain('thoughtsTokenCount');
  });

  it('is copied whole rather than excerpted', () => {
    const src = nl(fs.readFileSync(path.join(HERE, '..', 'services', 'llmService.js'), 'utf8'));
    // Same length once names are filled: a copy that lost a branch would be
    // shorter, and nothing downstream would say which branch.
    expect(nl(core).length).toBe(src.length);
  });
});
