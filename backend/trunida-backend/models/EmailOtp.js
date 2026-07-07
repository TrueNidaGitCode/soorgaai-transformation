/**
 * SoorgaAI — Email OTP Model
 *
 * One document per email address (upserted on each request). Stores only a
 * SHA-256 hash of the 6-digit code, never the code itself. The TTL index
 * removes expired codes automatically.
 */

import mongoose from 'mongoose';

const EmailOtpSchema = new mongoose.Schema(
  {
    email: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
      lowercase: true,
      trim:     true,
    },
    codeHash:   { type: String, required: true },
    expiresAt:  { type: Date,   required: true },
    attempts:   { type: Number, default: 0 },   // failed verify attempts
    lastSentAt: { type: Date,   default: Date.now },
  },
  { timestamps: true }
);

// TTL — Mongo removes the doc once expiresAt passes
EmailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailOtp = mongoose.model('EmailOtp', EmailOtpSchema);
export default EmailOtp;
