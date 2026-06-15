import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { get, generate, approve, clear } from '../controllers/companyContextController.js';

const router = express.Router();

router.get('/',          protect, get);
router.post('/generate', protect, generate);
router.post('/approve',  protect, approve);
router.delete('/',       protect, clear);

export default router;
