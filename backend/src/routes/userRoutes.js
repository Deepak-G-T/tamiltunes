import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  getPublicProfile, getAvatar, getLiked, getPlaylistsTab, getHistoryTab, getCommentsTab,
  getFollowers, getFollowing, followUser, unfollowUser,
} from '../controllers/userController.js';

const router = Router();
router.get('/:username', optionalAuth, getPublicProfile);
router.get('/:username/avatar', getAvatar);
router.get('/:username/liked', optionalAuth, getLiked);
router.get('/:username/playlists', optionalAuth, getPlaylistsTab);
router.get('/:username/history', optionalAuth, getHistoryTab);
router.get('/:username/comments', optionalAuth, getCommentsTab);
router.get('/:username/followers', optionalAuth, getFollowers);
router.get('/:username/following', optionalAuth, getFollowing);
router.post('/:username/follow', requireAuth, followUser);
router.delete('/:username/follow', requireAuth, unfollowUser);
export default router;
