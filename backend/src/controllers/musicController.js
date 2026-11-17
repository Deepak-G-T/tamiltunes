import { Readable, Transform } from 'stream';
import { pipeline } from 'stream';
import { config } from '../config/env.js';
import { validateStreamUrl, MAX_STREAM_BYTES, STREAM_TIMEOUT_MS } from '../services/streamGuard.js';
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

export const proxyStream = async (req, res) => {
  if (!config.enableExternalStreams) {
    return res.status(403).json({ success: false, message: 'External stream proxy is disabled' });
  }

  const target = validateStreamUrl(req.query.url);
  if (!target) {
    return res.status(400).json({ success: false, message: 'Stream URL not allowed' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  res.on('close', () => controller.abort());

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range)) {
      headers.range = req.headers.range;
    }

    // redirect: 'manual' so an allowed host cannot bounce us to an internal address
    const response = await fetch(target, { headers, redirect: 'manual', signal: controller.signal });
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      return res.status(502).json({ success: false, message: 'Upstream redirect refused' });
    }

    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_STREAM_BYTES) {
      controller.abort();
      return res.status(413).json({ success: false, message: 'Stream too large' });
    }

    res.status(response.status);
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const val = response.headers.get(key);
      if (val) res.setHeader(key, val);
    }

    if (!response.body) return res.end();

    // Count bytes as they stream and cut the connection at the cap
    let sent = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        sent += chunk.length;
        if (sent > MAX_STREAM_BYTES) {
          controller.abort();
          return cb(new Error('Stream byte cap exceeded'));
        }
        cb(null, chunk);
      }
    });
    pipeline(Readable.fromWeb(response.body), counter, res, (err) => {
      if (err && !res.headersSent) res.status(502).end();
      else if (err) res.destroy();
    });
  } catch (err) {
    clearTimeout(timer);
    console.warn('Streaming proxy error:', err.name === 'AbortError' ? 'aborted/timeout' : err.message);
    if (!res.headersSent) res.status(502).json({ success: false, message: 'Streaming proxy error' });
    else res.destroy();
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
