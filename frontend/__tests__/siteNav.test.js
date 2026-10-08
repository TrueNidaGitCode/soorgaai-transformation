/**
 * The marketing site sells one product, customer retention (since
 * 2026-10-07). The five product pages were merged into How it works and the
 * industry page into Business types; old links redirect rather than break.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, '..', p), 'utf8');
const PAGES = ['index.html', 'company/about.html', 'company/contact-us.html', 'pricing/pricing.html', 'how-it-works/index.html', 'business-types/index.html'];

describe('the nav offers one solution and five business types', () => {
  for (const f of PAGES) {
    it(`${f} links no retired page`, () => {
      const h = read(f);
      expect(h).not.toMatch(/href="\/products\//);
      expect(h).not.toMatch(/href="\/industry\//);
      expect(h).toContain('Customer Retention');
      for (const id of ['recurring', 'education', 'subscription', 'high-value', 'hospitality']) {
        expect(h).toContain(`/business-types/#${id}`);
      }
    });
  }

  it('every business type the nav points at exists', () => {
    const bt = read('business-types/index.html');
    for (const id of ['recurring', 'education', 'subscription', 'high-value', 'hospitality']) expect(bt).toContain(`id="${id}"`);
  });
});

describe('retired pages redirect instead of breaking', () => {
  const vercel = JSON.parse(readFileSync(path.join(here, '..', '..', 'vercel.json'), 'utf8'));
  const to = (src) => vercel.redirects?.find((r) => r.source === src)?.destination;

  it('sends each product page to its section of How it works', () => {
    const hiw = read('how-it-works/index.html');
    for (const p of ['cob', 'aria', 'arth', 'eame', 'yusu']) {
      expect(to(`/products/${p}.html`)).toBe(`/how-it-works/#${p}`);
      expect(hiw).toContain(`id="${p}"`);
    }
  });

  it('sends the industry page to Business types', () => {
    expect(to('/industry/automotive.html')).toBe('/business-types/');
  });
});

describe('the public pages keep internal research internal', () => {
  it('shows no interview counts or untested labels', () => {
    const bt = read('business-types/index.html').toLowerCase();
    expect(bt).not.toMatch(/interviewed|untested|hypothesis/);
  });

  it('describes Aria and Arth as the app does', () => {
    // Since 2026-09-11 Aria chooses and runs the model and Arth connects data.
    const hiw = read('how-it-works/index.html');
    const aria = hiw.slice(hiw.indexOf('id="aria"'), hiw.indexOf('id="arth"'));
    const arth = hiw.slice(hiw.indexOf('id="arth"'), hiw.indexOf('id="eame"'));
    expect(aria).toMatch(/model/i);
    expect(arth).toMatch(/data/i);
    expect(aria).toContain('>Run<');
    expect(arth).toContain('>Connect<');
  });

  it('makes no claim of redaction the app does not yet do', () => {
    const hiw = read('how-it-works/index.html').toLowerCase();
    expect(hiw).not.toMatch(/redact|de-identif|synthetic data/);
  });
});
