/**
 * The pricing page and the gate must say the same thing.
 *
 * They drifted: the page promised Pro three live deployments while
 * entitlements enforced three, and the platform could keep one. A page that
 * promises what the product refuses is the worst kind of bug, because the
 * customer only finds it after paying — so the two are pinned together here.
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

  it('names live deployments once per tier, in tier order', () => {
    const stated = [...html.matchAll(/>(\d+) live deployments?</g)].map(m => Number(m[1]));
    // Hobby, Pro, Ultra — Enterprise sells a private deployment instead.
    expect(stated).toEqual([PLANS.hobby.launches, PLANS.pro.launches, PLANS.ultra.launches]);
  });

  it('agrees with the gate about Pro keeping one application running', () => {
    expect(PLANS.pro.launches).toBe(1);
    expect(html).toMatch(/Pro plan features[\s\S]{0,600}>1 live deployment</);
  });

  it('still sells Pro on something Hobby does not have', () => {
    // Pro no longer wins on live deployments, so if these ever stopped being
    // true the tier would have nothing left to sell.
    expect(PLANS.pro.newBlueprintsPerMonth).toBeNull();          // unlimited
    expect(PLANS.pro.applications).toBeNull();                   // unlimited
    expect(PLANS.pro.deploymentCostUsd).toBeGreaterThan(PLANS.hobby.deploymentCostUsd);
  });
});
