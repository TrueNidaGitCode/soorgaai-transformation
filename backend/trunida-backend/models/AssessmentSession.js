/**
 * SoorgaAI — AssessmentSession Model
 *
 * Stores the full lifecycle of a dynamic assessment session:
 * registration → domain discovery → question generation → answers → score.
 *
 * Runs in parallel with the static AssessmentResponse flow (v1).
 * Does NOT replace or modify any existing models.
 */

import mongoose from 'mongoose';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const DiscoveredDomainSchema = new mongoose.Schema(
  {
    domain:     { type: String, default: 'Automotive' }, // Automotive | Healthcare | Finance | Manufacturing | Retail | Other
    subDomain:  { type: String, default: '' },
    summary:    { type: String, default: '' },
    confidence: { type: Number, default: 0.5, min: 0, max: 1 },
  },
  { _id: false }
);

const QuestionOptionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const SessionQuestionSchema = new mongoose.Schema(
  {
    questionId:  { type: String, required: true },
    text:        { type: String, required: true },
    focusAreaId: { type: String, required: true }, // matches focus-areas.json id
    stageHint:   { type: String, default: '' },    // which maturity stage this probes
    options:     { type: [QuestionOptionSchema], default: [] },
    weight:      { type: Number, default: 1 },
  },
  { _id: false }
);

const SessionAnswerSchema = new mongoose.Schema(
  {
    questionId:  { type: String, required: true },
    value:       { type: Number, required: true, min: 1, max: 5 },
    answeredAt:  { type: Date, default: Date.now },
  },
  { _id: false }
);

const FocusAreaScoreSchema = new mongoose.Schema(
  {
    focusAreaId:   { type: String, required: true },
    focusAreaName: { type: String, required: true },
    score:         { type: Number, required: true, min: 0, max: 100 },
    rawAverage:    { type: Number, required: true },
    questionCount: { type: Number, required: true },
  },
  { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────────────────────

const AssessmentSessionSchema = new mongoose.Schema(
  {
    // Linked to a user if logged in; anonymous if not
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // Registration step
    name:        { type: String, required: true, trim: true },
    role:        { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },

    // Discovery step result
    discoveredDomain: { type: DiscoveredDomainSchema, default: () => ({}) },
    welcomeMessage:   { type: String, default: '' },

    // Generated questions (up to 20)
    questions: { type: [SessionQuestionSchema], default: [] },

    // User answers
    answers: { type: [SessionAnswerSchema], default: [] },

    // Scoring results
    focusAreaScores: { type: [FocusAreaScoreSchema], default: [] },
    overallScore:    { type: Number, min: 0, max: 100, default: null },
    maturityStage:   { type: String, default: null },

    // Lifecycle state
    status: {
      type: String,
      enum: ['started', 'discovered', 'questions_generated', 'in_progress', 'completed'],
      default: 'started',
    },

    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AssessmentSessionSchema.index({ userId: 1, createdAt: -1 });

const AssessmentSession = mongoose.model('AssessmentSession', AssessmentSessionSchema);
export default AssessmentSession;
