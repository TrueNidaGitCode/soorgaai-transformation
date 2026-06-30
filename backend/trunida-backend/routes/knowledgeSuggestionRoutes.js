import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { list, getOne, saveBatch, approve, reject } from '../controllers/knowledgeSuggestionController.js';

const router = express.Router();

// List + batch-save must come before :id routes to avoid ambiguity
router.get( '/',           protect, list);
router.post('/batch',      protect, saveBatch);
router.get( '/:id',        protect, getOne);
router.post('/:id/approve', protect, approve);
router.post('/:id/reject',  protect, reject);

export default router;
