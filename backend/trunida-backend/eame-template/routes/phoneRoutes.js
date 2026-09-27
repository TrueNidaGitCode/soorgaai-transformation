/**
 * The phone system: mounted by server.js at /api/phone.
 *
 * The webhook is called by a telephony provider, so it carries no session and
 * no signature — most of these services do not sign. The secret is in the
 * address: a token derived from this application's own secret sits in the
 * path, and a POST without it is refused. See controllers/phoneController.js,
 * which says plainly what that is and is not worth.
 *
 * The setup line is the owner's, behind a session like every other.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireOwner } from '../controllers/dataController.js';
import { setup, receive } from '../controllers/phoneController.js';

const router = express.Router();

router.get('/setup', protect, requireOwner, setup);
/*
 * Form-encoded as well as JSON, because Twilio and Exotel both post
 * application/x-www-form-urlencoded and the shared JSON parser leaves their
 * body empty — which arrives here as a call with no fields rather than as an
 * error, and would read as a provider sending a shape we cannot parse.
 */
router.post('/webhook/:token', express.urlencoded({ extended: false, limit: '1mb' }), receive);

export default router;
