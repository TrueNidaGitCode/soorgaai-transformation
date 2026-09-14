/**
 * An inline script that does not parse takes the whole page with it.
 *
 * A one-line edit put an `else` between two `else if` branches in
 * index.html. That is a SyntaxError, the browser discarded the entire inline
 * script, and with it went sign-in, the continue button and every control on
 * the page. The application was serving HTTP 200 and answering questions the
 * whole time, so nothing watching the server saw anything wrong.
 *
 * Every .js file in the project is parsed by node --check on its way through
 * the builder's import guard. The JavaScript inside .html was parsed by
 * nobody.
 */

import { describe, it, expect } from 'vitest';
import vm from 'vm';
import { buildManifest } from '../services/eameProjectBuilder.js';

/** The contents of every inline <script> that is not a src= reference. */
function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;                 // loaded separately
    if (/type\s*=\s*["'](?!text\/javascript|module)/i.test(attrs)) continue;  // JSON, templates
    out.push(m[2]);
  }
  return out;
}

const files = buildManifest({ includeJira: true, appName: 'Six Cricket' });
const pages = files.filter(f => f.path.endsWith('.html'));

describe('every page a customer opens can actually run', () => {
  it('ships at least one page, so this test cannot pass by finding nothing', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const page of pages) {
    const scripts = inlineScripts(page.content);

    it(`${page.path}: its inline scripts parse`, () => {
      scripts.forEach((src, i) => {
        // new vm.Script compiles without executing: a parse error throws here
        // exactly as the browser would refuse the block.
        expect(() => new vm.Script(src, { filename: `${page.path}#${i + 1}` })).not.toThrow();
      });
    });
  }
});

describe('the shape of the mistake that caused it', () => {
  it('has no `else` sitting before an `else if` in any page', () => {
    // The parse check above is the real guard. This one names the specific
    // error so a failure says what happened rather than only where.
    for (const page of pages) {
      for (const src of inlineScripts(page.content)) {
        const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        expect(stripped).not.toMatch(/\belse\s*\{[^{}]*\}\s*else\s+if\b/);
      }
    }
  });
});
