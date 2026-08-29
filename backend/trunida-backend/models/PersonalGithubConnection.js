/**
 * SoorgaAI — Personal GitHub Connection Model
 *
 * One document per user, storing the OAuth token used to push Eame's
 * generated project to the user's own GitHub account (Window 5 of the
 * pipeline wizard). Simpler than PersonalConfluenceConnection — classic
 * GitHub OAuth App tokens don't expire, so there's no refresh token or
 * expiry to track.
 */

import mongoose from 'mongoose';

const encryptedTokenSchema = new mongoose.Schema({
  iv:         { type: String, required: true },
  tag:        { type: String, required: true },
  ciphertext: { type: String, required: true },
}, { _id: false });

const personalGithubConnectionSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true,
    index:    true,
  },

  githubLogin: { type: String, default: '' },

  encryptedAccessToken: { type: encryptedTokenSchema, default: null },
  scopes:                { type: [String], default: [] },

  connectedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('PersonalGithubConnection', personalGithubConnectionSchema);
