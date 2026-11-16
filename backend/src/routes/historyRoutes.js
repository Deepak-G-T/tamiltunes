import { Router } from 'express';
import {
  getHistory,
  recordHistory,
  clearHistory,
  historySchema
} from '../controllers/historyController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, getHistory);
router.post('/', requireAuth, validateBody(historySchema), recordHistory);
router.delete('/', requireAuth, clearHistory);

export default router;
