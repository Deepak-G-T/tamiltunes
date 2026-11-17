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

const router = Router();

router.get('/home', getHomeFeed);
router.get('/search', searchMusic);
router.get('/song/:id', getSongById);
router.get('/songs/:id', getSongById);
router.get('/albums/:id', getAlbumById);
router.get('/artists/:id', getArtistById);
router.get('/stream', proxyStream);
router.get('/health', getHealth);

export default router;
