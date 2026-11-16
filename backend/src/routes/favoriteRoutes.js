import { Router } from 'express';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  favoriteSchema
} from '../controllers/favoriteController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, getFavorites);
router.post('/', requireAuth, validateBody(favoriteSchema), addFavorite);
router.delete('/:songId', requireAuth, removeFavorite);

export default router;
