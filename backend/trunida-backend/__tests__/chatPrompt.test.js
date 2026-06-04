/**
 * Unit tests — services/promptTemplates/chatPrompt.js
 *
 * Pure functions — no mocks, no DB, no API calls.
 */

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildMessages } from '../services/promptTemplates/chatPrompt.js';
import { makeProfile, AI_STRATEGY_FOCUS_AREAS } from './__fixtures__/workspace-helpers.js';

const PROFILE  = makeProfile();
const CANVAS   = AI_STRATEGY_FOCUS_AREAS;

// ── buildSystemPrompt ─────────────────────────────────────────────────────────

describe('buildSystemPrompt()', () => {
  it('includes the organisation name', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(prompt).toContain('Acme Motors GmbH');
  });

  it('includes the user role', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(prompt).toContain('CTO');
  });

  it('includes the industry domain', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(prompt).toContain('ADAS');
  });

  it('includes all 5 focus area titles', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    for (const fa of CANVAS) {
      expect(prompt).toContain(fa.title);
    }
  });

  it('includes all 5 focus area IDs (for canvasUpdates references)', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    for (const fa of CANVAS) {
      expect(prompt).toContain(fa.id);
    }
  });

  it('includes the JSON output format instruction', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(prompt).toContain('"reply"');
    expect(prompt).toContain('"canvasUpdates"');
  });

  it('instructs the model never to modify focus area titles', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(prompt.toLowerCase()).toContain('title');
    // The rule says titles should not be changed
    expect(prompt.toLowerCase()).toMatch(/never.*title|title.*never|title.*untouch/i);
  });

  it('requires evidence for every canvas update', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(prompt).toContain('evidence');
  });

  it('specifies the minimum confidence threshold (0.7)', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(prompt).toContain('0.7');
  });

  it('returns a non-empty string', () => {
    const prompt = buildSystemPrompt(PROFILE, CANVAS);
    expect(typeof prompt).toBe('string');
    expect(prompt.trim().length).toBeGreaterThan(100);
  });
});

// ── buildMessages ─────────────────────────────────────────────────────────────

describe('buildMessages()', () => {
  it('returns an array of message objects', () => {
    const msgs = buildMessages([], '', 'Hello');
    expect(Array.isArray(msgs)).toBe(true);
  });

  it('last message is the current user message with role "user"', () => {
    const msgs = buildMessages([], '', 'My question');
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toBe('My question');
  });

  it('when no summary and no history, contains only the user message', () => {
    const msgs = buildMessages([], '', 'Hi');
    expect(msgs).toHaveLength(1);
  });

  it('includes recent turns in order before the current message', () => {
    const turns = [
      { role: 'user',      content: 'First user message' },
      { role: 'assistant', content: 'First agent reply' },
    ];
    const msgs = buildMessages(turns, '', 'Follow-up');

    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('First user message');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('First agent reply');
    expect(msgs[2].role).toBe('user');
    expect(msgs[2].content).toBe('Follow-up');
  });

  it('injects rolling summary as a user+assistant message pair before turns', () => {
    const msgs = buildMessages([], 'Context from earlier.', 'New question');

    // Summary pair is injected first (user then assistant)
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toContain('Context from earlier.');
    expect(msgs[1].role).toBe('assistant');

    // Current message is last
    const last = msgs[msgs.length - 1];
    expect(last.content).toBe('New question');
  });

  it('does NOT inject summary pair when summary is empty string', () => {
    const msgs = buildMessages([], '', 'Just a question');
    expect(msgs).toHaveLength(1);
  });

  it('does NOT inject summary pair when summary is falsy', () => {
    const msgs = buildMessages([], null, 'Just a question');
    expect(msgs).toHaveLength(1);
  });

  it('preserves role for each turn verbatim', () => {
    const turns = [
      { role: 'assistant', content: 'Agent spoke first (unusual but valid)' },
    ];
    const msgs = buildMessages(turns, '', 'User reply');
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[1].role).toBe('user');
  });
});
