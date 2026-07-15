/**
 * SoorgaAI — Confluence Connection Model
 *
 * One document per organisation. Tracks the OAuth 2.0 (3LO) connection to a
 * customer's Confluence Cloud site, the spaces discovered/selected for
 * extraction, and the most recent sync outcome.
 *
 * Tokens are stored encrypted (see utils/encryption.js) — never in plaintext.
 *
 * There is no "revoked" status: disconnecting hard-deletes this document
 * (see confluenceController.disconnect) rather than tombstoning it, per the
 * feature's security requirement to leave no residual org-linked data behind.
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

const confluenceConnectionSchema = new mongoose.Schema({
  orgName: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
    trim:     true,
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
  selectedSpaceKeys: { type: [String], default: [] },

  connectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  connectedAt:        { type: Date, default: null },

  lastSyncedAt: { type: Date, default: null },
  lastSyncStatus: {
    type:    String,
    enum:    ['idle', 'syncing', 'success', 'partial_error', 'error'],
    default: 'idle',
  },
  lastSyncError: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('ConfluenceConnection', confluenceConnectionSchema);
