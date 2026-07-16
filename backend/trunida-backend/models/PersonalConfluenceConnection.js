/**
 * SoorgaAI — Personal Confluence Connection Model
 *
 * One document per USER (not per org, unlike ConfluenceConnection). Lets any
 * authenticated user — CTO/Admin or not — connect their own Confluence
 * account to pick specific pages for a specific blueprint, independent of
 * whether their org has an org-wide connection set up.
 *
 * Structurally mirrors ConfluenceConnection.js (same encrypted-token shape,
 * discovered-spaces cache) but keyed by userId and with no admin gating.
 */

import mongoose from 'mongoose';

const encryptedTokenSchema = new mongoose.Schema({
  iv:         { type: String, required: true },
  tag:        { type: String, required: true },
  ciphertext: { type: String, required: true },
}, { _id: false });

const discoveredSpaceSchema = new mongoose.Schema({
  key:  { type: String, required: true },
  id:   { type: String, required: true },
  name: { type: String, default: '' },
  type: { type: String, default: '' },
}, { _id: false });

const personalConfluenceConnectionSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true,
    index:    true,
  },

  status: {
    type:    String,
    enum:    ['discovering', 'active', 'error'],
    default: 'discovering',
  },

  cloudId:  { type: String, default: '' },
  siteUrl:  { type: String, default: '' },
  siteName: { type: String, default: '' },

  encryptedAccessToken:  { type: encryptedTokenSchema, default: null },
  encryptedRefreshToken: { type: encryptedTokenSchema, default: null },
  accessTokenExpiresAt:  { type: Date, default: null },
  scopes:                { type: [String], default: [] },

  discoveredSpaces: { type: [discoveredSpaceSchema], default: [] },
  discoveredAt:     { type: Date, default: null },

  connectedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('PersonalConfluenceConnection', personalConfluenceConnectionSchema);
