import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { list, update } from '../controllers/actionItemController.js';

const router = express.Router();

router.get('/:blueprintId',          protect, list);
router.patch('/:blueprintId/:itemId', protect, update);

export default router;
