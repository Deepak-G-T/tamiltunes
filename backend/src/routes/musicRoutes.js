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

import { optionalAuth } from '../middleware/auth.js';
import { songLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/home', getHomeFeed);
router.get('/search', searchMusic);
router.get('/song/:id', songLimiter, optionalAuth, getSongById);
router.get('/albums/:id', getAlbumById);
router.get('/artists/:id', getArtistById);
router.get('/stream', proxyStream);
router.get('/health', getHealth);

export default router;
