/**
 * Unit Tests — advisorController.js
 *
 * Strategy:
 *  - advisorService mocked to isolate controller validation and error handling.
 *  - makeReqRes() from workspace-helpers provides Express stubs.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeReqRes } from './__fixtures__/workspace-helpers.js';

// ── Hoisted mock references ───────────────────────────────────────────────────

const { mockAskAdvisor } = vi.hoisted(() => ({ mockAskAdvisor: vi.fn() }));

vi.mock('../services/advisorService.js', () => ({ askAdvisor: mockAskAdvisor }));

import { ask } from '../controllers/advisorController.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUB_BLUEPRINT = {
  capabilityName: 'AI Initiative Leadership',
  industry:       'Automotive',
  sections:       [{ title: 'Vision', definition: 'Vision text.' }],
};

const STUB_RESULT = {
  response: {
    executivePerspective: 'AI is key.',
    industryContext:      'Automotive context.',
    recommendations:      ['Start small'],
    potentialRisks:       ['Talent gap'],
    suggestedNextStep:    'Run a pilot.',
  },
  capabilityName: 'AI Initiative Leadership',
  industry:       'Automotive',
  inputTokens:    400,
  outputTokens:   180,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAskAdvisor.mockResolvedValue(STUB_RESULT);
});

// ── ask() ─────────────────────────────────────────────────────────────────────

describe('ask()', () => {
  it('returns 200 with the advisor result on success', async () => {
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'How do we focus on SDV?',
    });
    await ask(req, res);
    expect(res.json).toHaveBeenCalledWith(STUB_RESULT);
  });

  it('calls askAdvisor with trimmed question, capabilityId, and blueprint', async () => {
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     '  How do we focus on SDV?  ',
    });
    await ask(req, res);
    expect(mockAskAdvisor).toHaveBeenCalledWith({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'How do we focus on SDV?',
    });
  });

  it('returns 400 when question is missing', async () => {
    const { req, res } = makeReqRes({ capabilityId: 'ai-initiative-leadership' });
    await ask(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when question is an empty string', async () => {
    const { req, res } = makeReqRes({ capabilityId: 'ai-initiative-leadership', question: '   ' });
    await ask(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when capabilityId is missing', async () => {
    const { req, res } = makeReqRes({ question: 'How do we scale AI?' });
    await ask(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 503 when the service throws an API key error', async () => {
    mockAskAdvisor.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY is not configured.'));
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    await ask(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 503 error body containing "not available"', async () => {
    mockAskAdvisor.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY is not configured.'));
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    await ask(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.error).toContain('not available');
  });

  it('returns 500 for unexpected service errors', async () => {
    mockAskAdvisor.mockRejectedValueOnce(new Error('Unexpected parse failure'));
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    await ask(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('passes an empty object as blueprint when blueprint is omitted', async () => {
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      question:     'How do we scale AI?',
    });
    await ask(req, res);
    expect(mockAskAdvisor).toHaveBeenCalledWith(
      expect.objectContaining({ blueprint: {} }),
    );
  });
});
