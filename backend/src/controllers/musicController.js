import { Readable, Transform } from 'stream';
import { pipeline } from 'stream';
import { config } from '../config/env.js';
import { checkStreamUrl, MAX_STREAM_BYTES, STREAM_TIMEOUT_MS } from '../services/streamGuard.js';
import { musicService } from '../services/music/providerManager.js';
import { videoLookup } from '../services/music/videoLookup.js';

const SONG_LIST_KEYS = [
  'trending', 'latest', 'gana', 'nineties', 'twoThousands',
  'melodies', 'love', 'sad', 'folk', 'instrumental'
];

// Adds videoId from curated map / cache only (no network). Never mutates the cached feed.
const withVideoIds = (data) => {
  const out = { ...data };
  for (const k of SONG_LIST_KEYS) {
    if (Array.isArray(out[k])) out[k] = videoLookup.attach(out[k]);
  }
  return out;
};

export const getHomeFeed = async (req, res, next) => {
  try {
    const data = withVideoIds(await musicService.getHomeFeed());
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

    const found = await musicService.search(query.trim(), type);
    const data = { ...found, songs: videoLookup.attach(found.songs) };
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
    if (!/^[\w.:-]{1,200}$/.test(id)) {
      return res.status(400).json({ success: false, message: 'Invalid song id' });
    }
    // fresh=1 bypasses the song cache (expired-stream recovery). It stays available to guests,
    // so abuse is limited by the stricter songLimiter on this route instead of auth.
    const fresh = req.query.fresh === '1' || req.query.fresh === 'true';
    const found = await musicService.getSong(id, { fresh });

    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Adds videoId when known (curated map / 24h cache / optional allow-listed API lookup)
    const song = await videoLookup.attachOne(found);
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

export const proxyStream = async (req, res) => {
  if (!config.enableExternalStreams) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: External stream proxy is disabled. Set ENABLE_EXTERNAL_STREAMS=true to enable.'
    });
  }

  const checked = checkStreamUrl(req.query.url);
  if (!checked.url) {
    return res.status(checked.status).json({ success: false, error: checked.error, message: checked.error });
  }
  const target = checked.url;

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
      return res.status(502).json({ success: false, error: 'Upstream redirect refused' });
    }

    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_STREAM_BYTES) {
      controller.abort();
      return res.status(413).json({
        success: false,
        error: `Payload Too Large: Audio stream exceeds limit of ${MAX_STREAM_BYTES} bytes.`
      });
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
    if (!res.headersSent) res.status(502).json({ success: false, error: 'Streaming proxy error' });
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
