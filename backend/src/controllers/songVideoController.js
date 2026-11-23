import { z } from 'zod';
import { musicService } from '../services/music/providerManager.js';
import { videoLookup } from '../services/music/videoLookup.js';
import { songVideos, VIDEO_ID_RE, REPORTS_TO_HIDE } from '../services/songVideos/service.js';
import { db } from '../prisma/client.js';

const SONG_ID_RE = /^[\w.:-]{1,200}$/;
const videoIdSchema = z.string().trim().regex(VIDEO_ID_RE, 'A YouTube video id is 11 letters, digits, - or _');
const reportSchema = z.object({ videoId: videoIdSchema, code: z.number().int().min(0).max(9999).optional() }).strict();
const setSchema = z.object({ videoId: videoIdSchema }).strict();
const pageOf = (q) => ({ limit: Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 100), offset: Math.max(parseInt(q.offset, 10) || 0, 0) });

/** The song as the server knows it (never trust the client's title / artist): the music provider first, then a saved row. */
async function knownSong(id) {
  if (!SONG_ID_RE.test(id)) return null;
  const fromProvider = await musicService.getSong(id).catch(() => null);
  if (fromProvider) return { ...fromProvider, id };
  const row = await db.song.findUnique({ where: { id } }).catch(() => null);
  return row ? { ...row, singers: Array.isArray(row.singers) ? row.singers.join(', ') : row.artist } : null;
}

/**
 * POST /api/songs/:id/video-report  { videoId, code }   (signed in, rate limited)
 * The player could not embed this song's video. A report only counts for the video the server actually offers for the song,
 * once per person; after REPORTS_TO_HIDE different people, the video is hidden for everyone until an admin restores it.
 */
export const reportVideo = async (req, res, next) => {
  try {
    const parsed = reportSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid report' });
    const song = await knownSong(req.params.id);
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' });
    const served = videoLookup.attach([song])[0]?.videoId || null;
    if (!served || served !== parsed.data.videoId) return res.status(409).json({ success: false, message: 'That is not the video offered for this song' });
    const result = await songVideos.report({ song, userId: req.user.id, videoId: parsed.data.videoId, code: parsed.data.code });
    return res.json({ success: true, ...result, needed: REPORTS_TO_HIDE });
  } catch (err) { return next(err); }
};

// ---- admin (role "admin"): the admin screens arrive with the admin panel (PR #31); these endpoints work on their own

/** GET /api/admin/videos/songs?missing=1&limit&offset: saved songs with the video they get now (`servedVideoId`) and where it comes from. */
export const listSongs = async (req, res, next) => {
  try {
    const { limit, offset } = pageOf(req.query);
    const rows = await songVideos.store.listSongs({ limit: req.query.missing ? 500 : limit, offset: req.query.missing ? 0 : offset });
    let items = rows.map((r) => {
      const served = videoLookup.peek({ ...r, id: r.songId }) || null;
      return { ...r, servedVideoId: served, source: r.videoId ? 'admin' : !r.videoAvailable ? 'hidden' : served ? 'automatic' : 'none' };
    });
    if (req.query.missing) items = items.filter((i) => !i.servedVideoId && i.videoAvailable).slice(offset, offset + limit);
    return res.json({ success: true, items });
  } catch (err) { return next(err); }
};

/** GET /api/admin/videos/flagged: songs whose video is hidden after reports, with the report count and the YouTube error codes. */
export const listFlagged = async (req, res, next) => {
  try { return res.json({ success: true, items: await songVideos.store.listFlagged(pageOf(req.query)) }); } catch (err) { return next(err); }
};

/** GET /api/admin/videos/check/:videoId: can it be embedded? (oEmbed; the Data API too when configured). Backend only. */
export const checkVideo = async (req, res, next) => {
  try {
    if (!VIDEO_ID_RE.test(req.params.videoId)) return res.status(400).json({ success: false, message: 'A YouTube video id is 11 letters, digits, - or _' });
    return res.json({ success: true, ...(await videoLookup.checkVideo(req.params.videoId)) });
  } catch (err) { return next(err); }
};

/** GET /api/admin/videos/:songId: what this song has now (chosen / hidden / automatic / none), for the admin screen. */
export const getVideo = async (req, res, next) => {
  try {
    if (!SONG_ID_RE.test(req.params.songId)) return res.status(400).json({ success: false, message: 'Invalid song id' });
    const song = await knownSong(req.params.songId);
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' });
    const row = await songVideos.store.getSong(song.id).catch(() => null);
    const served = videoLookup.peek({ ...song }) || null;
    const chosen = row?.videoId ?? null;
    const hidden = row ? row.videoAvailable === false : false;
    return res.json({ success: true, item: { songId: song.id, title: song.title, artist: song.artist, chosenVideoId: chosen, hidden, servedVideoId: served, source: chosen ? 'admin' : hidden ? 'hidden' : served ? 'automatic' : 'none' } });
  } catch (err) { return next(err); }
};

/** PUT /api/admin/videos/:songId { videoId }: choose the video for a song (clears its flag and reports). */
export const setVideo = async (req, res, next) => {
  try {
    const parsed = setSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid video id' });
    const song = await knownSong(req.params.songId);
    if (!song) return res.status(404).json({ success: false, message: 'Song not found' });
    return res.json({ success: true, item: await songVideos.setVideo(song, parsed.data.videoId) });
  } catch (err) { return next(err); }
};

/** DELETE /api/admin/videos/:songId: remove the chosen video (the automatic lookup decides again). */
export const clearVideo = async (req, res, next) => {
  try {
    if (!SONG_ID_RE.test(req.params.songId)) return res.status(400).json({ success: false, message: 'Invalid song id' });
    const item = await songVideos.clearVideo(req.params.songId);
    return item ? res.json({ success: true, item }) : res.status(404).json({ success: false, message: 'Song not found' });
  } catch (err) { return next(err); }
};

/** POST /api/admin/videos/:songId/restore: show the video again and forget the reports. */
export const restoreVideo = async (req, res, next) => {
  try {
    if (!SONG_ID_RE.test(req.params.songId)) return res.status(400).json({ success: false, message: 'Invalid song id' });
    const item = await songVideos.restore(req.params.songId);
    return item ? res.json({ success: true, item }) : res.status(404).json({ success: false, message: 'Song not found' });
  } catch (err) { return next(err); }
};
