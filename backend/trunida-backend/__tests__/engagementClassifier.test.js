/**
 * Undecided is a correct answer. A guess is not.
 *
 * This decides what KIND of AI work a blueprint is before any of it is
 * generated, and that choice points the whole run at a set of systems: their
 * codebase, or the tools their staff use. Getting it wrong does not produce a
 * slightly worse blueprint; it produces one aimed at the wrong place entirely.
 *
 * So the posture is deliberately conservative — a null category means every
 * caller falls back to what it did before this service existed. These tests are
 * mostly about the null: that a model saying something outside the vocabulary,
 * returning prose, timing out, or answering with nonsense all land on
 * undecided rather than on a value that will be stored and quietly fail to
 * match anything downstream.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const generate = vi.fn();
vi.mock('../services/llmService.js', () => ({ generate }));

const S = '../services/engagementClassifierService.js';
let svc;

beforeEach(async () => {
  vi.resetModules();
  generate.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  svc = await import(S);
});

const says = (obj) => generate.mockResolvedValue({
  text: typeof obj === 'string' ? obj : JSON.stringify(obj),
});

const UNDECIDED = { category: null, subArea: null, maturity: 'unknown', confidence: 0 };

// ── The two answers it can give ──────────────────────────────────────────────

describe('what it classifies', () => {
  it('reads AI inside the product the company sells', async () => {
    says({ category: 'product-ai', subArea: null, maturity: 'startup', confidence: 0.9, reason: 'Ships in their app.' });
    const e = await svc.resolveEngagement('Add coaching suggestions to our app', 'We sell academy software.');
    expect(e).toMatchObject({ category: 'product-ai', subArea: null, maturity: 'startup', confidence: 0.9 });
  });

  it('reads automation of the company\'s own internal work, and names the area', async () => {
    says({ category: 'workflow-automation', subArea: 'test', maturity: 'enterprise', confidence: 0.8, reason: 'Their QA team.' });
    const e = await svc.resolveEngagement('Cut regression effort', 'We build cars.');
    expect(e).toMatchObject({ category: 'workflow-automation', subArea: 'test', maturity: 'enterprise' });
  });

  it('drops a sub-area on product work, where it means nothing', async () => {
    says({ category: 'product-ai', subArea: 'code', maturity: 'startup', confidence: 0.7, reason: '' });
    expect((await svc.resolveEngagement('x', 'y')).subArea).toBeNull();
  });
});

// ── The vocabulary is not the model's to extend ──────────────────────────────

describe('values outside the vocabulary', () => {
  it('treats an invented category as undecided', async () => {
    // Stored, it would match nothing downstream — which reads to a customer as
    // "the feature does not work" rather than "the model said something odd".
    says({ category: 'data-platform', subArea: null, maturity: 'startup', confidence: 0.95, reason: 'Sure about it.' });
    expect(await svc.resolveEngagement('x', 'y')).toMatchObject(UNDECIDED);
  });

  it('keeps the model\'s reason when it declines to classify, because it is the useful part', async () => {
    says({ category: null, subArea: null, maturity: 'unknown', confidence: 0, reason: 'Cannot tell whose staff this is.' });
    const e = await svc.resolveEngagement('Reduce admin time', '');
    expect(e.category).toBeNull();
    expect(e.reason).toBe('Cannot tell whose staff this is.');
  });

  it('drops an invented sub-area but keeps the category it belongs to', async () => {
    says({ category: 'workflow-automation', subArea: 'procurement', maturity: 'startup', confidence: 0.6, reason: '' });
    const e = await svc.resolveEngagement('x', 'y');
    expect(e.category).toBe('workflow-automation');
    expect(e.subArea).toBeNull();
  });

  it('falls back to unknown maturity rather than inventing one', async () => {
    says({ category: 'product-ai', subArea: null, maturity: 'scale-up', confidence: 0.6, reason: '' });
    expect((await svc.resolveEngagement('x', 'y')).maturity).toBe('unknown');
  });

  it('pulls confidence back inside 0 and 1', async () => {
    for (const [given, expected] of [[5, 1], [-2, 0], ['not a number', 0], [null, 0]]) {
      says({ category: 'product-ai', subArea: null, maturity: 'startup', confidence: given, reason: '' });
      expect((await svc.resolveEngagement('x', 'y')).confidence, String(given)).toBe(expected);
    }
  });

  it('caps a reason that runs long', async () => {
    says({ category: 'product-ai', subArea: null, maturity: 'startup', confidence: 0.5, reason: 'z'.repeat(900) });
    expect((await svc.resolveEngagement('x', 'y')).reason).toHaveLength(300);
  });
});

// ── When the model does not cooperate ────────────────────────────────────────

describe('a classifier that fails', () => {
  it('is undecided when the answer is prose with no JSON in it', async () => {
    says('I think this is probably product AI, but it depends on a few things.');
    expect(await svc.resolveEngagement('x', 'y')).toMatchObject(UNDECIDED);
  });

  it('is undecided when the JSON is malformed', async () => {
    says('{"category": "product-ai", "confidence":}');
    expect(await svc.resolveEngagement('x', 'y')).toMatchObject(UNDECIDED);
  });

  it('is undecided when the provider throws, rather than taking the run down', async () => {
    // Every caller handles a null category by behaving as it did before this
    // service existed, so an outage here degrades the product, not breaks it.
    generate.mockRejectedValue(new Error('all providers failed'));
    expect(await svc.resolveEngagement('x', 'y')).toMatchObject(UNDECIDED);
  });

  it('finds the JSON when the model wraps it in chatter', async () => {
    says('Sure!\n{"category":"product-ai","subArea":null,"maturity":"startup","confidence":0.8,"reason":"ok"}\nHope that helps.');
    expect((await svc.resolveEngagement('x', 'y')).category).toBe('product-ai');
  });

  it('spends nothing on an empty objective', async () => {
    for (const objective of ['', '   ', null, undefined]) {
      const e = await svc.resolveEngagement(objective, 'context');
      expect(e).toMatchObject(UNDECIDED);
      expect(e.reason).toMatch(/No objective/);
    }
    expect(generate).not.toHaveBeenCalled();
  });
});

// ── The trap this service exists for ─────────────────────────────────────────

describe('whose workflow it is', () => {
  it('says out loud that there is no company context, rather than leaving it out', async () => {
    /*
     * The misclassification this service exists to avoid. An academy-software
     * company describing studio owners losing hours to attendance and fees
     * reads as workflow automation — hours spent, manual admin — and is not:
     * those people are its customers, so the answer is a feature in its
     * product. Without context the model reads the objective as if it were
     * about the company's own staff. Saying "none available" is what makes
     * null a reachable answer instead of a confident wrong one.
     */
    says({ category: null, subArea: null, maturity: 'unknown', confidence: 0, reason: '' });
    await svc.resolveEngagement('Studio owners spend hours on attendance and fees', '');
    const sentWithout = generate.mock.calls[0][0].userMessage;
    expect(sentWithout).toMatch(/none available/i);
    expect(sentWithout).toMatch(/you do not know what this company sells/i);
  });

  it('passes the company context through when there is one', async () => {
    says({ category: 'product-ai', subArea: null, maturity: 'startup', confidence: 0.9, reason: '' });
    await svc.resolveEngagement('Studio owners spend hours on attendance', 'We sell software to dance studios.');
    const msg = generate.mock.calls[0][0].userMessage;
    expect(msg).toContain('We sell software to dance studios.');
    expect(msg).toContain('who it sells to');
  });

  it('trims a very long context rather than sending the whole thing', async () => {
    says({ category: null, subArea: null, maturity: 'unknown', confidence: 0, reason: '' });
    await svc.resolveEngagement('x', 'c'.repeat(9000));
    expect(generate.mock.calls[0][0].userMessage.length).toBeLessThan(5000);
  });

  it('teaches the trap in the prompt, with the example that caused it', async () => {
    says({ category: null, subArea: null, maturity: 'unknown', confidence: 0, reason: '' });
    await svc.resolveEngagement('x', 'y');
    const system = generate.mock.calls[0][0].systemPrompt;
    expect(system).toMatch(/whose workflow/i);
    expect(system).toMatch(/academy-management software/i);
    expect(system).toMatch(/null is a\s+correct and expected answer/i);
  });

  it('keeps the call small — this runs before every generation', async () => {
    says({ category: null, subArea: null, maturity: 'unknown', confidence: 0, reason: '' });
    await svc.resolveEngagement('x', 'y');
    expect(generate.mock.calls[0][0].maxTokens).toBeLessThanOrEqual(250);
    expect(generate.mock.calls[0][0].label).toBe('engagement-classification');
  });
});
