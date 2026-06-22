/**
 * SoorgaAI — Company Blueprint Model (PI 26.3 Sprint 1)
 *
 * Persists AI-generated company-specific AI Strategy Blueprint documents.
 * One active blueprint per user (soft-versioned via `version` field).
 * Capabilities are generated sequentially; each tracks its own status.
 */

import mongoose from 'mongoose';

const sectionSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  content:   { type: String, default: '' },
  updatedAt: { type: Date,   default: Date.now },
}, { _id: false });

const capabilitySchema = new mongoose.Schema({
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },
  status: {
    type:    String,
    enum:    ['pending', 'in-progress', 'completed', 'error'],
    default: 'pending',
  },
  sections:    { type: [sectionSchema], default: [] },
  completedAt: { type: Date },
  errorMessage: { type: String },
}, { _id: false });

const companyBlueprintSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },
  businessObjective: { type: String, required: true },
  industry:          { type: String, default: 'Automotive' },
  companyName:       { type: String, default: '' },
  status: {
    type:    String,
    enum:    ['generating', 'completed', 'error'],
    default: 'generating',
  },
  version:     { type: String, default: '1.0' },
  generatedAt: { type: Date,   default: Date.now },
  capabilities: { type: [capabilitySchema], default: [] },
}, { timestamps: true });

export default mongoose.model('CompanyBlueprint', companyBlueprintSchema);
