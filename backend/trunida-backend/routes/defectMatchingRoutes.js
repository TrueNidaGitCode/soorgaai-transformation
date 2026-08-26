import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { match } from '../controllers/defectMatchingController.js';

const router = express.Router();

router.post('/match', protect, match);

export default router;
