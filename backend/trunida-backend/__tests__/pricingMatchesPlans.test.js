/**
 * The pricing page and the gate must say the same thing.
 *
 * They drifted once already: the page promised Pro three live deployments
 * while entitlements enforced one. A page that promises what the product
 * refuses is the worst kind of bug, because the customer only finds it after
 * paying — so the two are pinned together here.
 *
 * What is pinned has moved with the pricing. The page now sells coverage:
 * how much of a business is watched, how many places its records come from,
 * how often it is checked, and how many people can read it. Those are the
 * four numbers a customer chooses on, so those are the four pinned.
 *
 * Deliberately absent: any count of watchers. Inside purchased coverage they
 * are unlimited, so there is no number on the page to agree with.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PLANS } from '../services/entitlements.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, '../../../frontend/pricing/pricing.html');

describe('the pricing page states the limits the gate enforces', () => {
  const html = fs.readFileSync(PAGE, 'utf8');
  /** The feature list of one tier, so a number is read against its own card. */
  const card = (plan) => {
    const start = html.indexOf(`aria-label="${plan} plan features"`);
    expect(start, `no ${plan} card`).toBeGreaterThan(-1);
    return html.slice(start, html.indexOf('</ul>', start));
  };

  it('states the business areas each tier covers, and agrees with the gate', () => {
    // The primary lever, and the only reason the page gives to upgrade.
    expect(card('Hobby')).toMatch(new RegExp(`<b>${PLANS.hobby.businessCategories} of 5</b> business areas`));
    expect(card('Pro')).toMatch(new RegExp(`<b>${PLANS.pro.businessCategories} of 5</b> business areas`));
    // null is unlimited, which the page says as "All 5" rather than a number.
    expect(PLANS.ultra.businessCategories).toBeNull();
    expect(card('Ultra')).toMatch(/<b>All 5<\/b> business areas/);
    expect(PLANS.enterprise.businessCategories).toBeNull();
    expect(card('Enterprise')).toMatch(/<b>Custom<\/b> business areas/);
  });

  it('states the connected data sources, and agrees with the gate', () => {
    expect(card('Hobby')).toContain(`${PLANS.hobby.dataConnections} connected data sources`);
    expect(card('Pro')).toContain(`${PLANS.pro.dataConnections} connected data sources`);
    expect(card('Ultra')).toContain(`${PLANS.ultra.dataConnections} connected data sources`);
  });

  it('states how often it checks, and agrees with the gate', () => {
    const said = { daily: 'Checked every day', hourly: 'Checked every hour' };
    expect(card('Hobby')).toContain(said[PLANS.hobby.monitoringFrequency]);
    expect(card('Pro')).toContain(said[PLANS.pro.monitoringFrequency]);
    expect(card('Ultra')).toContain(said[PLANS.ultra.monitoringFrequency]);
  });

  it('states how many people, and agrees with the gate', () => {
    expect(card('Hobby')).toContain(`${PLANS.hobby.seats} person`);
    expect(card('Pro')).toContain(`${PLANS.pro.seats} people`);
    expect(card('Ultra')).toContain(`${PLANS.ultra.seats} people`);
  });

  it('promises no number of watchers, on any tier', () => {
    /*
     * The promise the whole model rests on. A page that put a watcher count
     * on a plan would be selling the thing the product needs customers never
     * to ration — and the Agent Map would become a picture of what they could
     * afford rather than of what is being watched.
     */
    for (const plan of ['Hobby', 'Pro', 'Ultra', 'Enterprise']) {
      expect(card(plan), plan).not.toMatch(/\d+\s+(watchers?|agents?)\b/i);
    }
    expect(card('Hobby')).toMatch(/Unlimited watchers/i);
  });

  it('still sells each tier on something the one below does not have', () => {
    // If these stopped being true a tier would have nothing left to sell.
    expect(PLANS.pro.businessCategories).toBeGreaterThan(PLANS.hobby.businessCategories);
    expect(PLANS.pro.dataConnections).toBeGreaterThan(PLANS.hobby.dataConnections);
    expect(PLANS.ultra.businessCategories).toBeNull();                       // all of them
    expect(PLANS.ultra.dataConnections).toBeGreaterThan(PLANS.pro.dataConnections);
    expect(PLANS.ultra.monitoringFrequency).toBe('hourly');
    expect(PLANS.pro.monitoringFrequency).toBe('daily');
  });

  it('counts the customer’s own areas in the application, not a fixed five', () => {
    /*
     * The pricing page says "of 5" because five is what most industries name
     * and a public page cannot know which industry a reader is in. The
     * application must not repeat that guess: Automotive names six, and a
     * screen telling that customer they cover "2 of 5" would be wrong on its
     * face. In-app the total comes from their own table.
     */
    const ui = fs.readFileSync(path.resolve(HERE, '../eame-template/frontend/agents.js'), 'utf8');
    expect(ui).toContain("'Watching ' + cov.covered + ' of ' + cov.of + ' business areas'");
    const cov = fs.readFileSync(path.resolve(HERE, '../eame-template/services/coverage.js'), 'utf8');
    expect(cov).toContain('of: cats.length');
  });
});
