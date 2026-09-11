/**
 * Svarg — something the customer should be told
 *
 * Built for the self-learning capability, which is the first thing in the
 * product that finishes work nobody was waiting for. Every other result in
 * Svarg appears on a screen the customer is already looking at; a capability
 * that built itself overnight has no such screen.
 *
 * Kept general rather than named after capabilities, because the next thing
 * that finishes unattended will want the same shape.
 *
 * ── Read state is per-notification, not per-customer ──────────────────────
 *
 * `readAt` rather than a "last seen" timestamp on the user: a customer who
 * opens the list while two things are waiting has not necessarily dealt with
 * both, and a single watermark would mark the second one read on the strength
 * of them noticing the first.
 */

import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  /** The application this is about, when it is about one. */
  blueprintId: { type: String, default: '', index: true },

  /** What happened. 'capability-ready' is the only kind today. */
  kind: { type: String, required: true },

  title: { type: String, required: true },
  body:  { type: String, default: '' },

  /** What the customer can do about it — "Connect WhatsApp Business". Absent
   *  when there is nothing to do and the notification is simply news. */
  actionLabel: { type: String, default: '' },
  actionHref:  { type: String, default: '' },

  /** What this is about, so the UI can link to it and a duplicate can be
   *  recognised. For a capability, the CapabilityRequest id. */
  subjectId: { type: String, default: '' },

  readAt: { type: Date, default: null },
}, { timestamps: true });

/** The list query: one customer's notifications, newest first. */
notificationSchema.index({ userId: 1, createdAt: -1 });

/** One notification per subject per kind. The announcement step is retried
 *  when it fails, and a retry must not leave the customer with the same news
 *  twice — so, as with capability decisions, uniqueness is enforced here
 *  rather than by remembering to look first. Sparse, because a notification
 *  with no subject is not covered by the rule. */
notificationSchema.index(
  { userId: 1, kind: 1, subjectId: 1 },
  { unique: true, partialFilterExpression: { subjectId: { $type: 'string', $ne: '' } } }
);

export default mongoose.model('Notification', notificationSchema);
