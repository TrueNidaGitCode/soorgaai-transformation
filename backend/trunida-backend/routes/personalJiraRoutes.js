import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getPersonalProjects,
  getPersonalProjectIssues,
  linkIssuesToDefectRecords,
  getLinkedIssues,
} from '../controllers/personalJiraController.js';

const router = express.Router();

// No connect/callback here — reuses the PersonalConfluenceConnection
// established by /api/confluence/personal/connect (see personalJiraController.js).
router.get( '/projects',                    protect, getPersonalProjects);
router.get( '/projects/:projectKey/issues', protect, getPersonalProjectIssues);
router.post('/link',                         protect, linkIssuesToDefectRecords);
router.get( '/linked',                       protect, getLinkedIssues);

export default router;
