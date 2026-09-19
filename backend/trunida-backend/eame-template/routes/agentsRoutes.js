/**
 * GET    /api/agents        — what is watching, and how each one is doing
 * POST   /api/agents        — start watching something
 * PATCH  /api/agents/:id    — pause or resume one
 * DELETE /api/agents/:id    — stop watching, and forget what it found
 *
 * Owner only, all of it. A colleague with a session can use the application
 * and read its answers; an agent runs unattended and sends mail to the owner,
 * so deciding what watches and what stays quiet belongs to the person whose
 * application it is.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { ownerOnly } from '../controllers/accessController.js';
import { listAgentsHandler, createAgentHandler, patchAgentHandler, deleteAgentHandler, startFromCatalogueHandler } from '../controllers/agentsController.js';

const router = express.Router();

router.get   ('/',    protect, ownerOnly, listAgentsHandler);
router.post  ('/',    protect, ownerOnly, express.json({ limit: '16kb' }), createAgentHandler);
// One tap on a catalogue card.
router.post  ('/start/:id', protect, ownerOnly, express.json({ limit: '4kb' }), startFromCatalogueHandler);
router.patch ('/:id', protect, ownerOnly, express.json({ limit: '8kb' }), patchAgentHandler);
router.delete('/:id', protect, ownerOnly, deleteAgentHandler);

export default router;
