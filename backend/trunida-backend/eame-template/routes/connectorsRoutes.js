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

const router = express.Router();

router.use(protect, requireOwner);

router.get('/', list);
router.post('/', express.json(), create);
router.patch('/:id', express.json(), update);
router.post('/:id/test', test);
router.post('/:id/sync', sync);
router.delete('/:id', remove);

export default router;
