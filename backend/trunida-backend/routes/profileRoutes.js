import express                                        from 'express';
import { protect }                                   from '../middleware/authMiddleware.js';
import { createProfile, getMyProfile, updateProfile } from '../controllers/profileController.js';

const router = express.Router();

router.post('/',   protect, createProfile);
router.get('/me',  protect, getMyProfile);
router.patch('/',  protect, updateProfile);

export default router;
