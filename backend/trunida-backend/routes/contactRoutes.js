import express from 'express';
import { submitContactForm } from '../controllers/contactController.js';

const router = express.Router();

// Public marketing-site contact form — deliberately unauthenticated.
// Abuse protection lives in the controller (per-IP rate limit).
router.post('/', submitContactForm);

export default router;
