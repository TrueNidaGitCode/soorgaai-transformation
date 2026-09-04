/**
 * Svarg — GitHub App Installation
 *
 * One document per user, recording which GitHub App installation Svarg may
 * read from on the Aria screen.
 *
 * Deliberately NOT PersonalGithubConnection. That model holds an encrypted
 * OAuth token with the `repo` scope — read and write on everything — which
 * Eame uses to push a delivered project. This connection can only read, and
 * only the repositories the customer selected during install.
 *
 * There is no token here. Installation access tokens expire after an hour, so
 * they are minted per request from the App's private key and never stored:
 * nothing at rest to encrypt, and nothing to leak.
 */

import mongoose from 'mongoose';

const githubAppInstallationSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true,
    index:    true,
  },

  installationId: { type: String, required: true },

  accountLogin: { type: String, default: '' },
  accountType:  { type: String, default: '' },

  // 'all' or 'selected' — worth showing the user, since "connected" means
  // something different when it covers every repository they own.
  repositorySelection: { type: String, default: '' },

  connectedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('GithubAppInstallation', githubAppInstallationSchema);
