/**
 * SoorgaAI — Symmetric Encryption Utility
 *
 * AES-256-GCM via Node's built-in crypto module. Used to encrypt third-party
 * OAuth tokens (e.g. Confluence access/refresh tokens) at rest — the codebase
 * has no prior encryption-at-rest utility, only one-way hashing (bcrypt, sha256).
 *
 * Key: process.env.TOKEN_ENCRYPTION_KEY, 32 raw bytes, base64-encoded.
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import crypto from 'crypto';

const ALGORITHM   = 'aes-256-gcm';
const IV_LENGTH    = 12; // bytes — recommended size for GCM
const KEY_LENGTH   = 32; // bytes — AES-256

function loadKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not configured.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`TOKEN_ENCRYPTION_KEY is not configured or is not ${KEY_LENGTH} bytes.`);
  }
  return key;
}

/**
 * @returns {boolean} whether TOKEN_ENCRYPTION_KEY is present and correctly sized.
 */
export function isEncryptionConfigured() {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} plaintext
 * @returns {{ iv: string, tag: string, ciphertext: string }} all fields base64-encoded
 */
export function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) {
    throw new Error('encryptSecret requires a non-empty string.');
  }

  const key = loadKey();
  const iv  = crypto.randomBytes(IV_LENGTH);

  const cipher     = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag        = cipher.getAuthTag();

  return {
    iv:         iv.toString('base64'),
    tag:        tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/**
 * @param {{ iv: string, tag: string, ciphertext: string }} payload
 * @returns {string} plaintext
 * @throws if the auth tag does not match (tampered or wrong key)
 */
export function decryptSecret({ iv, tag, ciphertext }) {
  if (!iv || !tag || !ciphertext) {
    throw new Error('decryptSecret requires { iv, tag, ciphertext }.');
  }

  const key      = loadKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}
