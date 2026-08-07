/**
 * SoorgaAI — Action Item (blueprint action tracker)
 *
 * Extracted from a capability's generated content once that capability
 * completes — one blueprint can have many action items across its
 * capabilities. Review-oriented status set (not generic to-do), matching
 * how these are meant to be used: "X to be reviewed by Y and agreed upon,"
 * not just "done."
 */

import mongoose from 'mongoose';

const actionItemSchema = new mongoose.Schema({
  blueprintId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'TransformationBlueprint',
    required: true,
    index:    true,
  },

  domainId:       { type: String, required: true },
  domainName:     { type: String, required: true },
  capabilityId:   { type: String, required: true },
  capabilityName: { type: String, required: true },

  title:       { type: String, required: true },
  description: { type: String, default: '' },

  assignee: { type: String, default: '' }, // free text — e.g. "Product Owner"
  reviewer: { type: String, default: '' }, // free text — e.g. "Technical Architect"

  status: {
    type:    String,
    enum:    ['not_started', 'in_progress', 'in_review', 'agreed'],
    default: 'not_started',
  },

  dueDate: { type: Date, default: null },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

actionItemSchema.index({ blueprintId: 1, capabilityId: 1 });

export default mongoose.model('ActionItem', actionItemSchema);
