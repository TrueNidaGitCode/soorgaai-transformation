/**
 * Remove AI Governance & Ethics capability from all TransformationBlueprints.
 *
 * The capability was removed from the AI Strategy spec but existing blueprints
 * in MongoDB still carry it. This script pulls it out without requiring a
 * full domain regeneration.
 *
 * Usage (Railway console or local with env var):
 *   MONGO_URI="mongodb+srv://..." node scripts/remove_governance_ethics_capability.mjs
 */

import mongoose from 'mongoose';
import TransformationBlueprint from '../models/TransformationBlueprint.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('Error: MONGO_URI or MONGODB_URI environment variable is required.');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log('Connected to MongoDB.');

const result = await TransformationBlueprint.updateMany(
  { 'domains.domainId': 'ai-strategy' },
  {
    $pull: {
      'domains.$[dom].capabilities': { capabilityId: 'ai-governance-ethics' },
    },
  },
  {
    arrayFilters: [{ 'dom.domainId': 'ai-strategy' }],
  }
);

console.log(`Matched: ${result.matchedCount}  Modified: ${result.modifiedCount}`);
console.log('Done — AI Governance & Ethics removed from all AI Strategy domains.');

await mongoose.disconnect();
