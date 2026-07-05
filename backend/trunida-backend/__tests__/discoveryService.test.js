/**
 * Unit Tests — discoveryService.js
 *
 * Strategy:
 *  - @anthropic-ai/sdk is mocked so no real API calls are made.
 *  - dotenv is mocked as a no-op so .env files cannot interfere with env vars.
 *  - vi.resetModules() + dynamic import controls whether the module sees
 *    ANTHROPIC_API_KEY at load time (determines if `anthropic` is null or not).
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DISCOVERY_RESPONSE_AUTOMOTIVE,
  DISCOVERY_RESPONSE_OTHER_LOW_CONFIDENCE,
  DISCOVERY_RESPONSE_FINANCE,
  DISCOVERY_RESPONSE_WITH_MARKDOWN_FENCE,
  DISCOVERY_RESPONSE_MALFORMED,
} from './__fixtures__/claude-responses.js';

// ── Stable mock for the Anthropic messages.create method ─────────────────────
const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}));

// ── Mock @anthropic-ai/sdk — must be a class (not arrow fn) so `new Anthropic()` works ──
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: mockMessagesCreate };
    }
  },
}));

// ── Mock dotenv so .env files never pollute process.env in tests ──────────────
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Import a fresh discoveryService with ANTHROPIC_API_KEY set. */
async function importWithApiKey(key = 'test-api-key-abc') {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = key;
  return import('../services/discoveryService.js');
}

/** Import a fresh discoveryService with no API key. */
async function importWithoutApiKey() {
  vi.resetModules();
  delete process.env.ANTHROPIC_API_KEY;
  return import('../services/discoveryService.js');
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('discoveryService — discoverCompany()', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  // ── No-API-key fallback path ────────────────────────────────────────────────

  describe('when ANTHROPIC_API_KEY is not set', () => {
    it('returns fallback result without calling Claude', async () => {
      const { discoverCompany } = await importWithoutApiKey();
      const result = await discoverCompany('Bosch');

      expect(mockMessagesCreate).not.toHaveBeenCalled();
      expect(result.domain).toBe('Automotive');
      expect(result.confidence).toBe(0.3);
    });

    it('fallback result has all required contract fields', async () => {
      const { discoverCompany } = await importWithoutApiKey();
      const result = await discoverCompany('Bosch');

      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('subDomain');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('welcomeMessage');
    });

    it('includes the company name in the welcome message', async () => {
      const { discoverCompany } = await importWithoutApiKey();
      const result = await discoverCompany('Continental');
      expect(result.welcomeMessage).toContain('Continental');
    });
  });

  // ── Empty / blank company name ──────────────────────────────────────────────

  describe('when companyName is empty or blank', () => {
    it('returns fallback for empty string', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_AUTOMOTIVE);

      const result = await discoverCompany('');
      expect(result.domain).toBe('Automotive');
      expect(result.confidence).toBe(0.3);
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('returns fallback for whitespace-only string', async () => {
      const { discoverCompany } = await importWithApiKey();
      const result = await discoverCompany('   ');
      expect(mockMessagesCreate).not.toHaveBeenCalled();
      expect(result.domain).toBe('Automotive');
    });
  });

  // ── Happy path: Claude returns valid JSON ───────────────────────────────────

  describe('when Claude returns a valid response', () => {
    it('returns the correctly classified domain for a known company', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_AUTOMOTIVE);

      const result = await discoverCompany('Bosch');

      expect(result.domain).toBe('Automotive');
      expect(result.subDomain).toBe('Tier-1 Supplier');
      expect(result.confidence).toBeCloseTo(0.95);
    });

    it('result has all five required contract fields', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_AUTOMOTIVE);

      const result = await discoverCompany('Bosch');

      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('subDomain');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('welcomeMessage');
    });

    it('classifies Finance domain correctly', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_FINANCE);

      const result = await discoverCompany('Goldman Sachs');

      expect(result.domain).toBe('Finance');
      expect(result.subDomain).toBe('Investment Banking');
    });

    it('welcome message contains company name and domain context', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_AUTOMOTIVE);

      const result = await discoverCompany('Bosch');

      expect(result.welcomeMessage).toContain('Bosch');
      expect(result.welcomeMessage.toLowerCase()).toContain('automotive');
    });

    it('confidence is clamped to [0, 1]', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({ domain: 'Automotive', subDomain: '', summary: '', confidence: 1.5 }),
        }],
      });
      const result = await discoverCompany('TestCo');
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ── Markdown-fenced JSON response ───────────────────────────────────────────

  describe('when Claude wraps response in markdown fences', () => {
    it('still parses the JSON correctly', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_WITH_MARKDOWN_FENCE);

      const result = await discoverCompany('HealthTech Co');

      expect(result.domain).toBe('Healthcare');
      expect(result.confidence).toBeCloseTo(0.85);
    });
  });

  // ── Low-confidence "Other" domain → fallback to Automotive ─────────────────

  describe('when Claude returns Other domain with low confidence', () => {
    it('falls back to Automotive for Other + confidence < 0.5', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_OTHER_LOW_CONFIDENCE);

      const result = await discoverCompany('UnknownCorp');

      expect(result.domain).toBe('Automotive');
    });

    it('preserves Other domain when confidence >= 0.5', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({ domain: 'Other', subDomain: 'Tech', summary: 'A tech company.', confidence: 0.7 }),
        }],
      });
      const result = await discoverCompany('TechCo');
      expect(result.domain).toBe('Other');
    });
  });

  // ── Unsupported domain ──────────────────────────────────────────────────────

  describe('when Claude returns an unsupported domain value', () => {
    it('defaults to Automotive', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({ domain: 'SpaceExploration', subDomain: '', summary: '', confidence: 0.9 }),
        }],
      });
      const result = await discoverCompany('SpaceCo');
      expect(result.domain).toBe('Automotive');
    });
  });

  // ── Claude API failure ──────────────────────────────────────────────────────

  describe('when Claude API throws an error', () => {
    it('returns the fallback Automotive result instead of propagating the error', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockRejectedValue(new Error('Network timeout'));

      const result = await discoverCompany('Bosch');

      expect(result.domain).toBe('Automotive');
      expect(result.confidence).toBe(0.3);
    });

    it('returns fallback when Claude returns malformed (non-JSON) text', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue(DISCOVERY_RESPONSE_MALFORMED);

      const result = await discoverCompany('Bosch');

      expect(result.domain).toBe('Automotive');
      expect(result.confidence).toBe(0.3);
    });

    it('returns fallback when Claude returns empty content array', async () => {
      const { discoverCompany } = await importWithApiKey();
      mockMessagesCreate.mockResolvedValue({ content: [] });

      const result = await discoverCompany('Bosch');

      expect(result.domain).toBe('Automotive');
    });
  });
});
