/**
 * GET    /api/agents/findings     — everything open, worst first
 * GET    /api/agents/findings/:id — one finding, and the evidence behind it
 * GET    /api/agents             — what is watching, and how each one is doing
 * POST   /api/agents             — start watching something
 * PATCH  /api/agents/:id         — pause or resume one
 * DELETE /api/agents/:id         — stop watching, and forget what it found
 *
 * ── Who may do what, and why the line moved ────────────────────────────────
 *
 * Changing what is watched is the owner's: a watcher runs unattended and sends
 * mail in their name, so deciding what speaks and what stays quiet belongs to
 * the person whose application it is.
 *
 * READING what was found is not. It used to be owner-only along with the rest,
 * which meant the front desk — the people who would actually chase the parent
 * who stopped coming — could not see a single finding. A product whose promise
 * is "nothing important gets missed" cannot keep the findings from the person
 * who would act on them. So the two reads below take `protect` alone.
 *
 * Order matters: /findings is declared before /:id, or the id route swallows
 * it and "findings" becomes an agent id nobody can explain.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { ownerOnly } from '../controllers/accessController.js';
import { listAgentsHandler, createAgentHandler, patchAgentHandler, deleteAgentHandler, startFromCatalogueHandler, listFindingsHandler, getFindingHandler, draftFindingHandler, findingOpenedHandler, timezoneHandler } from '../controllers/agentsController.js';

const router = express.Router();

router.get   ('/findings',     protect, listFindingsHandler);
// Before /findings/:id, or ":id" matches the literal word "opened" and the
// telemetry call becomes a lookup for a finding that cannot exist.
router.post  ('/findings/opened',    protect, express.json({ limit: '2kb' }), findingOpenedHandler);
router.get   ('/findings/:id', protect, getFindingHandler);
// Writes a message; sends nothing. Anyone who can read a finding can draft
// the reply to it — deciding to send it is a person's, wherever they talk to
// that customer already.
router.post  ('/findings/:id/draft', protect, express.json({ limit: '4kb' }), draftFindingHandler);

// The owner's clock, learned when they first open the application. Owner
// only: a colleague abroad must not move the owner's morning briefing.
router.post  ('/timezone', protect, ownerOnly, express.json({ limit: '1kb' }), timezoneHandler);
router.get   ('/',    protect, ownerOnly, listAgentsHandler);
router.post  ('/',    protect, ownerOnly, express.json({ limit: '16kb' }), createAgentHandler);
// One tap on a catalogue card.
router.post  ('/start/:id', protect, ownerOnly, express.json({ limit: '4kb' }), startFromCatalogueHandler);
router.patch ('/:id', protect, ownerOnly, express.json({ limit: '8kb' }), patchAgentHandler);
router.delete('/:id', protect, ownerOnly, deleteAgentHandler);

export default router;
