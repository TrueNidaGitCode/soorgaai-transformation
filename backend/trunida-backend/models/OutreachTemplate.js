/**
 * Svarg — the shared outreach template
 *
 * One document. Every new lead starts from it, so the generic body is written
 * once and only the organisation-specific paragraph is typed per prospect.
 *
 * A singleton rather than a collection because a second template is a choice,
 * and a choice on the compose screen is one more thing to get wrong while
 * someone is between calls. If per-segment templates are ever genuinely
 * needed, that is the moment to add a key — not before.
 *
 * The body is expected to contain {{context}}, which is filled from each
 * lead's orgContext, alongside {{name}}, {{company}} and {{link}}.
 */

import mongoose from 'mongoose';

const outreachTemplateSchema = new mongoose.Schema({
  /**
   * Always the string 'default'. Unique, so concurrent writes update the one
   * document instead of racing to create a second.
   */
  key: { type: String, required: true, unique: true, default: 'default' },

  subject: { type: String, default: '' },
  body:    { type: String, default: '' },

  updatedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
    default: null,
  },
}, { timestamps: true });

export default mongoose.model('OutreachTemplate', outreachTemplateSchema);
