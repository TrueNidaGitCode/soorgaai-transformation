/**
 * Jira Connection — one document per user, storing the Atlassian OAuth
 * tokens used to list/read Jira issues. Trimmed from Svarg's own
 * PersonalConfluenceConnection model (no Confluence-space fields — this
 * kit only reads Jira).
 */

import mongoose from 'mongoose';

const encryptedTokenSchema = new mongoose.Schema({
  iv:         { type: String, required: true },
  tag:        { type: String, required: true },
  ciphertext: { type: String, required: true },
}, { _id: false });

const jiraConnectionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },

  cloudId:  { type: String, default: '' },
  siteUrl:  { type: String, default: '' },
  siteName: { type: String, default: '' },

  encryptedAccessToken:  { type: encryptedTokenSchema, default: null },
  encryptedRefreshToken: { type: encryptedTokenSchema, default: null },
  accessTokenExpiresAt:  { type: Date, default: null },
  scopes:                { type: [String], default: [] },

  connectedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('JiraConnection', jiraConnectionSchema);
