import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { compareGrounding } from '../controllers/debugController.js';

const router = express.Router();

router.post('/compare-grounding', protect, compareGrounding);

export default router;
