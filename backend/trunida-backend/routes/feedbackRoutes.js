import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getFeedbackStatus, submitFeedback } from '../controllers/feedbackController.js';

const router = express.Router();

router.get('/',  protect, getFeedbackStatus);
router.post('/', protect, submitFeedback);

export default router;
