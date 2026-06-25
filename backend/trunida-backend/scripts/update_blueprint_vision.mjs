/**
 * One-shot script: Update the Vision section of AI Initiative Leadership
 * in the Enterprise Blueprint for all orgs (or a specific org).
 *
 * Usage:
 *   MONGO_URI="mongodb+srv://..." node scripts/update_blueprint_vision.mjs
 *
 * To target a specific org:
 *   ORG_NAME="Acme Motors" MONGO_URI="..." node scripts/update_blueprint_vision.mjs
 */

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌  MONGO_URI environment variable is required.');
  process.exit(1);
}

// ── Schema (inline — avoids importing the full app) ───────────────────────────

const sectionSchema = new mongoose.Schema({
  title:     String,
  content:   String,
  updatedAt: Date,
  updatedBy: mongoose.Schema.Types.Mixed,
});

const capabilitySchema = new mongoose.Schema({
  capabilityId:   String,
  capabilityName: String,
  sections:       [sectionSchema],
});

const blueprintSchema = new mongoose.Schema({
  orgName:      String,
  industry:     String,
  capabilities: [capabilitySchema],
  status:       String,
}, { timestamps: true });

const EnterpriseBlueprint = mongoose.model('EnterpriseBlueprint', blueprintSchema);

// ── Vision content ────────────────────────────────────────────────────────────

const VISION_CONTENT = `AI as a Core Growth Driver
The company sees significant mid-term growth coming from AI-infused solutions and products across multiple domains including mobility, connected vehicles, aftersales, and autonomous driving.

AI-First Approach
There is a strong push toward AI-first development, especially through the deployment of the next-generation mobility intelligence platform "Beacon" for development, integration, and validation.

Widespread AI Adoption
AI is expected to be leveraged across all areas to increase market share and deliver differentiated value.

Speed and Agility with AI
The organization emphasizes swift adoption of AI and Agile practices to improve execution speed, quality, and innovation.

Investment in AI Capabilities
Focus on investing in talent and innovation to strengthen AI capabilities and maintain technological leadership.

AI-Enabled Ecosystem
Integration of AI with complementary capabilities (e.g., cybersecurity via Cymotive) to create end-to-end intelligent solutions across the vehicle lifecycle.`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  Connected to MongoDB');

  const filter = process.env.ORG_NAME
    ? { orgName: process.env.ORG_NAME }
    : {};

  const blueprints = await EnterpriseBlueprint.find(filter);

  if (blueprints.length === 0) {
    console.warn('⚠️   No enterprise blueprints found. Has a user completed profile setup?');
    await mongoose.disconnect();
    return;
  }

  for (const doc of blueprints) {
    const cap = doc.capabilities.find(c => c.capabilityId === 'ai-initiative-leadership');
    if (!cap) {
      console.warn(`⚠️   Org "${doc.orgName}" has no ai-initiative-leadership capability — skipping.`);
      continue;
    }

    const visionSection = cap.sections.find(s => s.title === 'Vision');
    if (!visionSection) {
      console.warn(`⚠️   Org "${doc.orgName}" Vision section not found — skipping.`);
      continue;
    }

    visionSection.content   = VISION_CONTENT;
    visionSection.updatedAt = new Date();

    // Recompute status
    const all    = doc.capabilities.flatMap(c => c.sections);
    const filled = all.filter(s => s.content && s.content.trim().length > 0);
    doc.status = filled.length === 0 ? 'empty'
               : filled.length === all.length ? 'complete'
               : 'partial';

    await doc.save();
    console.log(`✅  Updated Vision for org: "${doc.orgName}" (blueprint status: ${doc.status})`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error('❌  Script failed:', err.message);
  process.exit(1);
});
