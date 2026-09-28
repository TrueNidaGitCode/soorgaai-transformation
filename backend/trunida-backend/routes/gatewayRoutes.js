/**
 * Svarg — LLM Gateway routes
 *
 * Mounted at /api/gateway/v1 so a hosted application can point an OpenAI SDK
 * straight at it. No `protect` here on purpose: these are authenticated by a
 * per-deployment token inside the controller, not by a user session.
 */

import express from 'express';
import { chatCompletions, embeddings, transcriptions, signals, notify, ops, opsCatalogue } from '../controllers/gatewayController.js';
import { zohoStatus, zohoStart, zohoClaim, zohoToken } from '../controllers/gatewayZohoController.js';

const router = express.Router();

router.post('/chat/completions', chatCompletions);
router.post('/embeddings',       embeddings);
/*
 * A recorded call, base64 in a JSON body.
 *
 * The limit is the one place on this surface where the default is nowhere
 * near enough: base64 is a third larger than the bytes it carries, so the
 * 24MB recording transcribeService allows arrives as about 32MB of body. A
 * limit that quietly refused every call over a minute would look like a
 * broken connector rather than a configured ceiling.
 */
router.post('/audio/transcriptions', express.json({ limit: '36mb' }), transcriptions);
// What a live application reports about itself. Small JSON; the default
// body limit is plenty and anything larger is not a batch of signals.
router.post('/signals',          express.json({ limit: '256kb' }), signals);
// An application telling its own owner something. The recipient is resolved
// from the token, never sent by the caller.
router.post('/notify',           express.json({ limit: '64kb' }), notify);
// Svarg's own operations, for the one tenant Svarg runs itself on. Refused for
// every other deployment by a flag no API can set.
/*
 * Zoho, brokered.
 *
 * start opens a consent and hands back a URL for the browser; claim collects
 * the refresh token once the customer has consented; token mints an access
 * token, because a container holding only a refresh token cannot — the client
 * secret is Svarg's and stays here. Small JSON, all three.
 */
router.get ('/oauth/zoho/status', zohoStatus);
router.post('/oauth/zoho/start', express.json({ limit: '8kb' }), zohoStart);
router.post('/oauth/zoho/claim', express.json({ limit: '8kb' }), zohoClaim);
router.post('/oauth/zoho/token', express.json({ limit: '8kb' }), zohoToken);
router.get ('/ops',              opsCatalogue);
router.get ('/ops/:dataset',     ops);

export default router;
