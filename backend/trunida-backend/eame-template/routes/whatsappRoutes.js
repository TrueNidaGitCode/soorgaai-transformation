/**
 * WhatsApp Business: mounted by server.js at /api/whatsapp.
 *
 * The webhook is called by Meta, so it carries no session: GET is Meta
 * checking the address with the verify token, POST is messages, signed
 * with the app secret when the owner gave one. The setup lines are the
 * owner's. See controllers/whatsappController.js.
 */
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { requireOwner } from '../controllers/dataController.js';
import { setup, verify, receive } from '../controllers/whatsappController.js';

const router = express.Router();

router.get('/setup', protect, requireOwner, setup);
router.get('/webhook', verify);
router.post('/webhook', receive);

export default router;
