import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { publishProject, downloadProject, projectManifest, integrateProduct, getIntegration } from '../controllers/deliveryController.js';

const router = express.Router();

router.post('/publish', protect, publishProject);
router.get('/download', protect, downloadProject);
router.get('/manifest', protect, projectManifest);

// Porting the built application into the customer's own codebase. A separate
// artefact from the standalone delivery above — see productIntegrationService.
router.post('/integrate/:blueprintId', protect, integrateProduct);
router.get('/integrate/:blueprintId',  protect, getIntegration);

export default router;
