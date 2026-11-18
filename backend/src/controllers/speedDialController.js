import { z } from 'zod';
import { db } from '../prisma/client.js';
import { musicService } from '../services/music/providerManager.js';
import { videoLookup } from '../services/music/videoLookup.js';
import { getSignalsStore } from '../services/related/signalsStore.js';
import { getSpeedDialStore } from '../services/speedDial/store.js';
import { createSpeedDialService } from '../services/speedDial/speedDialService.js';
import { SPEED_DIAL } from '../services/speedDial/config.js';

// Resolved on every call: the store follows the live database connection (Prisma vs in-memory)
const store = new Proxy({}, { get: (_, prop) => (...a) => getSpeedDialStore()[prop](...a) });

const songs = {
  byIds: (ids) => getSignalsStore().songsByIds(ids),
  upsert: (s) =>
    db.song.upsert({
      where: { id: s.id },
      create: { id: s.id, title: s.title, artist: s.artist || s.singers || 'Tamil Artist', album: s.album ?? null, image: s.image ?? null, duration: s.duration || 210, streamUrl: s.streamUrl ?? null, isPlayable: true },
      update: { title: s.title, artist: s.artist || s.singers || 'Tamil Artist', album: s.album ?? null, image: s.image ?? null },
    }),
};

const service = createSpeedDialService({ store, songs, manager: musicService });

const text = (max) => z.string().max(max);
const songMeta = z.object({
  title: text(300).min(1),
  artist: text(300).optional(),
  album: text(300).nullish(),
  image: text(800).nullish(),
  duration: z.number().int().min(0).max(86400).optional(),
  streamUrl: text(2000).nullish(),
});

export const playEventSchema = songMeta.extend({
  songId: text(100).min(1),
  listenedSec: z.number().int().min(0).max(86400),
  durationSec: z.number().int().min(0).max(86400).optional(),
  completed: z.boolean().optional(),
  skippedAtSec: z.number().int().min(0).max(86400).optional(),
  playId: text(64).min(8).optional(),
  source: z.enum(['search', 'radio', 'playlist', 'album', 'queue', 'speed-dial', 'home']).optional(),
});
export const pinSchema = z.object({ songId: text(100).min(1), slot: z.number().int().min(0).max(SPEED_DIAL.slots - 1).optional(), song: songMeta.optional() });
export const orderSchema = z.object({ order: z.array(text(100)).min(1).max(SPEED_DIAL.slots), moved: text(100).optional() });
export const importSchema = z.object({
  plays: z.array(z.object({
    song: songMeta.extend({ id: text(100).min(1) }),
    count: z.number().int().min(1).max(1000),
    lastAt: z.string().datetime(),
  })).min(1).max(SPEED_DIAL.importMaxSongs),
});

const fail = (res, e) => (e.statusCode ? res.status(e.statusCode).json({ success: false, message: e.message }) : null);
const present = (items) => videoLookup.attach(items).map((s, i) => ({ ...s, rank: items[i].rank, playCount: items[i].playCount, pinned: items[i].pinned, source: items[i].source, hot: items[i].hot }));

export const getSpeedDial = async (req, res, next) => {
  try {
    const { items, cached } = await service.get(req.user.id);
    res.json({ success: true, items: present(items), meta: { slots: SPEED_DIAL.slots, cached, hasPlayed: items.some((i) => i.source === 'played' && i.playCount > 0) } });
  } catch (err) { next(err); }
};

export const postPlayEvent = async (req, res, next) => {
  try {
    const b = req.body;
    const out = await service.recordEvent(req.user.id, {
      songId: b.songId, listenedSec: b.listenedSec, durationSec: b.durationSec ?? b.duration ?? 0, completed: b.completed, skippedAtSec: b.skippedAtSec,
      playId: b.playId, source: b.source,
      song: { id: b.songId, title: b.title, artist: b.artist, album: b.album, image: b.image, duration: b.duration, streamUrl: b.streamUrl },
    });
    res.status(out.recorded ? 201 : 202).json({ success: true, ...out });
  } catch (err) { next(err); }
};

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (!fail(res, err)) next(err);
  }
};

export const pinSong = wrap(async (req, res) => {
  await service.pin(req.user.id, req.body);
  res.json({ success: true });
});
export const unpinSong = wrap(async (req, res) => {
  await service.unpin(req.user.id, req.params.songId);
  res.json({ success: true });
});
export const hideSong = wrap(async (req, res) => {
  await service.hide(req.user.id, req.params.songId);
  res.json({ success: true });
});
export const putOrder = wrap(async (req, res) => {
  const pinned = await service.setOrder(req.user.id, req.body.order, req.body.moved ?? null);
  res.json({ success: true, pinned });
});
export const resetSpeedDial = wrap(async (req, res) => {
  await service.reset(req.user.id);
  res.json({ success: true });
});
export const importGuestPlays = wrap(async (req, res) => {
  const events = await service.importGuest(req.user.id, req.body.plays);
  res.status(201).json({ success: true, events });
});
