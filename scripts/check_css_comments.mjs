/**
 * Guards against a CSS comment closing earlier than the author intended.
 *
 * A stray "*" immediately before "/" inside comment prose (e.g. writing
 * ".pd-header*" then "/.pd-winner") terminates the comment right there.
 * Everything after it is then parsed as one enormous invalid selector and
 * silently discarded — in one real case, 8,590 lines of CSS, which made
 * two whole screens render completely unstyled with no console error.
 *
 * Brace-balance checks do NOT catch this: the braces stay balanced.
 * The stylesheet still returns HTTP 200. Nothing fails loudly. So check
 * for it explicitly.
 *
 * Usage: node scripts/check_css_comments.mjs [...cssFiles]
 *        (defaults to every .css under frontend/)
 * Exits non-zero when a suspect comment is found.
 */
import fs from 'fs';
import path from 'path';

function collectCss(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectCss(full, out);
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

function scan(file) {
  const css = fs.readFileSync(file, 'utf8');
  const problems = [];
  let i = 0, line = 1, inComment = false, startLine = 0, depth = 0;

  while (i < css.length) {
    if (css[i] === '\n') line++;
    if (!inComment && css[i] === '{') depth++;
    if (!inComment && css[i] === '}') depth = Math.max(0, depth - 1);
    if (!inComment && css[i] === '/' && css[i + 1] === '*') {
      inComment = true; startLine = line; i += 2; continue;
    }
    // Only top-level comments matter. A comment inside a rule block is
    // followed by declarations, which legitimately look nothing like a
    // selector — checking those produces only false positives.
    if (inComment && depth > 0 && css[i] === '*' && css[i + 1] === '/') {
      inComment = false; i += 2; continue;
    }
    if (inComment && css[i] === '*' && css[i + 1] === '/') {
      // After a close, whatever precedes the next "{" is what the browser
      // treats as a selector. Comments and @rules are fine; otherwise, if
      // that candidate reads like a sentence rather than a selector, the
      // comment closed somewhere the author didn't mean it to.
      const rest = css.slice(i + 2);
      const nextBrace = rest.indexOf('{');
      if (nextBrace !== -1) {
        let candidate = rest.slice(0, nextBrace);
        // Strip fully-formed comments that legitimately sit between rules.
        candidate = candidate.replace(/\/\*[\s\S]*?\*\//g, ' ');
        // Selectors never contain apostrophes (they'd open a CSS string)
        // and never run to sentence punctuation. Long comma-separated
        // selector lists are legitimate, so length alone isn't enough.
        const hasApostrophe = /['']/.test(candidate);
        const hasSentence = /[a-z]{2}\.\s+[A-Z]/.test(candidate) || /\b(the|this|that|from|which|because|rather)\b/i.test(candidate);
        if (hasApostrophe || hasSentence) {
          problems.push({
            startLine, endLine: line,
            tail: candidate.replace(/\s+/g, ' ').trim().slice(0, 90),
            reason: hasApostrophe ? 'contains an apostrophe (would open a CSS string)' : 'reads as prose, not a selector',
          });
        }
      }
      inComment = false; i += 2; continue;
    }
    i++;
  }
  if (inComment) problems.push({ startLine, endLine: -1, tail: '<unterminated comment>' });
  return problems;
}

const args = process.argv.slice(2);
const files = args.length ? args : collectCss('frontend');

let failed = false;
for (const f of files) {
  for (const p of scan(f)) {
    failed = true;
    console.error(`${f}: comment opened line ${p.startLine} closes early at line ${p.endLine} — ${p.reason || ''}`);
    console.error(`   text the browser would treat as a selector: ${p.tail}`);
  }
}

if (failed) {
  console.error('\nA comment is closing early. Remove the stray "*/" from the prose.');
  process.exit(1);
}
console.log(`OK — ${files.length} stylesheet(s), no early-closing comments.`);
