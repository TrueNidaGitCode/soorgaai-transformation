/**
 * One contact address, and none of it on a domain that no longer takes mail.
 *
 * ── Why this is a test and not a search-and-replace ────────────────────────
 *
 * The company was renamed and the footers were updated. Three addresses were
 * missed, because each had a different local part and nobody greps for what
 * they do not know is there: the Enterprise plan's "Email Us" button went to
 * contact@, the assessment's consultation booking went to advisory@, and the
 * contact FORM — the one a customer fills in believing somebody receives it —
 * was delivered to a founder's personal address on the old domain.
 *
 * All three bounce or vanish silently. A dead contact link is the one bug a
 * customer never reports, because from their side it looks like being
 * ignored.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname, relative } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTACT = 'hello@svargai.com';

/** Every page and script that ships, excluding the tests themselves. */
function shipped(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) shipped(full, out);
    else if (/\.(html|js)$/.test(name)) out.push(full);
  }
  return out;
}

const FILES = shipped().map((f) => [relative(ROOT, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')]);

describe('nothing points at a domain that stopped taking mail', () => {
  it('has files to check', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  for (const dead of ['soorgaai.com', 'soorga.com']) {
    it(`sends no mail to ${dead}`, () => {
      /*
       * Comments may still mention the old domain — one names a real account
       * that sat in the funnel, and that is history worth keeping. Only
       * addresses somebody can click are checked.
       */
      const offenders = FILES
        .filter(([, src]) => new RegExp(`mailto:[^"'\\s]*@${dead.replace('.', '\\.')}`).test(src))
        .map(([name]) => name);
      expect(offenders).toEqual([]);
    });
  }
});

describe('the contact address is one address', () => {
  it('is what every Contact link uses', () => {
    const links = FILES.flatMap(([name, src]) =>
      [...src.matchAll(/mailto:([^"'?\s]+)/g)].map((m) => [name, m[1]]));
    expect(links.length).toBeGreaterThan(5);

    for (const [name, address] of links) {
      // The privacy policy names a data-protection contact by person, which
      // is a deliberate choice and a different question from this one.
      if (name.startsWith('privacy/')) continue;
      // The sales tool composes mail TO a prospect. Outreach is the other
      // direction and has no business being the company's own address.
      if (address.includes('${')) continue;
      expect(address, `${name} links to ${address}`).toBe(CONTACT);
    }
  });

  it('is where the contact form is delivered', () => {
    /*
     * The half nobody sees. A form that posts successfully and mails a dead
     * address looks, from both sides, exactly like a form that worked.
     */
    const mail = readFileSync(join(ROOT, '../backend/trunida-backend/services/mailService.js'), 'utf8');
    expect(mail).toContain(`const CONTACT_FORM_RECIPIENT = '${CONTACT}';`);
  });
});
