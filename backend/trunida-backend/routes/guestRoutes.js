import express from 'express';
import {
  startGuestGeneration,
  getGuestBlueprint,
  streamGuestProgress,
} from '../controllers/guestController.js';

const router = express.Router();

// Anonymous try-before-login flow — deliberately unauthenticated.
// Abuse protection lives in the controller (rate limit + unguessable guestId).
router.post('/generate-blueprint',        startGuestGeneration);
router.get('/blueprint/:guestId',         getGuestBlueprint);
router.get('/blueprint/:guestId/stream',  streamGuestProgress);

export default router;
