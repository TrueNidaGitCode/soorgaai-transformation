import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { compareGrounding, getUserBlueprints } from '../controllers/debugController.js';

const router = express.Router();

router.post('/compare-grounding', protect, compareGrounding);
router.get('/user-blueprints', protect, getUserBlueprints);

export default router;
