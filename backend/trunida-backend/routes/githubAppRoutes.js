import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  initiateAppInstall,
  githubAppCallback,
  getAppStatus,
  listRepos,
  disconnectApp,
} from '../controllers/githubAppController.js';

const router = express.Router();

router.get('/connect', protect, initiateAppInstall);
router.get('/callback', githubAppCallback); // public — GitHub redirects the browser here
router.get('/status', protect, getAppStatus);
router.get('/repos', protect, listRepos);
router.post('/disconnect', protect, disconnectApp);

export default router;
