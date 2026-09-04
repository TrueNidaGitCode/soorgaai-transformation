import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  linkWebsite, listLinkedWebsite, unlinkWebsitePage,
  linkCompanyWebsite, getCompanyWebsite,
} from '../controllers/websiteController.js';

const router = express.Router();

// Company-level: captured at profile setup, before any blueprint exists.
router.post('/company',                           protect, linkCompanyWebsite);
router.get('/company',                            protect, getCompanyWebsite);

// Blueprint-scoped: a site relevant to one particular project.
router.post('/link',                              protect, linkWebsite);
router.get('/linked/:blueprintId',                protect, listLinkedWebsite);
router.delete('/linked/:blueprintId/:docId',      protect, unlinkWebsitePage);

export default router;
