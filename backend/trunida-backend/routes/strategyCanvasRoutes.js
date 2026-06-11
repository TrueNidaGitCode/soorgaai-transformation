import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { listCapabilities, fetchCapabilityBlueprint, suggestSection } from '../controllers/strategyCanvasController.js';
import { ask } from '../controllers/advisorController.js';

const router = express.Router();

router.get('/capabilities',            protect, listCapabilities);
router.get('/blueprint/:capabilityId', protect, fetchCapabilityBlueprint);
router.post('/advisor/ask',            protect, ask);
router.post('/blueprint-suggest',      protect, suggestSection);

export default router;
