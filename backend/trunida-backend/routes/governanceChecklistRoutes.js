import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { runChecklist } from '../controllers/governanceChecklistController.js';

const router = express.Router();

router.post('/run', protect, runChecklist);

export default router;
