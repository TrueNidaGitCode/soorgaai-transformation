/**
 * SoorgaAI — UserProfile Model
 *
 * Stores workspace profile data collected during the one-time profile setup screen.
 * One document per user (userId is unique).
 *
 * Created atomically alongside 7 DomainCanvas docs by profileController.
 */

import mongoose from 'mongoose';

const UserProfileSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      unique:   true,
      index:    true,
    },
    orgName: {
      type:     String,
      required: true,
      trim:     true,
    },
    role: {
      type:     String,
      required: false,
      enum:     ['CTO', 'Engineering Director', 'Engineering Manager'],
      default:  'Engineering Manager',
      trim:     true,
    },
    industryDomain: {
      type:     String,
      required: false,
      enum:     ['General', 'Diagnostics', 'Infotainment', 'ADAS', 'Automotive'],
      default:  'Automotive',
      trim:     true,
    },
  },
  { timestamps: true }
);

const UserProfile = mongoose.model('UserProfile', UserProfileSchema);
export default UserProfile;
