import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { listCapabilities, fetchCapabilityBlueprint } from '../controllers/strategyCanvasController.js';

const router = express.Router();

router.get('/capabilities',            protect, listCapabilities);
router.get('/blueprint/:capabilityId', protect, fetchCapabilityBlueprint);

export default router;
