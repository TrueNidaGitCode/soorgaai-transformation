import express                                                        from 'express';
import { protect }                                                   from '../middleware/authMiddleware.js';
import { sendMessage, getHistory, getCanvas, getSuggestedPrompts }   from '../controllers/chatController.js';

const router = express.Router({ mergeParams: true });   // exposes :domainId from parent mount

router.post(  '/:domainId/message',          protect, sendMessage);
router.get(   '/:domainId/history',          protect, getHistory);
router.get(   '/:domainId/canvas',           protect, getCanvas);
router.get(   '/:domainId/suggested-prompts', protect, getSuggestedPrompts);

export default router;
