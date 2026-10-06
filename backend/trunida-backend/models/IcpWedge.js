/**
 * Svarg — the wedge for one vertical, as found from its interviews
 *
 * The AI groups the companies that describe the SAME problem — not the same
 * category — and drafts the wedge sentence from their words. It is ready only
 * when two or more companies with evidenced answers share one problem, which
 * is the playbook's step 9 applied, and it stays a draft until a person locks
 * it.
 */
import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  problem:   { type: String, default: '' },
  kind:      { type: String, default: '' },
  companies: { type: [String], default: [] },
  evidenced: { type: [String], default: [] },
  why:       { type: String, default: '' },
}, { _id: false });

const icpWedgeSchema = new mongoose.Schema({
  vertical: { type: String, required: true, unique: true },
  groups:   { type: [groupSchema], default: [] },
  draft: {
    segment:  { type: String, default: '' },
    problem:  { type: String, default: '' },
    outcome:  { type: String, default: '' },
    sentence: { type: String, default: '' },
  },
  /** A shared problem with evidence at two or more companies exists. */
  ready:    { type: Boolean, default: false },
  reason:   { type: String, default: '' },
  /** The interviews this was found from; differs from now when any changed since. */
  foundFrom: { type: String, default: '' },
  foundAt:  { type: Date, default: null },
  error:    { type: String, default: '' },
  locked:   { type: String, default: '' },
  lockedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.models.IcpWedge || mongoose.model('IcpWedge', icpWedgeSchema);
