import express from 'express';
import {
  startGuestGeneration,
  getGuestBlueprint,
  streamGuestProgress,
} from '../controllers/guestController.js';
import { recordVisit } from '../controllers/visitController.js';
import { transcribeAudio, voiceStatus } from '../controllers/voiceController.js';
import { typicalGenerationTime } from '../services/generationTimeService.js';

/**
 * Audio arrives as base64 inside JSON, so this route needs a bigger body than
 * the 100kb default express.json is mounted with globally in server.js. Scoped
 * to the one route that needs it, exactly as uploadRoutes.js does — raising the
 * global limit would widen every endpoint to accommodate one.
 */
const audioBody = express.json({ limit: '9mb' });

const router = express.Router();

// Anonymous try-before-login flow — deliberately unauthenticated.
// Abuse protection lives in the controller (rate limit + unguessable guestId).
// Someone opened the site. Posted by the landing page once per session, so the
// board can tell "nobody came" from "everybody bounced" — two zeroes that look
// identical and call for opposite fixes.
router.post('/visit',                     recordVisit);

// Speaking the objective instead of typing it. Public for the same reason
// generation is: the first thing anyone does with Svarg needs no account.
router.get('/voice-status',               voiceStatus);
// How long a blueprint usually takes, so the Cob screen can say whether to
// watch or step away from the first second. Public: guests run Cob too, and
// the number is an average with nothing of anyone's in it.
router.get('/generation-time', async (req, res) => {
  res.json(await typicalGenerationTime());
});
router.post('/transcribe',                audioBody, transcribeAudio);
router.post('/generate-blueprint',        startGuestGeneration);
router.get('/blueprint/:guestId',         getGuestBlueprint);
router.get('/blueprint/:guestId/stream',  streamGuestProgress);

export default router;
