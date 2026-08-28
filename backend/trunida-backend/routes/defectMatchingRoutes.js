import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { match, previewModelSelection } from '../controllers/defectMatchingController.js';

const router = express.Router();

router.post('/match', protect, match);
router.get('/model-selection', protect, previewModelSelection);

export default router;
