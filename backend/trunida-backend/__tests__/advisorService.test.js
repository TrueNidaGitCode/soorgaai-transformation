/**
 * Unit Tests — advisorService.js
 *
 * Strategy:
 *  - strategyCanvasService mocked: isolates advisor context-building from file I/O.
 *  - @anthropic-ai/sdk (via llmService) mocked: controls LLM output.
 *  - Tests cover context assembly, JSON parsing, fallback, and error paths.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mock references ───────────────────────────────────────────────────

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));

vi.mock('../services/llmService.js', () => ({ generate: mockGenerate }));

vi.mock('../services/strategyCanvasService.js', () => ({
  readCapabilityContent:        vi.fn(),
  readSpecContent:               vi.fn(),
  readRelatedCapabilityContent:  vi.fn(),
}));

import {
  readCapabilityContent,
  readSpecContent,
  readRelatedCapabilityContent,
} from '../services/strategyCanvasService.js';

import { askAdvisor } from '../services/advisorService.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUB_BLUEPRINT = {
  capabilityId:   'ai-initiative-leadership',
  capabilityName: 'AI Initiative Leadership',
  industry:       'Automotive',
  sections: [
    { title: 'Vision',     definition: 'Vision text.',     keyPrinciples: ['Principle A'], leadershipQuestion: 'Why AI?',      source: 'both', industryContext: 'Auto context.' },
    { title: 'Alignment',  definition: 'Alignment text.',  keyPrinciples: ['Principle B'], leadershipQuestion: 'Are we aligned?', source: 'core', industryContext: null },
    { title: 'Commitment', definition: 'Commitment text.', keyPrinciples: ['Principle C'], leadershipQuestion: 'Committed?',   source: 'core', industryContext: null },
  ],
};

const STUB_LLM_RESPONSE = {
  executivePerspective: 'AI is transforming automotive engineering.',
  industryContext:      'OEMs must adapt to SDV trends.',
  recommendations:      ['Invest in AI CoE', 'Build data infrastructure'],
  potentialRisks:       ['Talent shortage', 'Integration complexity'],
  suggestedNextStep:    'Define your AI vision statement this quarter.',
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  readCapabilityContent.mockReturnValue({
    coreContent:     '# AI Initiative Leadership\n\nCore document content.',
    industryContent: '# Automotive AI Initiative Leadership\n\nIndustry content.',
    capabilityName:  'AI Initiative Leadership',
  });
  readSpecContent.mockReturnValue('# AI Strategy Spec\n\nSpec content.');
  readRelatedCapabilityContent.mockReturnValue([
    { id: 'business-strategy-alignment', name: 'Business Strategy Alignment', content: '# BSA\n\nRelated content.' },
  ]);

  mockGenerate.mockResolvedValue({
    text:         JSON.stringify(STUB_LLM_RESPONSE),
    inputTokens:  500,
    outputTokens: 200,
  });
});

// ── askAdvisor ────────────────────────────────────────────────────────────────

describe('askAdvisor()', () => {
  it('returns the parsed response with capability and industry metadata', async () => {
    const result = await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'How do we focus on SDV?',
    });

    expect(result).toHaveProperty('response');
    expect(result).toHaveProperty('capabilityName', 'AI Initiative Leadership');
    expect(result).toHaveProperty('industry', 'Automotive');
  });

  it('returns token usage counts', async () => {
    const result = await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'How do we focus on SDV?',
    });
    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(200);
  });

  it('response has all five structured fields', async () => {
    const { response } = await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'How do we focus on SDV?',
    });
    expect(response).toHaveProperty('executivePerspective');
    expect(response).toHaveProperty('industryContext');
    expect(response).toHaveProperty('recommendations');
    expect(response).toHaveProperty('potentialRisks');
    expect(response).toHaveProperty('suggestedNextStep');
  });

  it('correctly maps LLM JSON into the response object', async () => {
    const { response } = await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'How do we focus on SDV?',
    });
    expect(response.executivePerspective).toBe(STUB_LLM_RESPONSE.executivePerspective);
    expect(response.recommendations).toEqual(STUB_LLM_RESPONSE.recommendations);
    expect(response.suggestedNextStep).toBe(STUB_LLM_RESPONSE.suggestedNextStep);
  });

  it('calls readCapabilityContent with the correct capabilityId and industry', async () => {
    await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    expect(readCapabilityContent).toHaveBeenCalledWith('ai-initiative-leadership', 'Automotive');
  });

  it('calls readRelatedCapabilityContent to retrieve P5 related knowledge', async () => {
    await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    expect(readRelatedCapabilityContent).toHaveBeenCalledWith('ai-initiative-leadership');
  });

  it('calls generate with a system prompt and a user message containing the question', async () => {
    await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'How do we focus on SDV?',
    });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    const { systemPrompt, userMessage } = mockGenerate.mock.calls[0][0];
    expect(typeof systemPrompt).toBe('string');
    expect(systemPrompt).toContain('AI Initiative Leadership');
    expect(userMessage).toContain('How do we focus on SDV?');
  });

  it('user message includes all five priority context blocks', async () => {
    await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).toContain('P1: CURRENT BLUEPRINT');
    expect(userMessage).toContain('P2: CORE CAPABILITY DOCUMENT');
    expect(userMessage).toContain('P3:');
    expect(userMessage).toContain('P4: AI STRATEGY INTELLIGENCE SPECIFICATION');
    expect(userMessage).toContain('P5: RELATED CAPABILITY KNOWLEDGE');
  });

  it('handles LLM response wrapped in markdown fences', async () => {
    mockGenerate.mockResolvedValueOnce({
      text:         '```json\n' + JSON.stringify(STUB_LLM_RESPONSE) + '\n```',
      inputTokens:  300,
      outputTokens: 150,
    });
    const { response } = await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    expect(response.executivePerspective).toBe(STUB_LLM_RESPONSE.executivePerspective);
  });

  it('falls back gracefully when LLM returns non-JSON text', async () => {
    mockGenerate.mockResolvedValueOnce({
      text:         'Here is my executive advice for your AI strategy.',
      inputTokens:  200,
      outputTokens: 50,
    });
    const { response } = await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    });
    expect(response.executivePerspective).toContain('Here is my executive advice');
    expect(Array.isArray(response.recommendations)).toBe(true);
  });

  it('re-throws when generate() rejects (e.g. API key missing)', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY is not configured.'));
    await expect(askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      question:     'SDV question',
    })).rejects.toThrow('ANTHROPIC_API_KEY is not configured.');
  });

  it('defaults industry to Automotive when blueprint has no industry field', async () => {
    await askAdvisor({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    { ...STUB_BLUEPRINT, industry: undefined },
      question:     'SDV question',
    });
    expect(readCapabilityContent).toHaveBeenCalledWith('ai-initiative-leadership', 'Automotive');
  });
});
