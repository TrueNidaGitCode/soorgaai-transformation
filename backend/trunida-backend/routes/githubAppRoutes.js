import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  initiateAppInstall,
  githubAppCallback,
  getAppStatus,
  listRepos,
  analyzeRepository,
  disconnectApp,
} from '../controllers/githubAppController.js';

const router = express.Router();

router.get('/connect', protect, initiateAppInstall);
router.get('/callback', githubAppCallback); // public — GitHub redirects the browser here
router.get('/status', protect, getAppStatus);
router.get('/repos', protect, listRepos);
// Reads a repository and writes the profile onto the blueprint. The POST is
// ours — it changes our own record and touches nothing on GitHub.
router.post('/analyze', protect, analyzeRepository);
router.post('/disconnect', protect, disconnectApp);

export default router;
