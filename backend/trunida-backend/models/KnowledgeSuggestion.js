import mongoose from 'mongoose';

const KnowledgeSuggestionSchema = new mongoose.Schema({
  projectId:           { type: String, required: true },  // domainId or blueprintId
  title:               { type: String, required: true },
  description:         { type: String, required: true },
  sourceConversation:  { type: String },                  // conversationId as string
  suggestedDomain:     { type: String },                  // 'project' | 'company' | 'industry'
  suggestedCapability: { type: String },
  suggestedSection:    { type: String },
  knowledgeType: {
    type: String,
    enum: ['PROJECT', 'COMPANY', 'INDUSTRY'],
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
  },
  confidence: { type: Number, min: 0, max: 1 },
  reasoning:  { type: String },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Indexes for common query patterns
KnowledgeSuggestionSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
KnowledgeSuggestionSchema.index({ projectId: 1, status: 1 });

export default mongoose.model('KnowledgeSuggestion', KnowledgeSuggestionSchema);
