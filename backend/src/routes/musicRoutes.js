import { Router } from 'express';
import {
  getHomeFeed,
  searchMusic,
  getSongById,
  getAlbumById,
  getArtistById,
  proxyStream,
  getHealth
} from '../controllers/musicController.js';

import { songLimiter, resolveLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import { resolveSongsRoute, resolveSchema } from '../controllers/queueController.js';

const router = Router();

router.get('/home', getHomeFeed);
router.get('/search', searchMusic);
router.post('/songs/resolve', resolveLimiter, validateBody(resolveSchema), resolveSongsRoute);
router.get('/song/:id', songLimiter, getSongById);
router.get('/songs/:id', songLimiter, getSongById);
router.get('/albums/:id', getAlbumById);
router.get('/artists/:id', getArtistById);
router.get('/stream', proxyStream);
router.get('/health', getHealth);

export default router;
