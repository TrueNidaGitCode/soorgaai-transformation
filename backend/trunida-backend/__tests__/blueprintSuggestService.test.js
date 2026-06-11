/**
 * Unit Tests — blueprintSuggestService.js (Sprint 16)
 *
 * Strategy:
 *  - strategyCanvasService mocked: isolates the suggestion service from file I/O.
 *  - llmService mocked: controls LLM output without real API calls.
 *  - Tests cover context assembly (P1-P5 blocks), JSON parsing, graceful fallback,
 *    and error propagation — mirrors the advisorService.test.js pattern.
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

import { suggestBlueprintSection } from '../services/blueprintSuggestService.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUB_BLUEPRINT = {
  capabilityId:   'ai-initiative-leadership',
  capabilityName: 'AI Initiative Leadership',
  industry:       'Automotive',
  sections: [
    {
      title:              'Vision',
      definition:         'The strategic clarity and ambition behind the AI programme.',
      keyPrinciples:      ['Principle A — long-term thinking', 'Principle B — executive ownership'],
      leadershipQuestion: 'What is the ambition of your AI programme?',
      source:             'both',
      industryContext:    'OEMs must lead with a clear AI transformation mandate.',
    },
    {
      title:              'Alignment',
      definition:         'Ensuring AI initiatives are connected to business objectives.',
      keyPrinciples:      ['Principle C — business linkage'],
      leadershipQuestion: 'Are AI initiatives connected to measurable business outcomes?',
      source:             'core',
      industryContext:    null,
    },
  ],
};

const STUB_SUGGESTION = {
  currentObservations: 'The current vision is broad but lacks measurable outcomes.',
  strengths:           ['Clear executive commitment', 'Industry-relevant framing'],
  potentialGaps:       ['No specific OEM targets', 'Missing 2027 milestones'],
  suggestedRevision:   'By 2027, our AI programme will achieve a 30% reduction in development lead time.',
  whyThisHelps:        'Measurable targets give the board clarity and enable quarterly tracking.',
  alternatives:        ['Alternative A: focus on quality KPIs', 'Alternative B: cost-reduction framing'],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  readCapabilityContent.mockReturnValue({
    coreContent:     '# AI Initiative Leadership\nCore document content.',
    industryContent: '# Automotive AI Initiative Leadership\nIndustry document content.',
    capabilityName:  'AI Initiative Leadership',
  });
  readSpecContent.mockReturnValue('# AI Strategy Intelligence Specification\nSpec content here.');
  readRelatedCapabilityContent.mockReturnValue([
    { id: 'business-strategy-alignment', name: 'Business Strategy Alignment', content: '# BSA\nRelated content.' },
  ]);

  mockGenerate.mockResolvedValue({
    text:         JSON.stringify(STUB_SUGGESTION),
    inputTokens:  600,
    outputTokens: 250,
  });
});

// ── Contract fields ───────────────────────────────────────────────────────────

describe('suggestBlueprintSection() — response contract', () => {
  it('returns a suggestion object with all six structured fields', async () => {
    const result = await suggestBlueprintSection({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'OEMs are facing intense competitive pressure.',
      request:        'Make this more measurable.',
    });

    expect(result).toHaveProperty('suggestion');
    const { suggestion } = result;
    expect(suggestion).toHaveProperty('currentObservations');
    expect(suggestion).toHaveProperty('strengths');
    expect(suggestion).toHaveProperty('potentialGaps');
    expect(suggestion).toHaveProperty('suggestedRevision');
    expect(suggestion).toHaveProperty('whyThisHelps');
    expect(suggestion).toHaveProperty('alternatives');
  });

  it('returns capabilityName, industry, and sectionTitle metadata', async () => {
    const result = await suggestBlueprintSection({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'Existing draft.',
      request:        'Improve.',
    });

    expect(result.capabilityName).toBe('AI Initiative Leadership');
    expect(result.industry).toBe('Automotive');
    expect(result.sectionTitle).toBe('Vision');
  });

  it('returns token usage counts from the LLM', async () => {
    const result = await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    expect(result.inputTokens).toBe(600);
    expect(result.outputTokens).toBe(250);
  });

  it('correctly maps all six LLM JSON fields into the suggestion object', async () => {
    const result = await suggestBlueprintSection({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'Existing vision.',
      request:        'Make measurable.',
    });

    const { suggestion } = result;
    expect(suggestion.currentObservations).toBe(STUB_SUGGESTION.currentObservations);
    expect(suggestion.strengths).toEqual(STUB_SUGGESTION.strengths);
    expect(suggestion.potentialGaps).toEqual(STUB_SUGGESTION.potentialGaps);
    expect(suggestion.suggestedRevision).toBe(STUB_SUGGESTION.suggestedRevision);
    expect(suggestion.whyThisHelps).toBe(STUB_SUGGESTION.whyThisHelps);
    expect(suggestion.alternatives).toEqual(STUB_SUGGESTION.alternatives);
  });
});

// ── Context retrieval ─────────────────────────────────────────────────────────

describe('suggestBlueprintSection() — context retrieval', () => {
  it('calls readCapabilityContent with the correct capabilityId and industry', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    expect(readCapabilityContent).toHaveBeenCalledWith('ai-initiative-leadership', 'Automotive');
  });

  it('calls readSpecContent to retrieve the AI Strategy Specification', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    expect(readSpecContent).toHaveBeenCalledTimes(1);
  });

  it('calls readRelatedCapabilityContent for P5 knowledge with the correct capabilityId', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    expect(readRelatedCapabilityContent).toHaveBeenCalledWith('ai-initiative-leadership');
  });
});

// ── Prompt construction ───────────────────────────────────────────────────────

describe('suggestBlueprintSection() — prompt construction', () => {
  it('system prompt contains the capability name, industry, and section title', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    const { systemPrompt } = mockGenerate.mock.calls[0][0];
    expect(systemPrompt).toContain('AI Initiative Leadership');
    expect(systemPrompt).toContain('Automotive');
    expect(systemPrompt).toContain('Vision');
  });

  it('user message includes all five priority context blocks', async () => {
    await suggestBlueprintSection({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'Existing vision.',
      request:        'Improve.',
    });

    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).toContain('P1: ACTIVE BLUEPRINT SECTION');
    expect(userMessage).toContain('P2: CORE CAPABILITY DOCUMENT');
    expect(userMessage).toContain('P3:');
    expect(userMessage).toContain('P4: AI STRATEGY INTELLIGENCE SPECIFICATION');
    expect(userMessage).toContain('P5: RELATED CAPABILITY KNOWLEDGE');
  });

  it('user message includes the user request verbatim', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Make this more measurable and executive focused.',
    });

    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).toContain('Make this more measurable and executive focused.');
  });

  it('user message labels the company draft when currentContent is provided', async () => {
    await suggestBlueprintSection({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: 'OEMs are facing intense competitive pressure.',
      request:        'Improve.',
    });

    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).toContain('Company Draft (current');
    expect(userMessage).toContain('OEMs are facing intense competitive pressure.');
  });

  it('user message notes "not yet written" when currentContent is empty', async () => {
    await suggestBlueprintSection({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: '',
      request:        'Generate a draft.',
    });

    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).toContain('not yet written');
  });

  it('includes the blueprint definition in user message when no current draft exists', async () => {
    await suggestBlueprintSection({
      capabilityId:   'ai-initiative-leadership',
      blueprint:      STUB_BLUEPRINT,
      sectionTitle:   'Vision',
      currentContent: '',
      request:        'Generate a draft.',
    });

    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).toContain('The strategic clarity and ambition behind the AI programme.');
  });

  it('includes the section title in the P1 block for non-first sections', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Alignment',
      request:      'Improve.',
    });

    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).toContain('Section: Alignment');
  });

  it('passes maxTokens: 2000 to the LLM generator', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 2000 }),
    );
  });

  it('omits P5 block from user message when no related capabilities are available', async () => {
    readRelatedCapabilityContent.mockReturnValueOnce([]);

    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    const { userMessage } = mockGenerate.mock.calls[0][0];
    expect(userMessage).not.toContain('P5: RELATED CAPABILITY KNOWLEDGE');
  });
});

// ── Fallback / resilience ─────────────────────────────────────────────────────

describe('suggestBlueprintSection() — fallback and resilience', () => {
  it('strips markdown fences and parses the JSON correctly', async () => {
    mockGenerate.mockResolvedValueOnce({
      text:         '```json\n' + JSON.stringify(STUB_SUGGESTION) + '\n```',
      inputTokens:  400,
      outputTokens: 200,
    });

    const result = await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    expect(result.suggestion.suggestedRevision).toBe(STUB_SUGGESTION.suggestedRevision);
  });

  it('falls back gracefully when LLM returns non-JSON text', async () => {
    mockGenerate.mockResolvedValueOnce({
      text:         'Here is my suggested revision for your Vision section.',
      inputTokens:  300,
      outputTokens: 60,
    });

    const result = await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    const { suggestion } = result;
    expect(suggestion.suggestedRevision).toContain('Here is my suggested revision');
    expect(Array.isArray(suggestion.strengths)).toBe(true);
    expect(Array.isArray(suggestion.potentialGaps)).toBe(true);
    expect(Array.isArray(suggestion.alternatives)).toBe(true);
  });

  it('re-throws when generate() rejects due to provider unavailability', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('All LLM providers are unavailable'));

    await expect(suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    })).rejects.toThrow('All LLM providers are unavailable');
  });

  it('re-throws when generate() rejects due to a missing API key', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('ANTHROPIC_API_KEY is not configured.'));

    await expect(suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Improve.',
    })).rejects.toThrow('ANTHROPIC_API_KEY is not configured.');
  });
});

// ── Defaults and edge cases ───────────────────────────────────────────────────

describe('suggestBlueprintSection() — defaults and edge cases', () => {
  it('defaults to Automotive when blueprint has no industry field', async () => {
    await suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    { ...STUB_BLUEPRINT, industry: undefined },
      sectionTitle: 'Vision',
      request:      'Improve.',
    });

    expect(readCapabilityContent).toHaveBeenCalledWith('ai-initiative-leadership', 'Automotive');
  });

  it('resolves successfully when currentContent is omitted', async () => {
    await expect(suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    STUB_BLUEPRINT,
      sectionTitle: 'Vision',
      request:      'Generate a draft.',
    })).resolves.toBeDefined();
  });

  it('does not throw when blueprint has no sections array', async () => {
    await expect(suggestBlueprintSection({
      capabilityId: 'ai-initiative-leadership',
      blueprint:    { capabilityName: 'AI Initiative Leadership', industry: 'Automotive' },
      sectionTitle: 'Vision',
      request:      'Generate a draft.',
    })).resolves.toBeDefined();
  });
});
