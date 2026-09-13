/**
 * The application is named in one or two words, never with its use case
 * sentence, and a sentence is never accepted as a name.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/llmService.js', () => ({ generate: vi.fn() }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: { updateOne: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/UserProfile.js', () => ({ default: { findOne: () => ({ select: () => ({ lean: async () => ({ orgName: 'Chennai Cricket Academy' }) }) }) } }));

const { generate } = await import('../services/llmService.js');
const { isGoodName, fallbackName, ensureAppName } = await import('../services/appNameService.js');

describe('isGoodName', () => {
  it('takes one to three plain words and refuses a sentence', () => {
    expect(isGoodName('Defect Lens')).toBe(true);
    expect(isGoodName('PitchPulse')).toBe(true);
    expect(isGoodName('Start with finding past faults like this one')).toBe(false);
    expect(isGoodName('Nets: the app')).toBe(false);
  });
});

describe('fallbackName', () => {
  it('takes two meaningful words, or the company', () => {
    expect(fallbackName({ useCaseName: 'Predictive Classification for Student Attrition' })).toBe('Predictive Classification');
    expect(fallbackName({ companyName: 'Chennai Cricket Academy' })).toBe('Chennai Assistant');
    expect(fallbackName({ objective: 'We are running a cricket academy where there are 30 coaches' })).toBe('Cricket Academy');
  });
});

describe('ensureAppName', () => {
  it('keeps a short name the customer gave and never asks the model', async () => {
    const bp = { _id: 'x', appName: 'Nets Radar', businessObjective: 'anything' };
    expect(await ensureAppName(bp)).toBe('Nets Radar');
    expect(generate).not.toHaveBeenCalled();
  });

  it('replaces a sentence with what the model suggests, and writes it', async () => {
    generate.mockResolvedValueOnce({ text: 'Attendance Radar\n' });
    const bp = { _id: 'x', userId: 'u', appName: 'Start with finding past faults like this one', businessObjective: 'We run a cricket academy', domains: [] };
    expect(await ensureAppName(bp)).toBe('Attendance Radar');
    expect(bp.appName).toBe('Attendance Radar');
    expect(generate.mock.calls[0][0].userMessage).toMatch(/Chennai Cricket Academy/);
  });

  it('falls back when the model gives a sentence or nothing', async () => {
    generate.mockResolvedValueOnce({ text: 'I would call this the Academy Attendance and Fees Assistant for coaches' });
    const bp = { _id: 'x', userId: 'u', appName: '', businessObjective: 'We run a cricket academy with 30 coaches', domains: [] };
    expect(await ensureAppName(bp)).toBe('Chennai Assistant');
  });
});
