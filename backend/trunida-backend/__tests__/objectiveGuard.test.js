/**
 * Every door into generation, not just the one we remembered.
 *
 * The guard was built in August after "what can you do?" bought four complete
 * blueprint runs. It was wired into startTransformationGeneration and nowhere
 * else — and there are three doors. Through the other two, in six weeks:
 *
 *   "surprise me"   51 model calls, ₹26.80 — the full chain, application built
 *   "Porn videos"   55 model calls, ₹15.50 — a complete strategy document
 *   "hi"             4 model calls, ₹0.90
 *
 * Both accounts used throwaway email domains and never came back. A guard on
 * one door is not a guard, which is what these tests are really about.
 */

import { vi, describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const generate = vi.fn();
vi.mock('../services/llmService.js', () => ({ generate: (...a) => generate(...a) }));

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const guard = () => import('../services/objectiveGuardService.js');

/** The classifier says yes, so anything refused below was refused for free. */
const allows = () => generate.mockResolvedValue({ text: '{"isBusinessObjective": true, "reason": "ok"}' });

describe('what actually got through', () => {
  it('refuses every objective that reached production', async () => {
    allows();
    const { checkObjective } = await guard();
    for (const junk of ['hi', 'surprise me', 'Porn videos', 'what can you do?', 'test']) {
      const v = await checkObjective(junk);
      expect(v.ok, `"${junk}" was let through`).toBe(false);
      expect(v.suggestion).toBeTruthy();
    }
  });

  it('refuses them without spending anything', async () => {
    allows();
    generate.mockClear();
    const { checkObjective } = await guard();
    for (const junk of ['hi', 'surprise me', 'Porn videos']) await checkObjective(junk);
    // The whole point of the cheap pass: obvious junk never reaches a model.
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('work this platform will not do', () => {
  it('refuses it written as a proper business, not only as two words', async () => {
    /*
     * "Porn videos" was caught by the 25-character minimum — by luck. The same
     * request as a paragraph describes a real process with real problems, and
     * the classifier would have said yes.
     */
    allows();
    const { checkObjective } = await guard();
    const v = await checkObjective(
      'We run an escort agency in Bangalore and want to automate client bookings, '
      + 'payments and follow-up messages across our two locations.');
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/not something Svarg will build/i);
  });

  it('stays narrow — ordinary businesses are still customers', async () => {
    allows();
    const { checkObjective } = await guard();
    for (const fine of [
      'We run a bar in Indiranagar and want to predict which nights need more staff on shift.',
      'Our betting shop wants to spot problem gamblers earlier and intervene responsibly.',
      'We supply components to defence contractors and want to track certification expiry.',
    ]) {
      expect((await checkObjective(fine)).ok, fine).toBe(true);
    }
  });
});

describe('real customers still get through', () => {
  it('allows the way people actually write', async () => {
    allows();
    const { checkObjective } = await guard();
    for (const real of [
      'We run a cricket academy with 30 coaches. Attendance comes in over WhatsApp and we copy it into a spreadsheet.',
      'we are a small gym, members keep leaving and we find out too late',
      'Reduce the time our support team spends on password resets',
    ]) {
      expect((await checkObjective(real)).ok, real).toBe(true);
    }
  });

  it('lets an objective through when the check itself cannot run', async () => {
    // Refusing a real customer costs more than one unnecessary blueprint.
    generate.mockRejectedValue(new Error('every provider is down'));
    const { checkObjective } = await guard();
    const v = await checkObjective('We are a logistics company with a dispatch problem we cannot describe briefly.');
    expect(v.ok).toBe(true);
  });
});

describe('all three doors are guarded', () => {
  const canvas = read('../controllers/strategyCanvasController.js');
  const guest = read('../controllers/guestController.js');

  it('the signed-in blueprint generator asks', () => {
    const fn = canvas.slice(canvas.indexOf('export async function startBlueprintGeneration'));
    const body = fn.slice(0, fn.indexOf('export async function', 10));
    expect(body).toContain('await checkObjective(');
  });

  it('the transformation generator still asks', () => {
    const fn = canvas.slice(canvas.indexOf('export async function startTransformationGeneration'));
    const body = fn.slice(0, 2500);
    expect(body).toContain('await checkObjective(');
  });

  it('the guest preview asks — it was the only door with nothing on it', () => {
    expect(guest).toContain("from '../services/objectiveGuardService.js'");
    expect(guest).toContain('await checkObjective(');
  });

  it('checks before the work starts, not after', () => {
    const fn = canvas.slice(canvas.indexOf('export async function startBlueprintGeneration'));
    const gate = fn.indexOf('await checkObjective(');
    const create = fn.indexOf('CompanyBlueprint.create');
    expect(gate).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(create);
  });

  it('spends the guest rate limit only on objectives worth generating', () => {
    const limit = guest.indexOf('isRateLimited');
    const gate = guest.indexOf('await checkObjective(');
    expect(gate).toBeGreaterThan(limit);
  });
});
