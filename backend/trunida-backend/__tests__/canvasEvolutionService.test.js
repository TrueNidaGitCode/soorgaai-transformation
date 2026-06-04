/**
 * Unit tests — services/canvasEvolutionService.js
 *
 * Strategy:
 *  - DomainCanvas.findOne is mocked to return a stub canvas doc with a save() spy.
 *  - getDomain / getFocusAreaIds from domainDefinitions are used directly (no mock needed).
 *  - applyUpdates() is tested for every validation rule and the audit-log contract.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeDomainCanvas, STUB_USER_ID } from './__fixtures__/workspace-helpers.js';

const { mockCanvasFind } = vi.hoisted(() => ({ mockCanvasFind: vi.fn() }));
vi.mock('../models/DomainCanvas.js', () => ({ default: { findOne: mockCanvasFind } }));

import { applyUpdates } from '../services/canvasEvolutionService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeValidUpdate(focusAreaId = 'vision-alignment', overrides = {}) {
  return {
    focusAreaId,
    newDescription: 'AI vision is aligned to measurable business outcomes and board-level KPIs.',
    confidence:     0.85,
    evidence:       'User said: "we want to cut production downtime by 20% in 12 months".',
    ...overrides,
  };
}

let canvas;

beforeEach(() => {
  vi.clearAllMocks();
  canvas = makeDomainCanvas();
  mockCanvasFind.mockResolvedValue(canvas);
});

// ── Empty / null input ────────────────────────────────────────────────────────

describe('applyUpdates() — empty input', () => {
  it('returns an empty array when rawUpdates is undefined', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', undefined, null);
    expect(result).toHaveLength(0);
  });

  it('returns an empty array when rawUpdates is an empty array', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [], null);
    expect(result).toHaveLength(0);
  });

  it('does not call canvas.save() when there are no updates', async () => {
    await applyUpdates(STUB_USER_ID, 'ai-strategy', [], null);
    expect(canvas.save).not.toHaveBeenCalled();
  });
});

// ── Missing canvas ─────────────────────────────────────────────────────────────

describe('applyUpdates() — missing canvas', () => {
  it('returns an empty array when canvas is not found in DB', async () => {
    mockCanvasFind.mockResolvedValue(null);
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [makeValidUpdate()], null);
    expect(result).toHaveLength(0);
  });
});

// ── Validation rule: unknown focusAreaId ──────────────────────────────────────

describe('applyUpdates() — Rule 1: unknown focusAreaId rejected', () => {
  it('rejects an update with a non-existent focusAreaId', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('nonexistent-focus-area'),
    ], null);
    expect(result).toHaveLength(0);
  });

  it('does not save canvas when all updates are rejected', async () => {
    await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('nonexistent-focus-area'),
    ], null);
    expect(canvas.save).not.toHaveBeenCalled();
  });
});

// ── Validation rule: confidence threshold ────────────────────────────────────

describe('applyUpdates() — Rule 2: confidence < 0.7 rejected', () => {
  it('rejects update with confidence 0.69', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { confidence: 0.69 }),
    ], null);
    expect(result).toHaveLength(0);
  });

  it('rejects update with confidence 0', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { confidence: 0 }),
    ], null);
    expect(result).toHaveLength(0);
  });

  it('accepts update with confidence exactly 0.7', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { confidence: 0.7 }),
    ], null);
    expect(result).toHaveLength(1);
  });

  it('accepts update with confidence 1.0', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { confidence: 1.0 }),
    ], null);
    expect(result).toHaveLength(1);
  });
});

// ── Validation rule: description length ──────────────────────────────────────

describe('applyUpdates() — Rule 3: description length 20–400 chars', () => {
  it('rejects a description shorter than 20 characters', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { newDescription: 'Too short.' }),
    ], null);
    expect(result).toHaveLength(0);
  });

  it('rejects an empty description', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { newDescription: '' }),
    ], null);
    expect(result).toHaveLength(0);
  });

  it('rejects a description longer than 400 characters', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { newDescription: 'A'.repeat(401) }),
    ], null);
    expect(result).toHaveLength(0);
  });

  it('accepts a description of exactly 20 characters', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { newDescription: 'A'.repeat(20) }),
    ], null);
    expect(result).toHaveLength(1);
  });

  it('accepts a description of exactly 400 characters', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { newDescription: 'A'.repeat(400) }),
    ], null);
    expect(result).toHaveLength(1);
  });
});

// ── Validation rule: evidence required ───────────────────────────────────────

describe('applyUpdates() — Rule 4: evidence required', () => {
  it('rejects an update with no evidence field', async () => {
    const update = makeValidUpdate();
    delete update.evidence;
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [update], null);
    expect(result).toHaveLength(0);
  });

  it('rejects an update with null evidence', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { evidence: null }),
    ], null);
    expect(result).toHaveLength(0);
  });

  it('rejects an update with whitespace-only evidence', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { evidence: '   ' }),
    ], null);
    expect(result).toHaveLength(0);
  });
});

// ── Validation rule: title mutations silently rejected ───────────────────────

describe('applyUpdates() — Rule 5: title cannot be mutated', () => {
  it('applies description update without changing the stored focus area title', async () => {
    const originalTitle = canvas.focusAreas[0].title;
    await applyUpdates(STUB_USER_ID, 'ai-strategy', [makeValidUpdate()], null);

    const updatedFa = canvas.focusAreas.find(fa => fa.id === 'vision-alignment');
    expect(updatedFa.title).toBe(originalTitle);
  });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('applyUpdates() — happy path', () => {
  it('returns one accepted update for a valid input', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [makeValidUpdate()], null);
    expect(result).toHaveLength(1);
  });

  it('returned update contains focusAreaId, title, and newDescription', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [makeValidUpdate()], null);
    expect(result[0]).toHaveProperty('focusAreaId', 'vision-alignment');
    expect(result[0]).toHaveProperty('title');
    expect(result[0]).toHaveProperty('newDescription');
  });

  it('updates the focus area description in the canvas document', async () => {
    const newDesc = 'Clear AI vision tied to $10M revenue impact by Q4 2027.';
    await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment', { newDescription: newDesc }),
    ], null);

    const fa = canvas.focusAreas.find(f => f.id === 'vision-alignment');
    expect(fa.description).toBe(newDesc);
  });

  it('calls canvas.save() after applying updates', async () => {
    await applyUpdates(STUB_USER_ID, 'ai-strategy', [makeValidUpdate()], null);
    expect(canvas.save).toHaveBeenCalledOnce();
  });

  it('appends an audit log entry with the correct fields', async () => {
    await applyUpdates(STUB_USER_ID, 'ai-strategy', [makeValidUpdate()], 'conv-id-001');

    expect(canvas.auditLog).toHaveLength(1);
    const entry = canvas.auditLog[0];
    expect(entry).toHaveProperty('focusAreaId', 'vision-alignment');
    expect(entry).toHaveProperty('previousDesc');
    expect(entry).toHaveProperty('newDesc');
    expect(entry).toHaveProperty('evidence');
    expect(entry).toHaveProperty('confidence');
  });

  it('handles multiple valid updates in one call and accepts all', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment'),
      makeValidUpdate('roadmap-execution', {
        newDescription: 'A phased roadmap from quick wins to enterprise-scale over 18 months.',
        evidence: 'User confirmed: "we have 18 months to show value before the next board review".',
      }),
    ], null);

    expect(result).toHaveLength(2);
    expect(canvas.auditLog).toHaveLength(2);
  });

  it('accepts valid updates and rejects invalid ones in the same call', async () => {
    const result = await applyUpdates(STUB_USER_ID, 'ai-strategy', [
      makeValidUpdate('vision-alignment'),
      makeValidUpdate('nonexistent-id'),                              // rejected: bad ID
      makeValidUpdate('metrics-value', { confidence: 0.5 }),          // rejected: low confidence
    ], null);

    expect(result).toHaveLength(1);
    expect(result[0].focusAreaId).toBe('vision-alignment');
  });
});
