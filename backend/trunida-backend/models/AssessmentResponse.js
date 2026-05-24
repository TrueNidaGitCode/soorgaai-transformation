/**
 * SoorgaAI - AssessmentResponse Model
 * Stores a user's completed assessment answers, domain scores, and maturity stage.
 */

import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema(
  {
    questionId:  { type: String, required: true },
    domainId:    { type: String, required: true },
    domainName:  { type: String, required: true },
    value:       { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const DomainScoreSchema = new mongoose.Schema(
  {
    domainId:    { type: String, required: true },
    domainName:  { type: String, required: true },
    score:       { type: Number, required: true, min: 0, max: 100 }, // 0–100
    rawAverage:  { type: Number, required: true },                   // average of raw 1–5 values
    questionCount: { type: Number, required: true },
  },
  { _id: false }
);

const AssessmentResponseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Organisation context (optional, collected on assessment start)
    orgName:     { type: String, default: '' },
    orgSize:     { type: String, default: '' },  // e.g. '1–50', '51–200', '201–1000', '1000+'
    industry:    { type: String, default: '' },

    // Raw answers from the user
    answers: {
      type: [AnswerSchema],
      required: true,
      validate: {
        validator: (arr) => arr.length === 35,
        message: 'An assessment must contain exactly 35 answers (7 domains × 5 questions).',
      },
    },

    // Computed scores per domain
    domainScores: {
      type: [DomainScoreSchema],
      default: [],
    },

    // Overall computed score (weighted average of domain scores, 0–100)
    overallScore: { type: Number, min: 0, max: 100, default: 0 },

    // Maturity stage derived from overallScore
    maturityStage: {
      type: String,
      enum: [
        'AI Scramble',
        'AI Pivot',
        'AI Alignment',
        'AI Transform',
        'AI-Fueled Enterprise',
      ],
      default: 'AI Scramble',
    },

    // Whether an AI report has been generated for this response
    reportGenerated: { type: Boolean, default: false },
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AssessmentReport',
      default: null,
    },

    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Index for quick lookup of a user's assessments ordered by date
AssessmentResponseSchema.index({ userId: 1, completedAt: -1 });

const AssessmentResponse = mongoose.model('AssessmentResponse', AssessmentResponseSchema);
export default AssessmentResponse;
