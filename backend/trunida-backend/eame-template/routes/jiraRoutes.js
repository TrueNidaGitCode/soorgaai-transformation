import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  connect, callback, status, disconnect,
  getProjects, getProjectIssues, linkIssues, getLinked,
} from '../controllers/jiraController.js';

const router = express.Router();

router.get('/connect', protect, connect);
router.get('/callback', callback); // public — Atlassian calls this directly
router.get('/status', protect, status);
router.post('/disconnect', protect, disconnect);

router.get('/projects', protect, getProjects);
router.get('/projects/:projectKey/issues', protect, getProjectIssues);
router.post('/link', protect, linkIssues);
router.get('/linked', protect, getLinked);

export default router;
