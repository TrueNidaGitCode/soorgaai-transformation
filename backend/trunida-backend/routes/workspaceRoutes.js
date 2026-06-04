import express                                      from 'express';
import { protect, optionalAuth }                   from '../middleware/authMiddleware.js';
import { getWorkspaceState, getDomainCatalog }     from '../controllers/workspaceController.js';

const router = express.Router();

router.get('/state',   protect,      getWorkspaceState);
router.get('/domains', optionalAuth,  getDomainCatalog);   // public — no auth required

export default router;
