import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getBlueprintForMyOrg,
  getBlueprintStatus,
  patchCapability,
} from '../controllers/enterpriseBlueprintController.js';

const router = express.Router();

// All routes require a valid JWT
router.get('/',                              protect, getBlueprintForMyOrg);
router.get('/status',                        protect, getBlueprintStatus);
router.patch('/capability/:capabilityId',    protect, patchCapability);

export default router;
