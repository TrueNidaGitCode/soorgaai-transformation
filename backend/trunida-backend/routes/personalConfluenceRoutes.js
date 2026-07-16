import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  initiatePersonalConnect,
  personalConfluenceCallback,
  getPersonalSpaces,
  getPersonalSpacePages,
  linkDocumentsToBlueprint,
  getLinkedDocuments,
  getPersonalStatus,
  disconnectPersonal,
} from '../controllers/personalConfluenceController.js';

const router = express.Router();

// Any authenticated user — no CTO/Admin gate, unlike routes/confluenceRoutes.js
router.get('/connect', protect, initiatePersonalConnect);
router.get('/callback', personalConfluenceCallback);

router.get('/spaces', protect, getPersonalSpaces);
router.get('/spaces/:spaceKey/pages', protect, getPersonalSpacePages);
router.post('/link', protect, linkDocumentsToBlueprint);
router.get('/linked/:blueprintId', protect, getLinkedDocuments);
router.get('/status', protect, getPersonalStatus);
router.post('/disconnect', protect, disconnectPersonal);

export default router;
