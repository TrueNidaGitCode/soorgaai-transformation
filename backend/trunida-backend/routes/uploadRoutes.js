import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  uploadDatasetFile,
  uploadFolder,
  classifyUploadedFiles,
  listDatasetFiles,
} from '../controllers/uploadController.js';

const router = express.Router();

/**
 * A file's text does not fit the 100 kb default express.json() applies to every
 * other route. The larger limit is scoped to this one router rather than raised
 * globally, so a single feature does not widen the body every endpoint on the
 * server will accept.
 */
const uploadBody = express.json({ limit: '2mb' });

router.post('/dataset-file', protect, uploadBody, uploadDatasetFile);
router.post('/folder', protect, uploadBody, uploadFolder);
router.post('/classify', protect, express.json(), classifyUploadedFiles);
router.get('/dataset-files/:blueprintId', protect, listDatasetFiles);

export default router;
