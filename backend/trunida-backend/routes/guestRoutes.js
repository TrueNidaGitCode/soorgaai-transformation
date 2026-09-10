import express from 'express';
import {
  startGuestGeneration,
  getGuestBlueprint,
  streamGuestProgress,
} from '../controllers/guestController.js';
import { recordVisit } from '../controllers/visitController.js';

const router = express.Router();

// Anonymous try-before-login flow — deliberately unauthenticated.
// Abuse protection lives in the controller (rate limit + unguessable guestId).
// Someone opened the site. Posted by the landing page once per session, so the
// board can tell "nobody came" from "everybody bounced" — two zeroes that look
// identical and call for opposite fixes.
router.post('/visit',                     recordVisit);
router.post('/generate-blueprint',        startGuestGeneration);
router.get('/blueprint/:guestId',         getGuestBlueprint);
router.get('/blueprint/:guestId/stream',  streamGuestProgress);

export default router;
