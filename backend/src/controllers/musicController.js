import { Readable } from 'stream';
import { musicService } from '../services/music/providerManager.js';

export const getHomeFeed = async (req, res, next) => {
  try {
    const data = await musicService.getHomeFeed();
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
};

export const searchMusic = async (req, res, next) => {
  try {
    const { query, type = 'all' } = req.query;

    if (!query || !query.trim()) {
      return res.json({
        success: true,
        data: { songs: [], albums: [], artists: [] }
      });
    }

    const data = await musicService.search(query.trim(), type);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
};

export const getSongById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const song = await musicService.getSong(id);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    res.json({
      success: true,
      data: song
    });
  } catch (err) {
    next(err);
  }
};

export const getAlbumById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const album = await musicService.getAlbum(id);

    if (!album) {
      return res.status(404).json({
        success: false,
        message: 'Album not found'
      });
    }

    res.json({
      success: true,
      album
    });
  } catch (err) {
    next(err);
  }
};

export const getArtistById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const artist = await musicService.getArtist(id);

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: 'Artist not found'
      });
    }

    res.json({
      success: true,
      artist
    });
  } catch (err) {
    next(err);
  }
};

export const proxyStream = async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url || !url.startsWith('http')) {
      return res.status(400).send('Invalid audio URL');
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (req.headers.range) {
      headers.range = req.headers.range;
    }

    const response = await fetch(url, { headers });
    res.status(response.status);

    for (const [key, val] of response.headers.entries()) {
      if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    }

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.warn('Streaming proxy error:', err.message);
    res.status(502).send('Streaming proxy error');
  }
};

export const getHealth = async (req, res, next) => {
  try {
    const health = await musicService.health();
    res.json({
      success: true,
      health
    });
  } catch (err) {
    next(err);
  }
};
