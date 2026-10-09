/**
 * Your app's events: mounted by server.js at /api/app-events.
 *
 * The business's own app calls these, so they carry no session: they carry
 * this application's ingest key instead. The setup lines are the owner's.
 * The extra paths match Segment's HTTP API, for an app already written
 * against it. See controllers/appEventsController.js.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireOwner } from '../controllers/dataController.js';
import { setup, receiver } from '../controllers/appEventsController.js';

const router = express.Router();

router.get('/setup', protect, requireOwner, setup);
router.post('/', receiver());
router.post('/batch', receiver());
router.post('/track', receiver('track'));
router.post('/identify', receiver('identify'));

export default router;
