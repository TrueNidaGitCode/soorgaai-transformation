/**
 * The Data page: mounted by server.js at /api/data.
 *
 * Everything that touches the owner's records is behind the owner session --
 * the public chat session is refused -- and the two routes without it only
 * say whether an owner key exists and exchange one for a session.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { ownerStatus, ownerSession, requireOwner, listDatasets, importDataset } from '../controllers/dataController.js';

const router = express.Router();

router.get('/owner-status', ownerStatus);
router.post('/owner-session', express.json(), ownerSession);

router.get('/datasets', protect, requireOwner, listDatasets);
// Fifty thousand rows of text is well under this; the limit is the ceiling
// on what one request may hold in memory, not a target.
router.post('/import', protect, requireOwner, express.json({ limit: '25mb' }), importDataset);

export default router;
