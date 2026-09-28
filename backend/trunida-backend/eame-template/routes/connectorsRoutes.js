/**
 * Connectors: mounted by server.js at /api/connectors.
 *
 * Every route is the owner's. The public chat session is refused before any
 * handler runs, so nothing here can be reached from the chat.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireOwner } from '../controllers/dataController.js';
import { list, create, update, test, sync, remove } from '../controllers/connectorController.js';
import { zohoStatus, zohoStart, zohoFinish } from '../controllers/zohoConnectController.js';

const router = express.Router();

router.use(protect, requireOwner);

router.get('/', list);
router.post('/', express.json(), create);

/*
 * Zoho in one click. Declared before /:id, or "zoho" becomes a connector id
 * nobody can explain — the same ordering trap the findings routes carry a
 * comment about.
 */
router.get ('/zoho/status', zohoStatus);
router.post('/zoho/start',  express.json(), zohoStart);
router.post('/zoho/finish', express.json(), zohoFinish);
router.patch('/:id', express.json(), update);
router.post('/:id/test', test);
router.post('/:id/sync', sync);
router.delete('/:id', remove);

export default router;
