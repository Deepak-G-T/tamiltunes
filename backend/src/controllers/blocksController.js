import { z } from 'zod';
import { getBlocksStore } from '../services/noRepeat/blocksStore.js';
import { NO_REPEAT } from '../services/noRepeat/config.js';
import { resolveMany } from './queueController.js';

const songId = z.string().min(1).max(128).regex(/^[\w.:\-~]+$/, 'bad song id');
// Only an id is accepted: the title, artist and cover are looked up again here (a client's own text is never stored)
export const blockSchema = z.object({ songId }).strict();

export const listBlocks = async (req, res, next) => {
  try { res.json({ success: true, items: await getBlocksStore().list(req.user.id) }); } catch (err) { next(err); }
};

/** POST /api/me/blocks { songId }: "Don't recommend this". Blocks the song and every version of it. */
export const addBlock = async (req, res, next) => {
  try {
    const store = getBlocksStore();
    if ((await store.count(req.user.id)) >= NO_REPEAT.maxBlocks) return res.status(422).json({ success: false, message: 'You have blocked as many songs as allowed. Unblock some in Settings first.' });
    const found = (await resolveMany([req.body.songId]))[req.body.songId];
    if (!found) return res.status(404).json({ success: false, message: 'That song is not available.' });
    res.status(201).json({ success: true, item: await store.add(req.user.id, found) });
  } catch (err) { next(err); }
};

export const removeBlock = async (req, res, next) => {
  try {
    const ok = await getBlocksStore().remove(req.user.id, req.params.songId);
    res.status(ok ? 200 : 404).json({ success: ok, ...(ok ? {} : { message: 'That song is not blocked.' }) });
  } catch (err) { next(err); }
};
