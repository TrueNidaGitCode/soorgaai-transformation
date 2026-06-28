import express from 'express';
import {
  initiateGoogle,
  googleCallback,
  initiateMicrosoft,
  microsoftCallback,
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

export default router;
