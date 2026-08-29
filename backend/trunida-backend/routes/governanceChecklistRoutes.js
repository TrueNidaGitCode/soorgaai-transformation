import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getChecklist } from '../controllers/governanceChecklistController.js';

const router = express.Router();

router.get('/', protect, getChecklist);

export default router;
