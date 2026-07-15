import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  initiateConfluenceConnect,
  confluenceCallback,
  getSpaces,
  getSpacePages,
  extract,
  getStatus,
  disconnect,
} from '../controllers/confluenceController.js';

const router = express.Router();

// OAuth — protect() on connect (must know who's connecting); callback is
// reached directly by Atlassian's redirect and authenticates via the signed state instead.
router.get('/connect', protect, initiateConfluenceConnect);
router.get('/callback', confluenceCallback);

router.get('/spaces', protect, getSpaces);
router.get('/spaces/:spaceKey/pages', protect, getSpacePages);
router.post('/extract', protect, extract);
router.get('/status', protect, getStatus);
router.post('/disconnect', protect, disconnect);

export default router;
