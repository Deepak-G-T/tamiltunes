import { z } from 'zod';
import { db } from '../prisma/client.js';
import { musicService } from '../services/music/providerManager.js';
import { getSignalsStore } from '../services/related/signalsStore.js';
import { getQueueStore } from '../services/queueState/store.js';
import { resolveSongs } from '../services/queueState/resolve.js';

export const MAX_UPCOMING = 500;
export const MAX_HISTORY = 50;
export const MAX_ITEMS = MAX_UPCOMING + MAX_HISTORY + 1; // upcoming + history + the current song

// Only ids and a few small settings are accepted. Titles, covers or stream URLs sent by a client are never stored or trusted.
const songId = z.string().min(1).max(128).regex(/^[\w.:\-~]+$/, 'bad song id');
export const queueSchema = z.object({
  items: z.array(z.object({ id: songId, o: z.enum(['u', 'r', 'c']) }).strict()).max(MAX_ITEMS),
  currentIndex: z.number().int().min(-1).max(MAX_ITEMS),
  positionSec: z.number().min(0).max(86400).transform((n) => Math.floor(n)),
  shuffle: z.boolean(),
  repeat: z.enum(['off', 'all', 'one']),
  autoplay: z.boolean(),
  mode: z.enum(['radio', 'context']),
  sourceLabel: z.string().max(120).nullish(),
  deviceId: z.string().min(1).max(64).regex(/^[\w\-]+$/).nullish(),
  // Old apps still send these (session memory, "allow repeats"): accepted and ignored. They are not rules any more (docs/NO_REPEAT.md).
  heard: z.array(z.object({ k: z.string().max(200), id: z.string().max(128).optional() }).strict()).max(600).optional(),
  allowRepeats: z.boolean().optional(),
}).strict().refine((q) => q.currentIndex < q.items.length, { message: 'currentIndex is outside the queue', path: ['currentIndex'] });

const songs = {
  byIds: (ids) => getSignalsStore().songsByIds(ids),
  fetchOne: (id) => musicService.getSong(id),
  save: (s) => db.song.upsert({
    where: { id: s.id },
    create: { id: s.id, title: s.title, artist: s.artist || s.singers || 'Tamil Artist', album: s.album ?? null, image: s.image ?? null, duration: s.duration || 210, streamUrl: s.streamUrl ?? null, isPlayable: true },
    update: {},
  }),
};

export const resolveMany = (ids) => resolveSongs(ids, songs);

const presentState = (row) => ({
  items: row.items,
  currentIndex: row.currentIndex,
  positionSec: row.positionSec,
  shuffle: row.shuffle,
  repeat: row.repeat,
  autoplay: row.autoplay,
  mode: row.mode,
  sourceLabel: row.sourceLabel ?? null,
  deviceId: row.deviceId ?? null,
  updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
});

/** GET /api/me/queue: the saved queue plus metadata for its songs, fetched fresh (nothing the client once sent is reused). */
export const getQueue = async (req, res, next) => {
  try {
    const row = await getQueueStore().get(req.user.id);
    if (!row) return res.json({ success: true, queue: null, songs: {} });
    res.json({ success: true, queue: presentState(row), songs: await resolveMany(row.items.map((i) => i.id)) });
  } catch (err) { next(err); }
};

/** GET /api/me/queue/meta: just enough to tell whether another device changed the queue (cheap: no song lookups). */
export const getQueueMeta = async (req, res, next) => {
  try {
    const row = await getQueueStore().get(req.user.id);
    if (!row) return res.json({ success: true, meta: null });
    const st = presentState(row);
    res.json({ success: true, meta: { updatedAt: st.updatedAt, deviceId: st.deviceId, count: st.items.length, currentId: st.items[st.currentIndex]?.id ?? null } });
  } catch (err) { next(err); }
};

/** PUT /api/me/queue: replace the saved queue (last write wins). */
export const putQueue = async (req, res, next) => {
  try {
    const q = req.body;
    const row = await getQueueStore().put(req.user.id, {
      items: q.items, currentIndex: q.currentIndex, positionSec: q.positionSec, shuffle: q.shuffle, repeat: q.repeat,
      autoplay: q.autoplay, mode: q.mode, sourceLabel: q.sourceLabel ?? null, deviceId: q.deviceId ?? null,
    });
    res.json({ success: true, updatedAt: presentState(row).updatedAt });
  } catch (err) { next(err); }
};

export const deleteQueue = async (req, res, next) => {
  try {
    await getQueueStore().remove(req.user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// Guests keep their queue in the browser; this only turns ids into songs (no account, no writes)
export const resolveSchema = z.object({ ids: z.array(songId).min(1).max(100) }).strict();
export const resolveSongsRoute = async (req, res, next) => {
  try {
    res.json({ success: true, songs: await resolveMany(req.body.ids) });
  } catch (err) { next(err); }
};

// "Save queue as playlist": the client sends song ids (nothing else); songs are looked up again here
export const fromQueueSchema = z.object({
  name: z.string().trim().min(1, 'Playlist name is required').max(100),
  songIds: z.array(songId).min(1).max(MAX_UPCOMING + 1),
}).strict();

export const saveQueueAsPlaylist = async (req, res, next) => {
  try {
    const ids = [...new Set(req.body.songIds)];
    const found = await resolveMany(ids);
    const ordered = ids.filter((id) => found[id]);
    if (!ordered.length) return res.status(422).json({ success: false, message: 'None of those songs are available any more.' });

    const playlist = await db.playlist.create({ data: { name: req.body.name, isPublic: false, userId: req.user.id } });
    const rows = ordered.map((songId, position) => ({ playlistId: playlist.id, songId, position }));
    if (typeof db.playlistSong.createMany === 'function') await db.playlistSong.createMany({ data: rows, skipDuplicates: true });
    else for (const data of rows) await db.playlistSong.create({ data });

    res.status(201).json({ success: true, playlist, added: ordered.length, skipped: ids.length - ordered.length });
  } catch (err) { next(err); }
};
