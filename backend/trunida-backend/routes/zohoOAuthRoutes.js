/**
 * Svarg — Zoho consent, in and out.
 *
 * GET /api/oauth/zoho/authorize?state=…  — sends the browser to Zoho
 * GET /api/oauth/zoho/callback           — Zoho returns here with a code
 *
 * No `protect`: neither is reached with a Svarg session. What authorises them
 * is the handoff behind `state`, which was opened over a deployment's gateway
 * token and is unguessable. The callback address is registered with Zoho as
 * this client's redirect URI, so it must not move without re-registering it —
 * the same string that broke the Atlassian connectors when a domain changed.
 */
import express from 'express';
import { zohoAuthorize, zohoCallback } from '../controllers/zohoOAuthController.js';

const router = express.Router();

router.get('/authorize', zohoAuthorize);
router.get('/callback', zohoCallback);

export default router;
