/**
 * Svarg — the categories a delivered application groups its findings under
 *
 * A findings board needs headings, and the right headings are the ones the
 * business already uses. A physiotherapy centre thinks in Retention,
 * Utilisation, Growth, Cash and Compliance. An engineering organisation thinks
 * in Schedule, Quality, Cost, People, Customer and Risk. The same watcher —
 * "somebody stopped turning up" — is Retention in one and Adoption in another.
 *
 * ── Why this is parsed rather than inferred ────────────────────────────────
 *
 * Everything else in the knowledge base is prose written for a model. This is
 * read by code, deliberately.
 *
 * The categories decide how a screen is laid out: which chips appear, in what
 * order, and which finding lands under which one. That is navigation, not an
 * answer. It has to be identical every morning for the same business, and the
 * same for two businesses in the same trade — otherwise two customers in one
 * industry get screens that cannot be discussed together. A model asked to
 * infer categories from a paragraph would produce a defensible list every time
 * and a slightly different one each time, and nothing would ever report that
 * it had drifted.
 *
 * So each industry states its categories in a table, and this reads the table.
 * Publishing a new industry still defines its own categories with no code
 * change — which was the point of keeping it in the knowledge base at all.
 */

import fs from 'fs';
import path from 'path';
import { KB_ENTERPRISE_ROOT } from './strategyCanvasService.js';

/**
 * Where an industry's table lives.
 *
 * Under AI_Use_Cases because that is the one domain every covered industry
 * has a folder in. The filename is not a registered capability, so nothing
 * loads it into a prompt: it sits in the knowledge base and is read only here.
 */
function fileFor(industry) {
  return path.join(KB_ENTERPRISE_ROOT, 'AI_Use_Cases', industry, `${industry}_Attention_Areas.md`);
}

/** A markdown table row into its cells, without the empty edges. */
function cells(line) {
  return line.split('|').map(s => s.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
}

/**
 * The categories for one industry, in the order they should be shown.
 *
 * Returns [] when the industry has no table — which every caller treats as
 * "fall back to the generic areas", so an industry published before this, or
 * one grounded on core content only, keeps working.
 *
 * @returns {{name: string, asks: string, watchers: string[]}[]}
 */
export function attentionAreas(industry) {
  let text = '';
  try { text = fs.readFileSync(fileFor(industry), 'utf8'); }
  catch { return []; }

  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s+Attention Areas\s*$/.test(l.trim()));
  if (start < 0) return [];

  const out = [];
  const seen = new Set();
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) { if (out.length) break; else continue; }
    const c = cells(line);
    if (c.length < 3) continue;
    // The header row and the --- separator beneath it.
    if (/^-+$/.test(c[0]) || c[0].toLowerCase() === 'category') continue;

    const name = c[0];
    const asks = c[1];
    const watchers = c[2].split(',').map(s => s.trim()).filter(Boolean)
      // A watcher named twice belongs to the first category that claimed it,
      // so a careless edit cannot put one finding under two headings.
      .filter(id => !seen.has(id) && seen.add(id) !== undefined);

    if (name) out.push({ name, asks, watchers });
  }
  return out;
}

/**
 * Which category a watcher belongs to, for this industry.
 *
 * Anything the table does not name falls into the last category rather than
 * into a heading called "Other": a business does not have an Other, and an
 * escape hatch is where watchers quietly go to be ignored.
 */
export function categoryOf(areas, watcherId) {
  if (!areas?.length) return '';
  for (const a of areas) if (a.watchers.includes(watcherId)) return a.name;
  return areas[areas.length - 1].name;
}

/** The shape the delivered application reads out of data/agents.json. */
export function categoriesFor(industry) {
  return attentionAreas(industry).map(a => ({
    name: a.name, asks: a.asks, watchers: a.watchers,
  }));
}
