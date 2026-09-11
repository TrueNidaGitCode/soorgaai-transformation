/**
 * Svarg — /api/notifications
 *
 * Everything here is scoped to the caller. The list, the count and both mark-
 * read routes take the user from the JWT and never from the request, so an id
 * belonging to someone else matches nothing rather than reading or changing it.
 */

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getNotifications, getUnreadCount, readOne, readAll,
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/',              protect, getNotifications);
router.get('/unread-count',  protect, getUnreadCount);
router.patch('/read-all',    protect, readAll);   // before /:id, or "read-all" is an id
router.patch('/:id/read',    protect, readOne);

export default router;
