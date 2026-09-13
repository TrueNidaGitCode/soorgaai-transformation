/**
 * Sign-in: mounted by server.js at /api/auth.
 *
 * Three doors without a session -- what is offered, the way out to Google
 * through Svarg, and the way back -- and one behind it, saying who the
 * session is. See controllers/authController.js.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { providers, google, callback, me, otpRequest, otpVerify } from '../controllers/authController.js';

const router = express.Router();

router.get('/providers', providers);
router.get('/google', google);
router.get('/callback', callback);
router.post('/otp/request', express.json(), otpRequest);
router.post('/otp/verify', express.json(), otpVerify);
router.get('/me', protect, me);

export default router;
