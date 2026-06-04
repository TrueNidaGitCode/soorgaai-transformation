/**
 * Unit tests — controllers/workspaceController.js
 *
 * Strategy:
 *  - UserProfile, DomainCanvas, Conversation models mocked.
 *  - DOMAINS imported directly (real data — no mock needed).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeReqRes, makeProfile, makeDomainCanvas } from './__fixtures__/workspace-helpers.js';

const { mockProfileFind, mockCanvasFind, mockConvFind } = vi.hoisted(() => ({
  mockProfileFind: vi.fn(),
  mockCanvasFind:  vi.fn(),
  mockConvFind:    vi.fn(),
}));

vi.mock('../models/UserProfile.js',  () => ({ default: { findOne: mockProfileFind } }));
vi.mock('../models/DomainCanvas.js', () => ({ default: { find:    mockCanvasFind  } }));
vi.mock('../models/Conversation.js', () => ({ default: { find:    mockConvFind    } }));

import { getWorkspaceState, getDomainCatalog } from '../controllers/workspaceController.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

const stubCanvas = makeDomainCanvas();

beforeEach(() => {
  vi.clearAllMocks();

  mockProfileFind.mockReturnValue({ lean: () => Promise.resolve(makeProfile()) });
  mockCanvasFind.mockReturnValue({ lean: () => Promise.resolve([stubCanvas]) });
  mockConvFind.mockReturnValue({ lean: () => Promise.resolve([]) });
});

// ── getWorkspaceState ─────────────────────────────────────────────────────────

describe('getWorkspaceState()', () => {
  it('returns 404 when the user profile does not exist', async () => {
    mockProfileFind.mockReturnValue({ lean: () => Promise.resolve(null) });
    const { req, res } = makeReqRes();
    await getWorkspaceState(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 200 with profile and domains on success', async () => {
    const { req, res } = makeReqRes();
    await getWorkspaceState(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body).toHaveProperty('profile');
    expect(body).toHaveProperty('domains');
  });

  it('returns exactly 7 domains', async () => {
    const { req, res } = makeReqRes();
    await getWorkspaceState(req, res);
    const { domains } = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(domains).toHaveLength(7);
  });

  it('marks ai-strategy as enabled and the rest as disabled', async () => {
    const { req, res } = makeReqRes();
    await getWorkspaceState(req, res);
    const { domains } = res.status.mock.results[0].value.json.mock.calls[0][0];
    const enabled = domains.filter(d => d.enabled);
    expect(enabled).toHaveLength(1);
    expect(enabled[0].domainId).toBe('ai-strategy');
  });

  it('attaches canvas focus areas to the ai-strategy domain', async () => {
    const { req, res } = makeReqRes();
    await getWorkspaceState(req, res);
    const { domains } = res.status.mock.results[0].value.json.mock.calls[0][0];
    const aiDomain = domains.find(d => d.domainId === 'ai-strategy');
    expect(aiDomain.canvas).toHaveLength(5);
  });

  it('attaches lastActivityAt from the conversation when available', async () => {
    const actDate = new Date('2026-05-01T10:00:00Z');
    mockConvFind.mockReturnValue({
      lean: () => Promise.resolve([
        { domainId: 'ai-strategy', lastActivityAt: actDate },
      ]),
    });
    const { req, res } = makeReqRes();
    await getWorkspaceState(req, res);
    const { domains } = res.status.mock.results[0].value.json.mock.calls[0][0];
    const aiDomain = domains.find(d => d.domainId === 'ai-strategy');
    expect(aiDomain.lastActivityAt).toEqual(actDate);
  });

  it('sets lastActivityAt to null when no conversation exists for a domain', async () => {
    const { req, res } = makeReqRes();
    await getWorkspaceState(req, res);
    const { domains } = res.status.mock.results[0].value.json.mock.calls[0][0];
    const leadership = domains.find(d => d.domainId === 'leadership');
    expect(leadership.lastActivityAt).toBeNull();
  });
});

// ── getDomainCatalog ──────────────────────────────────────────────────────────

describe('getDomainCatalog()', () => {
  it('returns 200', async () => {
    const { req, res } = makeReqRes();
    await getDomainCatalog(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns exactly 7 domains', async () => {
    const { req, res } = makeReqRes();
    await getDomainCatalog(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.domains).toHaveLength(7);
  });

  it('each catalog entry has domainId, title, description, icon, and enabled', () => {
    const { req, res } = makeReqRes();
    getDomainCatalog(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    for (const d of body.domains) {
      expect(d).toHaveProperty('domainId');
      expect(d).toHaveProperty('title');
      expect(d).toHaveProperty('description');
      expect(d).toHaveProperty('icon');
      expect(d).toHaveProperty('enabled');
    }
  });

  it('does not expose focusAreas or suggestedPrompts in the catalog', () => {
    const { req, res } = makeReqRes();
    getDomainCatalog(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    for (const d of body.domains) {
      expect(d).not.toHaveProperty('focusAreas');
      expect(d).not.toHaveProperty('suggestedPrompts');
    }
  });

  it('does not require JWT auth (no user on req)', async () => {
    const { req, res } = makeReqRes({}, {}, null);  // user = null (unauthenticated)
    await expect(getDomainCatalog(req, res)).resolves.not.toThrow();
  });
});
