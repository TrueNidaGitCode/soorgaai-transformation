/**
 * Unit tests — controllers/profileController.js
 *
 * Strategy:
 *  - UserProfile and DomainCanvas model methods mocked.
 *  - DOMAINS imported directly (real data, no mock needed).
 *  - makeReqRes() from workspace-helpers for Express stubs.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { makeReqRes, makeProfile } from './__fixtures__/workspace-helpers.js';

const {
  mockProfileCreate,
  mockProfileFindOne,
  mockProfileFindOneAndUpdate,
  mockCanvasInsertMany,
} = vi.hoisted(() => ({
  mockProfileCreate:           vi.fn(),
  mockProfileFindOne:          vi.fn(),
  mockProfileFindOneAndUpdate: vi.fn(),
  mockCanvasInsertMany:        vi.fn(),
}));

vi.mock('../models/UserProfile.js', () => ({
  default: {
    create:            mockProfileCreate,
    findOne:           mockProfileFindOne,
    findOneAndUpdate:  mockProfileFindOneAndUpdate,
  },
}));

vi.mock('../models/DomainCanvas.js', () => ({
  default: { insertMany: mockCanvasInsertMany },
}));

import {
  createProfile,
  getMyProfile,
  updateProfile,
} from '../controllers/profileController.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

const VALID_BODY = { orgName: 'Acme Motors GmbH', role: 'CTO', industryDomain: 'ADAS' };

beforeEach(() => {
  vi.clearAllMocks();
  mockProfileFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
  mockProfileCreate.mockResolvedValue(makeProfile());
  mockCanvasInsertMany.mockResolvedValue([]);
});

// ── createProfile — input validation ─────────────────────────────────────────

describe('createProfile() — input validation', () => {
  it('returns 400 when orgName is missing', async () => {
    const { req, res } = makeReqRes({ role: 'CTO', industryDomain: 'ADAS' });
    await createProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when role is missing', async () => {
    const { req, res } = makeReqRes({ orgName: 'Acme', industryDomain: 'ADAS' });
    await createProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when industryDomain is missing', async () => {
    const { req, res } = makeReqRes({ orgName: 'Acme', role: 'CTO' });
    await createProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── createProfile — happy path ────────────────────────────────────────────────

describe('createProfile() — happy path', () => {
  it('returns 201 on successful creation', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('calls UserProfile.create with the correct fields', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    expect(mockProfileCreate).toHaveBeenCalledWith(expect.objectContaining({
      orgName: 'Acme Motors GmbH',
      role:    'CTO',
    }));
  });

  it('calls DomainCanvas.insertMany with exactly 7 canvas documents', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    const canvasDocs = mockCanvasInsertMany.mock.calls[0][0];
    expect(canvasDocs).toHaveLength(7);
  });

  it('includes ai-strategy canvas with 5 focus areas', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    const canvasDocs = mockCanvasInsertMany.mock.calls[0][0];
    const aiCanvas   = canvasDocs.find(c => c.domainId === 'ai-strategy');
    expect(aiCanvas).toBeDefined();
    expect(aiCanvas.focusAreas).toHaveLength(5);
  });

  it('response body includes created: true', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.created).toBe(true);
  });
});

// ── createProfile — idempotency ───────────────────────────────────────────────

describe('createProfile() — idempotency (profile already exists)', () => {
  beforeEach(() => {
    mockProfileFindOne.mockReturnValue({ lean: () => Promise.resolve(makeProfile()) });
  });

  it('returns 200 (not 201) when profile already exists', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not call UserProfile.create when profile already exists', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    expect(mockProfileCreate).not.toHaveBeenCalled();
  });

  it('does not call DomainCanvas.insertMany when profile already exists', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    expect(mockCanvasInsertMany).not.toHaveBeenCalled();
  });

  it('response body includes created: false', async () => {
    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.created).toBe(false);
  });
});

// ── createProfile — duplicate key race condition ──────────────────────────────

describe('createProfile() — duplicate key (11000) race condition', () => {
  it('returns 200 and the existing profile on duplicate-key error', async () => {
    mockProfileFindOne
      .mockReturnValueOnce({ lean: () => Promise.resolve(null) })  // first check: no profile
      .mockReturnValueOnce({ lean: () => Promise.resolve(makeProfile()) });  // fetch after conflict

    const dupErr = new Error('duplicate key');
    dupErr.code  = 11000;
    mockProfileCreate.mockRejectedValue(dupErr);

    const { req, res } = makeReqRes(VALID_BODY);
    await createProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── getMyProfile ──────────────────────────────────────────────────────────────

describe('getMyProfile()', () => {
  it('returns 200 with the profile when it exists', async () => {
    mockProfileFindOne.mockReturnValue({ lean: () => Promise.resolve(makeProfile()) });
    const { req, res } = makeReqRes();
    await getMyProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 when the profile does not exist', async () => {
    mockProfileFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const { req, res } = makeReqRes();
    await getMyProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('response body contains profile field on 200', async () => {
    mockProfileFindOne.mockReturnValue({ lean: () => Promise.resolve(makeProfile()) });
    const { req, res } = makeReqRes();
    await getMyProfile(req, res);
    const body = res.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body).toHaveProperty('profile');
  });
});

// ── updateProfile ─────────────────────────────────────────────────────────────

describe('updateProfile()', () => {
  it('returns 200 with updated profile on success', async () => {
    mockProfileFindOneAndUpdate.mockReturnValue({
      lean: () => Promise.resolve(makeProfile({ orgName: 'New Org Name' })),
    });
    const { req, res } = makeReqRes({ orgName: 'New Org Name' });
    await updateProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 when profile to update does not exist', async () => {
    mockProfileFindOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(null) });
    const { req, res } = makeReqRes({ orgName: 'New Org Name' });
    await updateProfile(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
