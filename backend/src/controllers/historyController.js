import { clusterSongs } from '../services/related/identity.js';
import { z } from 'zod';
import { db } from '../prisma/client.js';

export const historySchema = z.object({
  songId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  image: z.string().optional(),
  duration: z.number().optional(),
  streamUrl: z.string().optional()
});

export const getHistory = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const [total, history] = await Promise.all([
      db.listeningHistory.count({ where: { userId: req.user.id } }),
      db.listeningHistory.findMany({
        where: { userId: req.user.id },
        include: { song: true },
        orderBy: { playedAt: 'desc' },
        take: limit,
        skip: offset
      })
    ]);

    const hasMore = offset + history.length < total;

    // Every row says which song it really is: copies of one song (another id, spelling or album) share a canonicalId,
    // so "already played" rules can treat them as one. The log itself is not collapsed (every play stays).
    const forId = history.map((h) => h.song).filter(Boolean).map((x) => ({ ...x, singers: (x.singers || []).join(', ') || x.artist }));
    const canon = clusterSongs(forId).canonicalOf;
    for (const h of history) if (h.song) h.song = { ...h.song, canonicalId: h.song.canonicalId || canon.get(h.song.id) || h.song.id };

    res.json({
      success: true,
      items: history,
      history,
      total,
      limit,
      offset,
      hasMore
    });
  } catch (err) {
    next(err);
  }
};

export const recordHistory = async (req, res, next) => {
  try {
    const { songId, title, artist, album, image, duration, streamUrl } = req.body;

    // Ensure song exists in db
    await db.song.upsert({
      where: { id: songId },
      create: {
        id: songId,
        title,
        artist: artist || 'Tamil Artist',
        album,
        image,
        duration: duration || 210,
        streamUrl,
        isPlayable: true
      },
      update: {
        title,
        artist: artist || 'Tamil Artist',
        album,
        image
      }
    });

    const item = await db.listeningHistory.create({
      data: {
        userId: req.user.id,
        songId
      }
    });

    res.status(201).json({
      success: true,
      item
    });
  } catch (err) {
    next(err);
  }
};

export const clearHistory = async (req, res, next) => {
  try {
    await db.listeningHistory.deleteMany({
      where: { userId: req.user.id }
    });

    res.json({
      success: true,
      message: 'Listening history cleared'
    });
  } catch (err) {
    next(err);
  }
};
