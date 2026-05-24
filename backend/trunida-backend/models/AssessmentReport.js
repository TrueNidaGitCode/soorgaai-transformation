/**
 * SoorgaAI - AssessmentReport Model
 * Stores the Claude-generated AI maturity report for a completed assessment.
 */

import mongoose from 'mongoose';

const RoadmapItemSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true },
    description: { type: String, required: true },
    domain:      { type: String, default: '' },     // related domain (optional)
    priority:    { type: String, enum: ['High', 'Medium', 'Low'], default: 'High' },
  },
  { _id: false }
);

const AssessmentReportSchema = new mongoose.Schema(
  {
    assessmentResponseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentResponse',
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Snapshot of scores at report generation time
    overallScore:   { type: Number, required: true },
    maturityStage:  { type: String, required: true },
    domainScores:   { type: Array, default: [] },

    // ── AI-Generated Report Content ──────────────────────────
    executiveSummary: { type: String, required: true },

    strengths: {
      type: [String],
      validate: {
        validator: (arr) => arr.length >= 1 && arr.length <= 5,
        message: 'Provide between 1 and 5 strengths.',
      },
    },

    criticalGaps: {
      type: [String],
      validate: {
        validator: (arr) => arr.length >= 1 && arr.length <= 5,
        message: 'Provide between 1 and 5 critical gaps.',
      },
    },

    topPriorities: {
      type: [String],
      validate: {
        validator: (arr) => arr.length >= 1 && arr.length <= 3,
        message: 'Provide between 1 and 3 top priorities.',
      },
    },

    roadmap90Days: {
      type: [RoadmapItemSchema],
      default: [],
    },

    roadmap12Months: {
      type: [RoadmapItemSchema],
      default: [],
    },

    // Metadata
    modelUsed:    { type: String, default: 'claude-sonnet-4-6' },
    generatedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const AssessmentReport = mongoose.model('AssessmentReport', AssessmentReportSchema);
export default AssessmentReport;
