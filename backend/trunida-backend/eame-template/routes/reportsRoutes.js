import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { reportsHandler } from '../controllers/reportsController.js';

const router = express.Router();

// Readable by anyone signed in. Reading what was found is not the owner's
// alone — see agentsRoutes for the argument, which is the same one.
router.get('/', protect, reportsHandler);

export default router;
