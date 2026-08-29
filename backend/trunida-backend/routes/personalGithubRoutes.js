import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  initiatePersonalConnect,
  personalGithubCallback,
  getPersonalStatus,
  disconnectPersonal,
  pushProject,
} from '../controllers/personalGithubController.js';

const router = express.Router();

router.get('/connect', protect, initiatePersonalConnect);
router.get('/callback', personalGithubCallback); // public — GitHub calls this directly
router.get('/status', protect, getPersonalStatus);
router.post('/disconnect', protect, disconnectPersonal);
router.post('/push-project', protect, pushProject);

export default router;
