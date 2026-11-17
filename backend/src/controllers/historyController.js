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

    const history = await db.listeningHistory.findMany({
      where: { userId: req.user.id },
      include: { song: true },
      orderBy: { playedAt: 'desc' },
      take: limit,
      skip: offset
    });

    res.json({
      success: true,
      history,
      pagination: {
        limit,
        offset,
        count: history.length
      }
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
