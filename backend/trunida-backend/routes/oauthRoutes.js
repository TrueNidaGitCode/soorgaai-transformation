import express from 'express';
import {
  initiateGoogle,
  googleCallback,
  initiateMicrosoft,
  microsoftCallback,
  tenantOtpRequest,
  tenantOtpVerify,
} from '../controllers/oauthController.js';

const router = express.Router();

// GET /api/auth/oauth/google           — redirects browser to Google consent screen
// GET /api/auth/oauth/google/callback  — Google posts back here with code
router.get('/google',           initiateGoogle);
router.get('/google/callback',  googleCallback);

// GET /api/auth/oauth/microsoft          — redirects browser to Microsoft consent screen
// GET /api/auth/oauth/microsoft/callback — Microsoft posts back here with code
router.get('/microsoft',          initiateMicrosoft);
router.get('/microsoft/callback', microsoftCallback);

// A delivered application's person signing in by email code. Called by the
// application's server with its tenant secret; see tenantAuthService.
router.post('/tenant/otp/request', express.json(), tenantOtpRequest);
router.post('/tenant/otp/verify',  express.json(), tenantOtpVerify);

export default router;
