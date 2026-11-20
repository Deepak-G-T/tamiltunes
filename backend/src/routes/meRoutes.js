import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { playEventLimiter, speedDialWriteLimiter, queueWriteLimiter } from '../middleware/rateLimiter.js';
import {
  getSpeedDial, postPlayEvent, pinSong, unpinSong, hideSong, putOrder, resetSpeedDial, importGuestPlays,
  playEventSchema, pinSchema, orderSchema, importSchema,
} from '../controllers/speedDialController.js';

import { getQueue, getQueueMeta, putQueue, deleteQueue, queueSchema } from '../controllers/queueController.js';
import { getWrapped } from '../controllers/wrappedController.js';
import { listBlocks, addBlock, removeBlock, blockSchema } from '../controllers/blocksController.js';

const router = Router();
router.use(requireAuth);

router.get('/queue/meta', getQueueMeta);
router.get('/queue', getQueue);
router.put('/queue', queueWriteLimiter, validateBody(queueSchema), putQueue);
router.delete('/queue', queueWriteLimiter, deleteQueue);

// "Don't recommend this": blocked songs (and their versions) never come back in a radio or a mix
router.get('/blocks', listBlocks);
router.post('/blocks', queueWriteLimiter, validateBody(blockSchema), addBlock);
router.delete('/blocks/:songId', queueWriteLimiter, removeBlock);

// TamilTunes Wrapped: this person's year in listening (read only, private to them)
router.get('/wrapped', getWrapped);

router.post('/play-events', playEventLimiter, validateBody(playEventSchema), postPlayEvent);

router.get('/speed-dial', getSpeedDial);
router.post('/speed-dial/pin', speedDialWriteLimiter, validateBody(pinSchema), pinSong);
router.put('/speed-dial/order', speedDialWriteLimiter, validateBody(orderSchema), putOrder);
router.post('/speed-dial/import', speedDialWriteLimiter, validateBody(importSchema), importGuestPlays);
router.delete('/speed-dial', speedDialWriteLimiter, resetSpeedDial); // restore automatic ranking
router.delete('/speed-dial/:songId/pin', speedDialWriteLimiter, unpinSong);
router.delete('/speed-dial/:songId', speedDialWriteLimiter, hideSong); // remove from Speed Dial

export default router;
