import { z } from 'zod';
import { db } from '../prisma/client.js';

export const createPlaylistSchema = z.object({
  name: z.string().min(1, 'Playlist name is required').max(100),
  description: z.string().optional()
});

export const updatePlaylistSchema = z.object({
  name: z.string().min(1, 'Playlist name is required').max(100),
  description: z.string().optional()
});

export const addSongSchema = z.object({
  songId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  album: z.string().optional(),
  image: z.string().optional(),
  duration: z.number().optional(),
  streamUrl: z.string().optional()
});

export const getPlaylists = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const playlists = await db.playlist.findMany({
      where: { userId: req.user.id },
      include: {
        songs: {
          include: { song: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });

    res.json({
      success: true,
      playlists,
      pagination: {
        limit,
        offset,
        count: playlists.length
      }
    });
  } catch (err) {
    next(err);
  }
};

export const createPlaylist = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const playlist = await db.playlist.create({
      data: {
        name,
        description,
        userId: req.user.id
      }
    });

    res.status(201).json({
      success: true,
      playlist
    });
  } catch (err) {
    next(err);
  }
};

export const getPlaylistById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const playlist = await db.playlist.findUnique({
      where: { id },
      include: {
        songs: {
          include: { song: true },
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    res.json({
      success: true,
      playlist
    });
  } catch (err) {
    next(err);
  }
};

export const updatePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const existing = await db.playlist.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }

    if (existing.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this playlist' });
    }

    const updated = await db.playlist.update({
      where: { id },
      data: { name, description }
    });

    res.json({
      success: true,
      playlist: updated
    });
  } catch (err) {
    next(err);
  }
};

export const deletePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await db.playlist.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }

    if (existing.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this playlist' });
    }

    await db.playlist.delete({ where: { id } });

    res.json({
      success: true,
      message: 'Playlist deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};

export const addSongToPlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { songId, title, artist, album, image, duration, streamUrl } = req.body;

    const playlist = await db.playlist.findUnique({ where: { id } });
    if (!playlist) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }

    if (playlist.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this playlist' });
    }

    // Ensure song is persisted in Song table
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

    // Add relation
    const item = await db.playlistSong.create({
      data: {
        playlistId: id,
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

export const removeSongFromPlaylist = async (req, res, next) => {
  try {
    const { id, songId } = req.params;

    const playlist = await db.playlist.findUnique({ where: { id } });
    if (!playlist) {
      return res.status(404).json({ success: false, message: 'Playlist not found' });
    }

    if (playlist.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to modify this playlist' });
    }

    await db.playlistSong.delete({
      where: {
        playlistId_songId: {
          playlistId: id,
          songId
        }
      }
    });

    res.json({
      success: true,
      message: 'Song removed from playlist'
    });
  } catch (err) {
    next(err);
  }
};
