/**
 * The application carries the organisation's name. Only when none is on
 * record does the model name it, in one or two words, never with the use
 * case sentence; a name the customer typed is always theirs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({ org: 'Chennai Cricket Academy', update: vi.fn().mockResolvedValue({}) }));
vi.mock('../services/llmService.js', () => ({ generate: vi.fn() }));
vi.mock('../models/TransformationBlueprint.js', () => ({ default: { updateOne: M.update } }));
vi.mock('../models/UserProfile.js', () => ({ default: { findOne: () => ({ select: () => ({ lean: async () => ({ orgName: M.org }) }) }) } }));

const { generate } = await import('../services/llmService.js');
const { isGoodName, fallbackName, ensureAppName } = await import('../services/appNameService.js');

beforeEach(() => { vi.clearAllMocks(); M.org = 'Chennai Cricket Academy'; });

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
  it('names the application after the organisation, and never asks the model when one is on record', async () => {
    const bp = { _id: 'x', userId: 'u', appName: '', businessObjective: 'We run a cricket academy', domains: [] };
    expect(await ensureAppName(bp)).toBe('Chennai Cricket Academy');
    expect(bp.appNameSource).toBe('organisation');
    expect(M.update.mock.calls[0][1].$set).toEqual({ appName: 'Chennai Cricket Academy', appNameSource: 'organisation' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('replaces a name the model chose earlier once the organisation is known', async () => {
    const bp = { _id: 'x', companyName: 'Six Cricket', appName: 'Net Roll', appNameSource: 'model' };
    expect(await ensureAppName(bp)).toBe('Six Cricket');
  });

  it('keeps a name the customer typed, whatever the organisation is called', async () => {
    const bp = { _id: 'x', companyName: 'Six Cricket', appName: 'Nets Radar', appNameSource: 'customer' };
    expect(await ensureAppName(bp)).toBe('Nets Radar');
    expect(M.update).not.toHaveBeenCalled();
  });

  it('asks the model only when no organisation is on record, and falls back when it gives a sentence', async () => {
    M.org = '';
    generate.mockResolvedValueOnce({ text: 'Attendance Radar\n' });
    const bp = { _id: 'x', userId: 'u', appName: 'Start with finding past faults like this one', businessObjective: 'We run a cricket academy with 30 coaches', domains: [] };
    expect(await ensureAppName(bp)).toBe('Attendance Radar');
    expect(bp.appNameSource).toBe('model');

    generate.mockResolvedValueOnce({ text: 'I would call this the Academy Attendance and Fees Assistant for coaches' });
    const bp2 = { _id: 'y', userId: 'u', appName: '', businessObjective: 'We run a cricket academy with 30 coaches', domains: [] };
    expect(await ensureAppName(bp2)).toBe('Cricket Academy');
    expect(bp2.appNameSource).toBe('fallback');
  });
});
