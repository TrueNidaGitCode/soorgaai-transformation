import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { publishProject, downloadProject } from '../controllers/deliveryController.js';

const router = express.Router();

router.post('/publish', protect, publishProject);
router.get('/download', protect, downloadProject);

export default router;
