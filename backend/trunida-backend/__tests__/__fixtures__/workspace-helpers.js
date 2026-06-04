/**
 * Fixture helpers for AI Transformation Workspace unit tests.
 *
 * Provides:
 *   makeReqRes()        — Express req/res stubs (extends the existing session-helpers pattern)
 *   makeProfile()       — stub UserProfile document
 *   makeDomainCanvas()  — stub DomainCanvas document
 *   makeConversation()  — stub Conversation document
 *   makeAIStrategyCanvas() — full canvas with all 5 AI Strategy focus areas
 */

import { vi } from 'vitest';

// ── Express helpers ───────────────────────────────────────────────────────────

/**
 * Build mock Express req and res objects.
 * res.status(code) returns { json } — same pattern as session-helpers.js.
 */
export function makeReqRes(body = {}, params = {}, user = { _id: 'user-id-123', id: 'user-id-123', role: 'user' }, query = {}) {
  const req = { body, params, user, query };
  const json   = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { req, res: { status, json } };
}

// ── MongoDB document stubs ────────────────────────────────────────────────────

export const STUB_USER_ID = 'user-id-abc-123';

export function makeProfile(overrides = {}) {
  return {
    _id:            'profile-id-001',
    userId:         STUB_USER_ID,
    orgName:        'Acme Motors GmbH',
    role:           'CTO',
    industryDomain: 'ADAS',
    createdAt:      new Date('2026-01-01'),
    ...overrides,
  };
}

export const AI_STRATEGY_FOCUS_AREAS = [
  { id: 'vision-alignment',          title: 'AI Vision & Business Alignment',     description: 'Default vision description.' },
  { id: 'investment-prioritization', title: 'AI Investment & Prioritization',      description: 'Default investment description.' },
  { id: 'roadmap-execution',         title: 'AI Roadmap & Execution',              description: 'Default roadmap description.' },
  { id: 'culture-change',            title: 'AI Culture & Change Management',      description: 'Default culture description.' },
  { id: 'metrics-value',             title: 'AI Metrics & Value Tracking',         description: 'Default metrics description.' },
];

export function makeDomainCanvas(overrides = {}) {
  return {
    _id:        'canvas-id-001',
    userId:     STUB_USER_ID,
    domainId:   'ai-strategy',
    focusAreas: AI_STRATEGY_FOCUS_AREAS.map(fa => ({ ...fa })),
    auditLog:   [],
    save:       vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function makeConversation(turns = [], overrides = {}) {
  return {
    _id:             'conv-id-001',
    userId:          STUB_USER_ID,
    domainId:        'ai-strategy',
    turns,
    summary:         '',
    summaryUpToTurn: 0,
    lastActivityAt:  new Date(),
    save:            vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Build n stub turns alternating user/assistant. */
export function makeStubTurns(n) {
  return Array.from({ length: n }, (_, i) => ({
    role:    i % 2 === 0 ? 'user' : 'assistant',
    content: `Turn ${i + 1} content.`,
    createdAt: new Date(),
    error:   false,
  }));
}

// ── Claude response stubs ─────────────────────────────────────────────────────

/** Valid chat envelope — reply + one canvas update */
export function makeChatEnvelopeValid(focusAreaId = 'vision-alignment') {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        reply: 'Here is my advice for your AI strategy.',
        canvasUpdates: [{
          focusAreaId,
          newDescription: 'We have identified a clear AI vision aligned to revenue growth and efficiency.',
          confidence:     0.85,
          evidence:       'User stated: "our primary goal is to reduce production downtime by 20%".',
        }],
      }),
    }],
    usage: { input_tokens: 500, output_tokens: 120 },
  };
}

/** Valid chat envelope — reply only, no canvas updates */
export const CHAT_ENVELOPE_NO_UPDATES = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      reply: 'Tell me more about your current AI initiatives.',
      canvasUpdates: [],
    }),
  }],
  usage: { input_tokens: 400, output_tokens: 80 },
};

/** Malformed response — not valid JSON */
export const CHAT_RESPONSE_MALFORMED = {
  content: [{ type: 'text', text: 'This is not JSON at all.' }],
  usage: { input_tokens: 400, output_tokens: 20 },
};

/** Summarization response */
export const SUMMARY_RESPONSE = {
  content: [{ type: 'text', text: 'Summary: Acme Motors is focused on reducing downtime.' }],
  usage: { input_tokens: 200, output_tokens: 40 },
};
