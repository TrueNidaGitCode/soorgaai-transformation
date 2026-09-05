import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  listCatalog,
  createCatalogEntry,
  patchCatalogEntry,
  deleteCatalogEntry,
} from '../controllers/modelCatalogController.js';

const router = express.Router();

router.get('/', protect, listCatalog);
router.post('/', protect, createCatalogEntry);
router.patch('/:modelId', protect, patchCatalogEntry);
router.delete('/:modelId', protect, deleteCatalogEntry);

export default router;
