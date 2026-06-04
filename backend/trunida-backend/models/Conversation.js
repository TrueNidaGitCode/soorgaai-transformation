/**
 * SoorgaAI — Conversation Model
 *
 * Persists the full chat history for one domain × user pair.
 * One document per (userId, domainId) — compound unique index enforced below.
 *
 * turns[] is append-only. Each turn records role, content, token counts, and
 * an optional error flag for failed agent calls.
 *
 * summary / summaryUpToTurn support rolling summarization:
 *   - When turn count > 10 since summaryUpToTurn, the service collapses older
 *     turns into summary and advances summaryUpToTurn.
 *   - The LLM context window always receives: summary + last-10-turns verbatim.
 */

import mongoose from 'mongoose';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const TurnSchema = new mongoose.Schema(
  {
    role:        { type: String, enum: ['user', 'assistant'], required: true },
    content:     { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens:{ type: Number, default: 0 },
    error:       { type: Boolean, default: false },
    createdAt:   { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────────────────────

const ConversationSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    domainId: {
      type:     String,
      required: true,
    },
    turns: {
      type:    [TurnSchema],
      default: [],
    },
    summary: {
      type:    String,
      default: '',
    },
    summaryUpToTurn: {
      type:    Number,
      default: 0,
    },
    lastActivityAt: {
      type:    Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Enforce one conversation per user × domain
ConversationSchema.index({ userId: 1, domainId: 1 }, { unique: true });

const Conversation = mongoose.model('Conversation', ConversationSchema);
export default Conversation;
