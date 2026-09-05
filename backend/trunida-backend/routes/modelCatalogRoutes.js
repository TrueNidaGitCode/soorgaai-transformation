import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  listCatalog,
  createCatalogEntry,
  patchCatalogEntry,
  deleteCatalogEntry,
  getSettings,
  saveSettings,
} from '../controllers/modelCatalogController.js';

const router = express.Router();

router.get('/settings', protect, getSettings);
router.post('/settings', protect, saveSettings);
router.get('/', protect, listCatalog);
router.post('/', protect, createCatalogEntry);
router.patch('/:modelId', protect, patchCatalogEntry);
router.delete('/:modelId', protect, deleteCatalogEntry);

export default router;
