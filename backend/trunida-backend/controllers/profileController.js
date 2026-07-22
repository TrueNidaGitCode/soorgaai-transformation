/**
 * SoorgaAI — Profile Controller
 *
 * Handles workspace profile setup and retrieval.
 *
 * POST /api/profile
 *   Creates UserProfile + 7 DomainCanvas docs atomically.
 *   Idempotent: if profile already exists, returns it unchanged (200).
 *
 * GET /api/profile/me
 *   Returns the profile for the authenticated user.
 *   Returns 404 if profile setup has not been completed — frontend uses this
 *   to redirect new users to /profile-setup.
 *
 * PATCH /api/profile
 *   Updates mutable profile fields (orgName, role, industryDomain).
 */

import UserProfile  from '../models/UserProfile.js';
import DomainCanvas from '../models/DomainCanvas.js';
import DOMAINS      from '../data/domainDefinitions.js';
import { ensureBlueprint } from '../services/enterpriseBlueprintService.js';

// ── POST /api/profile ─────────────────────────────────────────────────────────

export const createProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orgName } = req.body;

    if (!orgName) {
      return res.status(400).json({ error: 'orgName is required.' });
    }

    // Idempotency: return existing profile without mutation
    const existing = await UserProfile.findOne({ userId }).lean();
    if (existing) {
      return res.status(200).json({ profile: existing, created: false });
    }

    // Create profile (role and industryDomain use schema defaults)
    const profile = await UserProfile.create({ userId, orgName });

    // Atomically initialize 7 DomainCanvas docs from config defaults
    const canvasDocs = DOMAINS.map(domain => ({
      userId,
      domainId:   domain.domainId,
      focusAreas: domain.focusAreas.map(fa => ({
        id:          fa.id,
        title:       fa.title,
        description: fa.defaultDescription,
      })),
      auditLog: [],
    }));

    await DomainCanvas.insertMany(canvasDocs, { ordered: false });

    console.log(`✅ Profile + 7 canvases created for userId ${userId}`);

    // Stage 1: auto-create empty enterprise blueprint shell for the org — this
    // also checks CompanyResearchLibrary for a name match and copies in any
    // admin-approved public research (see ensureBlueprint). Fire-and-forget —
    // a failure here must not block the profile response.
    ensureBlueprint({ orgName, industry: profile.industryDomain, createdByUserId: userId })
      .catch(err => console.error('[EnterpriseBlueprint] Shell creation failed (non-fatal):', err.message));

    return res.status(201).json({ profile, created: true });

  } catch (err) {
    // Duplicate key on UserProfile unique index — another request beat us
    if (err.code === 11000) {
      const existing = await UserProfile.findOne({ userId: req.user._id }).lean();
      return res.status(200).json({ profile: existing, created: false });
    }
    console.error('createProfile error:', err);
    return res.status(500).json({ error: 'Failed to create profile.' });
  }
};

// ── GET /api/profile/me ───────────────────────────────────────────────────────

export const getMyProfile = async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Complete profile setup first.' });
    }
    return res.status(200).json({ profile });
  } catch (err) {
    console.error('getMyProfile error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};

// ── PATCH /api/profile ────────────────────────────────────────────────────────

export const updateProfile = async (req, res) => {
  try {
    const { orgName, role, industryDomain } = req.body;
    const updates = {};
    if (orgName)       updates.orgName       = orgName;
    if (role)          updates.role          = role;
    if (industryDomain) updates.industryDomain = industryDomain;

    const profile = await UserProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found.' });
    }
    return res.status(200).json({ profile });
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
};
