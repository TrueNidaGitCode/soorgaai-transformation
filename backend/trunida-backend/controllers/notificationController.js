/**
 * Svarg — Notification Controller
 *
 * Thin on purpose: the rules live in notificationService, and every query here
 * is scoped by req.user._id so an id from elsewhere matches nothing.
 */

import {
  listNotifications, unreadCount, markRead, markAllRead, announcePending,
} from '../services/notificationService.js';

/** What the client is allowed to see. Never the raw document — subjectId and
 *  the internals of a capability request are ours, not the customer's. */
function publicView(n) {
  return {
    id:          String(n._id),
    kind:        n.kind,
    title:       n.title,
    body:        n.body || '',
    actionLabel: n.actionLabel || '',
    actionHref:  n.actionHref || '',
    blueprintId: n.blueprintId || '',
    read:        !!n.readAt,
    createdAt:   n.createdAt,
  };
}

export async function getNotifications(req, res) {
  try {
    // A build that finished but whose announcement failed to write would
    // otherwise never be mentioned. Sweeping here means opening the list is
    // enough to recover it. Awaited, because the point is to include it.
    await announcePending({ userId: req.user._id });

    const rows = await listNotifications({
      userId: req.user._id,
      limit: req.query.limit,
      unreadOnly: req.query.unread === 'true',
    });
    return res.json({ notifications: rows.map(publicView) });
  } catch (err) {
    console.error('[notifications] list failed:', err.message);
    return res.status(500).json({ error: 'Could not load your notifications.' });
  }
}

export async function getUnreadCount(req, res) {
  try {
    return res.json({ count: await unreadCount({ userId: req.user._id }) });
  } catch (err) {
    console.error('[notifications] count failed:', err.message);
    return res.status(500).json({ error: 'Could not load your notifications.' });
  }
}

export async function readOne(req, res) {
  try {
    const { updated } = await markRead({ userId: req.user._id, notificationId: req.params.id });
    return res.json({ updated });
  } catch (err) {
    console.error('[notifications] mark read failed:', err.message);
    return res.status(500).json({ error: 'Could not update that notification.' });
  }
}

export async function readAll(req, res) {
  try {
    return res.json(await markAllRead({ userId: req.user._id }));
  } catch (err) {
    console.error('[notifications] mark all read failed:', err.message);
    return res.status(500).json({ error: 'Could not update your notifications.' });
  }
}
