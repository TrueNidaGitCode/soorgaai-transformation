/**
 * Public outreach routes — no authentication, deliberately.
 *
 * The unsubscribe link is clicked by someone who is not a Svarg user and never
 * will be. Putting it behind a login would make it decorative, which is the
 * one thing an unsubscribe link must not be.
 */

import express from 'express';
import { unsubscribe } from '../controllers/salesSignalsController.js';

const router = express.Router();

router.get('/unsubscribe', unsubscribe);

export default router;
