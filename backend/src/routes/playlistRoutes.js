import { Router } from 'express';
import {
  getPlaylists,
  createPlaylist,
  getPlaylistById,
  updatePlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  createPlaylistSchema,
  updatePlaylistSchema,
  addSongSchema
} from '../controllers/playlistController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, getPlaylists);
router.post('/', requireAuth, validateBody(createPlaylistSchema), createPlaylist);
router.get('/:id', optionalAuth, getPlaylistById);
router.put('/:id', requireAuth, validateBody(updatePlaylistSchema), updatePlaylist);
router.delete('/:id', requireAuth, deletePlaylist);
router.post('/:id/songs', requireAuth, validateBody(addSongSchema), addSongToPlaylist);
router.delete('/:id/songs/:songId', requireAuth, removeSongFromPlaylist);

export default router;
