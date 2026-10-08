/**
 * The home page sections below the hero make claims a buyer will repeat to
 * their own security reviewer or board. Each rule here exists because the
 * wrong word is easy to write and expensive to have said.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, '..', p), 'utf8');

const html = read('index.html');
const js = read('homeSections.js');
const between = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const security = between('id="security"', 'lh-partners-wrap');
const partners = between('lh-partners-wrap', '</main>');
const body = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));

describe('security cards say only what is true', () => {
  it('never claims certification', () => {
    /*
     * ISO 27001 certifies an organisation's management system, awarded by an
     * auditor. An application cannot be certified; it can produce evidence
     * for named controls. A customer repeating "ISO certified" to their own
     * auditor is the one exposed.
     */
    expect(security.toLowerCase()).not.toMatch(/certified|certification|compliant/);
    expect(security).toMatch(/evidence for named ISO 27001 controls/);
  });

  it('says only your team signs in, not that no one else can access it', () => {
    // Svarg operates the hosting; the honest promise is about sign-in.
    expect(body.toLowerCase()).not.toContain('accessible only to you');
    expect(body).toContain('only your team signs in');
  });

  it('promises its own database, not its own server', () => {
    // Tenants share one database cluster; each has its own database on it.
    expect(security).toContain('its own database');
    expect(security.toLowerCase()).not.toMatch(/own server|dedicated server|own cluster/);
  });
});

describe('partners are described as what they are', () => {
  it('does not claim endorsement by or reliance on NVIDIA', () => {
    expect(partners.toLowerCase()).not.toMatch(/endorse|powered by nvidia|nvidia gpus|partnered with nvidia/);
    expect(partners).toContain('member of the NVIDIA Inception program');
  });

  it('says agents can run on Sarvam, because it is opt-in', () => {
    // sarvam is an opt-in provider in services/llmService.js, not the default.
    expect(partners).toContain('can run on Sarvam');
    expect(partners).not.toMatch(/run on Sarvam’s models by default|runs on Sarvam/);
  });
});

describe('NVIDIA Inception is named as NVIDIA asks', () => {
  /*
   * From NVIDIA's member guidelines (2026-10-08): never abbreviate, reorder or
   * misspell the name; NVIDIA in capitals, the program name never in all caps;
   * capital P in a title, lowercase p in a sentence.
   */
  const page = read('index.html');
  it('uses only allowed forms', () => {
    expect(page).not.toMatch(/Nvidia|NV Inception|Inception Program by|INCEPTION/);
    expect(page).not.toMatch(/(?<!NVIDIA )Inception Program/);
    // NVIDIA's own badge, named for anyone who cannot see it.
    expect(partners).toContain('src="assets/Inception%20Badges/for-screen/nvidia-inception-program-badge-rgb-for-screen.svg" alt="NVIDIA Inception Program"');
    expect(partners).toContain('member of the NVIDIA Inception program.');
  });
});

describe('the page stays horizontal and retention-only', () => {
  it('uses no clinic words', () => {
    // Svarg is for every industry; the clinic work is one customer, not the pitch.
    const text = (body + js).toLowerCase();
    for (const w of ['no-show', 'no show', 'patient', 'clinic', 'treatment']) expect(text).not.toContain(w);
  });

  it('uses no growth words', () => {
    // Since 2026-10-07 the site pitches retention only.
    const text = (body + js).toLowerCase();
    for (const w of ['upsell', 'upgrade', 'cross-sell', 'expansion revenue']) expect(text).not.toContain(w);
  });

  it('calls them AI agents on the page, not watchers', () => {
    // "Watcher" is the code's word; the reader's word is "agent".
    expect(body.toLowerCase()).not.toContain('watcher');
    expect(js).not.toMatch(/ruleTitle: '[^']*Watcher/);
  });
});

describe('every agent shown is one the product runs', () => {
  const catalogue = readFileSync(path.join(here, '..', '..', 'backend', 'trunida-backend', 'eame-template', 'services', 'agentCatalogue.js'), 'utf8');

  it('names only agents in the catalogue', () => {
    const names = [...js.matchAll(/name: '([^']+)', icon:/g)].map((m) => m[1])
      .concat([...js.matchAll(/\{ name: '([^']+)', text:/g)].map((m) => m[1]));
    expect(names.length).toBeGreaterThan(5);
    for (const n of new Set(names)) expect(catalogue).toContain(`name: '${n}'`);
  });

  it('keeps Renewal Due to the 14 days the agent actually uses', () => {
    expect(catalogue).toMatch(/renewal-due[\s\S]{0,200}next 14 days/);
    expect(js).toContain('in the next 14 days');
  });
});
