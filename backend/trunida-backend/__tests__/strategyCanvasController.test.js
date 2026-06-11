/**
 * Unit Tests — strategyCanvasController.js
 *
 * Strategy:
 *  - UserProfile model mocked to control industry detection.
 *  - strategyCanvasService mocked to isolate controller logic.
 *  - makeReqRes() from workspace-helpers provides Express stubs.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeReqRes } from './__fixtures__/workspace-helpers.js';

// ── Hoisted mock references ───────────────────────────────────────────────────

const {
  mockProfileFindOne,
  mockGetCapabilities,
  mockGetCapabilityBlueprint,
  mockSuggestBlueprintSection,
} = vi.hoisted(() => ({
  mockProfileFindOne:           vi.fn(),
  mockGetCapabilities:          vi.fn(),
  mockGetCapabilityBlueprint:   vi.fn(),
  mockSuggestBlueprintSection:  vi.fn(),
}));

vi.mock('../models/UserProfile.js', () => ({
  default: { findOne: mockProfileFindOne },
}));

vi.mock('../services/strategyCanvasService.js', () => ({
  getCapabilities:        mockGetCapabilities,
  getCapabilityBlueprint: mockGetCapabilityBlueprint,
}));

vi.mock('../services/blueprintSuggestService.js', () => ({
  suggestBlueprintSection: mockSuggestBlueprintSection,
}));

import { listCapabilities, fetchCapabilityBlueprint, suggestSection } from '../controllers/strategyCanvasController.js';

// ── Fixture data ──────────────────────────────────────────────────────────────

const STUB_CAPABILITIES = [
  { id: 'ai-initiative-leadership',    name: 'AI Initiative Leadership',    objective: 'Lead AI transformation' },
  { id: 'business-strategy-alignment', name: 'Business Strategy Alignment', objective: 'Connect AI with business objectives' },
];

const STUB_BLUEPRINT = {
  capabilityId:   'ai-initiative-leadership',
  capabilityName: 'AI Initiative Leadership',
  industry:       'Automotive',
  sections: [
    { title: 'Vision',     definition: 'Vision text.', keyPrinciples: ['Principle A'], leadershipQuestion: 'Why AI?', source: 'both', industryContext: 'Auto context.' },
    { title: 'Alignment',  definition: 'Alignment text.', keyPrinciples: ['Principle B'], leadershipQuestion: 'Are we aligned?', source: 'core', industryContext: null },
  ],
};

const STUB_SUGGEST_RESULT = {
  suggestion: {
    currentObservations: 'The current vision is broad.',
    strengths:           ['Executive commitment'],
    potentialGaps:       ['No measurable targets'],
    suggestedRevision:   'By 2027, achieve 30% lead-time reduction.',
    whyThisHelps:        'Measurable targets enable board tracking.',
    alternatives:        ['Alternative A'],
  },
  capabilityName: 'AI Initiative Leadership',
  industry:       'Automotive',
  sectionTitle:   'Vision',
  inputTokens:    500,
  outputTokens:   200,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: profile found with Automotive industry
  mockProfileFindOne.mockReturnValue({
    lean: () => Promise.resolve({ industryDomain: 'Automotive' }),
  });

  mockGetCapabilities.mockReturnValue(STUB_CAPABILITIES);
  mockGetCapabilityBlueprint.mockReturnValue(STUB_BLUEPRINT);
  mockSuggestBlueprintSection.mockResolvedValue(STUB_SUGGEST_RESULT);
});

// ── listCapabilities ──────────────────────────────────────────────────────────

describe('listCapabilities()', () => {
  it('returns 200 with industry and capabilities on success', async () => {
    const { req, res } = makeReqRes();
    await listCapabilities(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'Automotive', capabilities: STUB_CAPABILITIES }),
    );
  });

  it('calls getCapabilities() from the service', async () => {
    const { req, res } = makeReqRes();
    await listCapabilities(req, res);
    expect(mockGetCapabilities).toHaveBeenCalledTimes(1);
  });

  it('maps ADAS sub-domain to Automotive knowledge-base folder', async () => {
    mockProfileFindOne.mockReturnValue({
      lean: () => Promise.resolve({ industryDomain: 'ADAS' }),
    });
    const { req, res } = makeReqRes();
    await listCapabilities(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'Automotive' }),
    );
  });

  it('maps Diagnostics sub-domain to Automotive knowledge-base folder', async () => {
    mockProfileFindOne.mockReturnValue({
      lean: () => Promise.resolve({ industryDomain: 'Diagnostics' }),
    });
    const { req, res } = makeReqRes();
    await listCapabilities(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'Automotive' }),
    );
  });

  it('maps General sub-domain to Automotive knowledge-base folder', async () => {
    mockProfileFindOne.mockReturnValue({
      lean: () => Promise.resolve({ industryDomain: 'General' }),
    });
    const { req, res } = makeReqRes();
    await listCapabilities(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'Automotive' }),
    );
  });

  it('defaults to Automotive when profile is not found', async () => {
    mockProfileFindOne.mockReturnValue({
      lean: () => Promise.resolve(null),
    });
    const { req, res } = makeReqRes();
    await listCapabilities(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ industry: 'Automotive' }),
    );
  });

  it('returns 500 when the service throws', async () => {
    mockGetCapabilities.mockImplementation(() => {
      throw new Error('Service failure');
    });
    const { req, res } = makeReqRes();
    await listCapabilities(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── fetchCapabilityBlueprint ──────────────────────────────────────────────────

describe('fetchCapabilityBlueprint()', () => {
  it('returns 200 with the capability blueprint on success', async () => {
    const { req, res } = makeReqRes({}, { capabilityId: 'ai-initiative-leadership' });
    await fetchCapabilityBlueprint(req, res);
    expect(res.json).toHaveBeenCalledWith(STUB_BLUEPRINT);
  });

  it('calls getCapabilityBlueprint with capabilityId and detected industry', async () => {
    const { req, res } = makeReqRes({}, { capabilityId: 'ai-initiative-leadership' });
    await fetchCapabilityBlueprint(req, res);
    expect(mockGetCapabilityBlueprint).toHaveBeenCalledWith(
      'ai-initiative-leadership',
      'Automotive',
    );
  });

  it('returns 404 when the service throws a "Capability not found" error', async () => {
    mockGetCapabilityBlueprint.mockImplementation(() => {
      throw new Error('Capability not found: unknown-cap');
    });
    const { req, res } = makeReqRes({}, { capabilityId: 'unknown-cap' });
    await fetchCapabilityBlueprint(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.error).toContain('Capability not found');
  });

  it('returns 500 for non-capability errors', async () => {
    mockGetCapabilityBlueprint.mockImplementation(() => {
      throw new Error('Unexpected parse error');
    });
    const { req, res } = makeReqRes({}, { capabilityId: 'ai-initiative-leadership' });
    await fetchCapabilityBlueprint(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('defaults to Automotive industry when profile lookup fails', async () => {
    mockProfileFindOne.mockReturnValue({
      lean: () => Promise.reject(new Error('DB error')),
    });
    const { req, res } = makeReqRes({}, { capabilityId: 'ai-initiative-leadership' });
    await fetchCapabilityBlueprint(req, res);
    expect(mockGetCapabilityBlueprint).toHaveBeenCalledWith(
      'ai-initiative-leadership',
      'Automotive',
    );
  });
});

// ── suggestSection (Sprint 16) ────────────────────────────────────────────────

describe('suggestSection()', () => {
  it('returns 200 with the suggestion result on success', async () => {
    const { req, res } = makeReqRes({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'OEMs are facing pressure.',
      request:        'Make this more measurable.',
    });
    await suggestSection(req, res);
    expect(res.json).toHaveBeenCalledWith(STUB_SUGGEST_RESULT);
  });

  it('calls suggestBlueprintSection with the correct parameters', async () => {
    const { req, res } = makeReqRes({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'OEMs are facing pressure.',
      request:        'Make this more measurable.',
    });
    await suggestSection(req, res);
    expect(mockSuggestBlueprintSection).toHaveBeenCalledWith({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'OEMs are facing pressure.',
      request:        'Make this more measurable.',
    });
  });

  it('trims leading and trailing whitespace from the request', async () => {
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      '  Improve this section.  ',
    });
    await suggestSection(req, res);
    expect(mockSuggestBlueprintSection).toHaveBeenCalledWith(
      expect.objectContaining({ request: 'Improve this section.' }),
    );
  });

  it('returns 400 when capabilityId is missing', async () => {
    const { req, res } = makeReqRes({ sectionTitle: 'Vision', request: 'Improve.' });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when capabilityId is not a string', async () => {
    const { req, res } = makeReqRes({ capabilityId: 123, sectionTitle: 'Vision', request: 'Improve.' });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when sectionTitle is missing', async () => {
    const { req, res } = makeReqRes({ capabilityId: 'ai-initiative-leadership', request: 'Improve.' });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when request is missing', async () => {
    const { req, res } = makeReqRes({ capabilityId: 'ai-initiative-leadership', sectionTitle: 'Vision' });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when request is a whitespace-only string', async () => {
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      sectionTitle: 'Vision',
      request:      '   ',
    });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('passes empty string as currentContent when omitted', async () => {
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Generate a draft.',
      // currentContent omitted
    });
    await suggestSection(req, res);
    expect(mockSuggestBlueprintSection).toHaveBeenCalledWith(
      expect.objectContaining({ currentContent: '' }),
    );
  });

  it('passes empty object as blueprint when omitted', async () => {
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      sectionTitle: 'Vision',
      request:      'Improve.',
    });
    await suggestSection(req, res);
    expect(mockSuggestBlueprintSection).toHaveBeenCalledWith(
      expect.objectContaining({ blueprint: {} }),
    );
  });

  it('returns 503 when the service throws an API key error', async () => {
    mockSuggestBlueprintSection.mockRejectedValueOnce(
      new Error('ANTHROPIC_API_KEY is not configured.'),
    );
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      sectionTitle: 'Vision',
      request:      'Improve.',
    });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 503 when all LLM providers are unavailable', async () => {
    mockSuggestBlueprintSection.mockRejectedValueOnce(
      new Error('All LLM providers are unavailable:\n  - gemini: quota exceeded'),
    );
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      sectionTitle: 'Vision',
      request:      'Improve.',
    });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 503 error body containing "not available"', async () => {
    mockSuggestBlueprintSection.mockRejectedValueOnce(
      new Error('ANTHROPIC_API_KEY is not configured.'),
    );
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      sectionTitle: 'Vision',
      request:      'Improve.',
    });
    await suggestSection(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.error).toContain('not available');
  });

  it('returns 500 for unexpected service errors', async () => {
    mockSuggestBlueprintSection.mockRejectedValueOnce(new Error('Unexpected parse failure'));
    const { req, res } = makeReqRes({
      capabilityId: 'ai-initiative-leadership',
      sectionTitle: 'Vision',
      request:      'Improve.',
    });
    await suggestSection(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
