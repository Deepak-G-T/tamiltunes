import { z } from 'zod';
import { db } from '../prisma/client.js';

export const favoriteSchema = z.object({
  songId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  image: z.string().optional(),
  duration: z.number().optional(),
  streamUrl: z.string().optional()
});

export const getFavorites = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const favorites = await db.favorite.findMany({
      where: { userId: req.user.id },
      include: { song: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    res.json({
      success: true,
      favorites,
      pagination: {
        limit,
        offset,
        count: favorites.length
      }
    });
  } catch (err) {
    next(err);
  }
};

export const addFavorite = async (req, res, next) => {
  try {
    const { songId, title, artist, album, image, duration, streamUrl } = req.body;

    // Ensure song is in Song table
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

    // Check if already favorited
    const existing = await db.favorite.findUnique({
      where: {
        userId_songId: {
          userId: req.user.id,
          songId
        }
      }
    });

    if (existing) {
      return res.json({ success: true, favorite: existing });
    }

    const favorite = await db.favorite.create({
      data: {
        userId: req.user.id,
        songId
      }
    });

    res.status(201).json({
      success: true,
      favorite
    });
  } catch (err) {
    next(err);
  }
};

export const removeFavorite = async (req, res, next) => {
  try {
    const { songId } = req.params;

    await db.favorite.delete({
      where: {
        userId_songId: {
          userId: req.user.id,
          songId
        }
      }
    });

    res.json({
      success: true,
      message: 'Removed from favorites'
    });
  } catch (err) {
    next(err);
  }
};
