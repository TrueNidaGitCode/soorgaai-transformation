/**
 * Svarg — one ICP interview, as the four answers and the playbook they fill
 *
 * The Target Audience tab used to be written by hand in the page source: a
 * cell per playbook row per company, typed after each conversation. Since
 * 6 October 2026 an interview is four answers, typed as notes, and the AI
 * fills the ten-step playbook from them — each cell quoting the sentence it
 * came from, so a tick can always be traced back to something said.
 *
 * Cells a person corrects are marked `edited` and are never overwritten by a
 * later fill. The AI proposes; the operator decides.
 */
import mongoose from 'mongoose';

const cellSchema = new mongoose.Schema({
  /** yes evidenced · open asked, not established · claim stated, not arithmetic · '' not asked */
  state:  { type: String, enum: ['yes', 'open', 'claim', ''], default: '' },
  text:   { type: String, default: '' },
  /** The words in the answers this cell rests on. Empty for a manual cell. */
  quote:  { type: String, default: '' },
  edited: { type: Boolean, default: false },
}, { _id: false });

const icpInterviewSchema = new mongoose.Schema({
  vertical: { type: String, required: true, index: true },
  /** Column order on the table: A, B, C … */
  order:    { type: Number, default: 0 },
  company:  { type: String, required: true, trim: true },
  /** Who was met — the role, not necessarily a name. */
  met:      { type: String, default: '', trim: true },
  when:     { type: String, default: '', trim: true },

  /** The four questions' answers, as the interviewer's notes. */
  answers: {
    problem:   { type: String, default: '' },
    example:   { type: String, default: '' },
    detection: { type: String, default: '' },
    value:     { type: String, default: '' },
  },

  /** Playbook row key → cell. See icpInterviewService ROWS. */
  cells: { type: Map, of: cellSchema, default: () => new Map() },

  /** Which answers the cells were filled from; differs from now when they changed since. */
  filledFrom: { type: String, default: '' },
  filledAt:   { type: Date, default: null },
  fillError:  { type: String, default: '' },

  /** Re-filed from the hand-written table rather than typed as answers. */
  legacy: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.models.IcpInterview || mongoose.model('IcpInterview', icpInterviewSchema);
