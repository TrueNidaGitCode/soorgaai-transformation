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
    // The company's public site, captured at profile setup. Grounds Company
    // Context in what the company says about itself rather than in what a
    // model guesses from its name — which for any young company is a
    // fabrication that then feeds every blueprint.
    websiteUrl: {
      type:     String,
      required: false,
      default:  '',
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
