/**
 * Svarg — telling the customer about work they did not watch happen
 *
 * ── Announcing is separate from building on purpose ───────────────────────
 *
 * A build that succeeded and a customer who was told are different facts. If
 * announcing were part of the build, a notification that failed to write would
 * either lose the news or fail a build that actually worked. Kept apart, an
 * announcement can be retried on its own, and CapabilityRequest.notifiedAt is
 * the record of which ones still need it.
 */

import Notification from '../models/Notification.js';
import CapabilityRequest from '../models/CapabilityRequest.js';

/** Longest body we will write. The plan's summary is model-written. */
const MAX_BODY = 1000;

/**
 * The words the customer reads.
 *
 * Deliberately plain, and about their business rather than ours: they never
 * asked for software, so "your WhatsApp communication is ready" is the whole
 * story and "Eame regenerated the authored tree" is not. When the capability
 * needs something connected, say that in the same breath — a feature that
 * silently does nothing until credentials appear is worse than no feature.
 */
export function capabilityMessage(request) {
  const title = String(request?.plan?.title || 'A new capability').trim();
  const summary = String(request?.plan?.summary || '').trim();
  const connectors = (request?.plan?.connectorsNeeded || []).filter(Boolean);

  // 'ready' means built and verified, not running. Delivery pushes the code
  // and names the commit a redeploy rebuilds, and that step is not automatic
  // yet — so this says what is true rather than what the customer would most
  // like to hear. A notification that says a thing is live when it is not is
  // worse than one that asks for a click, because the customer goes looking
  // for a feature that is not there and concludes the product is broken.
  const body = [summary]
    .concat(connectors.length
      ? [`Connect ${connectors.join(' and ')}, then publish it to start using it.`]
      : ['Publish it to your application to start using it.'])
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_BODY);

  return {
    title: `${title} is ready`,
    body,
    actionLabel: connectors.length ? `Connect ${connectors[0]}` : 'Publish it',
  };
}

/**
 * Announce a capability that is ready.
 *
 * Idempotent twice over: the unique index refuses a second notification for
 * the same request, and notifiedAt is only stamped once the notification
 * exists. Returns a report; never throws, because every caller is a background
 * pass behind work that already succeeded.
 */
export async function announceCapability({ requestId }) {
  if (!requestId) return { announced: false, reason: 'missing-id' };

  try {
    const request = await CapabilityRequest.findById(requestId).lean();
    if (!request) return { announced: false, reason: 'no-request' };
    if (request.status !== 'ready') return { announced: false, reason: 'not-ready' };
    if (request.notifiedAt) return { announced: false, reason: 'already-announced' };

    const { title, body, actionLabel } = capabilityMessage(request);

    try {
      await Notification.create({
        userId: request.userId,
        blueprintId: request.blueprintId,
        kind: 'capability-ready',
        subjectId: String(request._id),
        title,
        body,
        actionLabel,
        // Yusu is where an application is published, which is the step this
        // is asking for. Eame only shows what was written.
        actionHref: '/domain/domain.html?view=yusu',
      });
    } catch (err) {
      // Already announced by a pass that raced this one. The stamp below still
      // needs to happen — that is what stops us trying again forever.
      if (err?.code !== 11000) throw err;
    }

    await CapabilityRequest.updateOne({ _id: requestId }, { $set: { notifiedAt: new Date() } });
    return { announced: true, reason: 'ok', title };

  } catch (err) {
    console.error('[notify] could not announce capability:', err.message);
    return { announced: false, reason: 'error', error: err.message };
  }
}

/**
 * Anything built but never announced.
 *
 * Exists because announcing is a separate step that can fail: without a way to
 * find these, a notification lost to a momentary database error would be lost
 * for good, and the customer would have a capability nobody ever mentioned.
 */
export async function announcePending({ userId, blueprintId }) {
  try {
    const pending = await CapabilityRequest
      .find({ ...(userId ? { userId } : {}), ...(blueprintId ? { blueprintId } : {}), status: 'ready', notifiedAt: null })
      .select('_id').lean();

    const results = [];
    for (const r of pending) results.push(await announceCapability({ requestId: r._id }));
    return { announced: results.filter(r => r.announced).length, considered: pending.length };
  } catch (err) {
    console.error('[notify] could not sweep pending announcements:', err.message);
    return { announced: 0, considered: 0, error: err.message };
  }
}

/** One customer's notifications, newest first. */
export async function listNotifications({ userId, limit = 30, unreadOnly = false }) {
  return Notification
    .find({ userId, ...(unreadOnly ? { readAt: null } : {}) })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 30, 100))
    .lean();
}

export async function unreadCount({ userId }) {
  return Notification.countDocuments({ userId, readAt: null });
}

/** Scoped by userId as well as id, so an id from elsewhere marks nothing. */
export async function markRead({ userId, notificationId }) {
  if (!userId || !notificationId) return { updated: 0 };
  const res = await Notification.updateOne(
    { _id: notificationId, userId, readAt: null },
    { $set: { readAt: new Date() } }
  );
  return { updated: res?.modifiedCount || 0 };
}

export async function markAllRead({ userId }) {
  const res = await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
  return { updated: res?.modifiedCount || 0 };
}
