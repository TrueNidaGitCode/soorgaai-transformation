/**
 * What "a lost customer" means, proposed per business at delivery
 * (services/churnDefinitionService.js) and carried in data/agents.json.
 */
import { describe, it, expect } from 'vitest';
import { churnDefinitionFor } from '../services/churnDefinitionService.js';
import { watcherPlanFile } from '../services/watcherPlanService.js';

const bp = (businessObjective, extra = {}) => ({ businessObjective, ...extra });

describe('the churn definition Cob proposes', () => {
  it('reads the kind of business, in the same order as the sales funnel', () => {
    expect(churnDefinitionFor(bp('We run a wellness clinic with physiotherapy packages')).businessType).toBe('recurring');
    // Dental is the occasional high-ticket visit, so it wins over "clinic".
    expect(churnDefinitionFor(bp('A dental clinic chain in Bengaluru')).businessType).toBe('high-value');
    expect(churnDefinitionFor(bp('A cricket academy with 30 coaches')).businessType).toBe('education');
    expect(churnDefinitionFor(bp('D2C pet food subscription')).businessType).toBe('subscription');
    expect(churnDefinitionFor(bp('A boutique resort and members club')).businessType).toBe('hospitality');
  });

  it('never counts a cancelled appointment as a lost customer at a clinic', () => {
    const d = churnDefinitionFor(bp('Wellness centre with sessions'));
    expect(d.inactiveDays).toBe(60);
    expect(d.statusWords).not.toContain('cancelled');
    expect(d.statusWords).toContain('not renewed');
  });

  it('falls back to a general definition rather than none', () => {
    const d = churnDefinitionFor(bp('Something nobody can classify'));
    expect(d.businessType).toBe('general');
    expect(d.gapMultiple).toBe(3);
  });

  it('travels to the application in data/agents.json', () => {
    const plan = JSON.parse(watcherPlanFile(bp('A cricket academy')).content);
    expect(plan.churn).toMatchObject({ businessType: 'education', inactiveDays: 45 });
  });
});
