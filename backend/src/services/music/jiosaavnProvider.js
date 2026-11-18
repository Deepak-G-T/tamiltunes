import CryptoJS from 'crypto-js';
import { MusicProvider } from './musicProvider.js';
import { config } from '../../config/env.js';

const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');
const LOCAL_PYTHON_JIOSAAVN_URL = 'http://127.0.0.1:5100';

// Decrypt JioSaavn media URLs following cyberboysumanjay/JioSaavnAPI implementation
export const decryptMediaUrl = (encryptedMediaUrl) => {
  if (!encryptedMediaUrl) return null;
  try {
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedMediaUrl.trim()) },
      DES_KEY,
      {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    const rawUrl = decrypted.toString(CryptoJS.enc.Utf8).trim();
    if (!rawUrl || !rawUrl.startsWith('http')) return null;

    // cyberboysumanjay upgrade to 320kbps high fidelity stream
    return rawUrl.replace(/_96\.mp4$/, '_320.mp4').replace(/_160\.mp4$/, '_320.mp4');
  } catch (err) {
    return null;
  }
};

// Simple HTML entity decoder
const decodeHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '©');
};

const sanitizeImage = (url) => {
  if (!url) return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
  return url.replace(/150x150\.jpg/, '500x500.jpg').replace(/50x50\.jpg/, '500x500.jpg');
};

export class JioSaavnProvider extends MusicProvider {
  constructor() {
    super('jiosaavn');
    this.pythonServiceUrl = LOCAL_PYTHON_JIOSAAVN_URL;
    this.baseUrl = config.jiosaavnApiUrl;
    this.cache = new Map();
    this.cacheTimeoutMs = 15 * 60 * 1000; // 15 mins cache
  }

  _formatSong(raw) {
    if (!raw) return null;
    const title = decodeHtml(raw.song || raw.title || raw.name);
    const album = decodeHtml(raw.album || raw.more_info?.album || 'Tamil Single');

    // Extract genuine artists / singers / composers
    const primaryArtists = Array.isArray(raw.more_info?.artistMap?.primary_artists)
      ? raw.more_info.artistMap.primary_artists.map((a) => a.name).join(', ')
      : null;
    const allArtists = Array.isArray(raw.more_info?.artistMap?.artists)
      ? raw.more_info.artistMap.artists
          .filter((a) => ['singer', 'primary_artists', 'music'].includes(a.role))
          .map((a) => a.name)
          .join(', ')
      : null;

    const artist = decodeHtml(
      raw.primary_artists ||
      raw.singers ||
      primaryArtists ||
      allArtists ||
      raw.subtitle ||
      raw.music ||
      raw.more_info?.music ||
      'Tamil Artist'
    );

    const duration = parseInt(raw.duration || raw.more_info?.duration || 0, 10);
    const image = sanitizeImage(raw.image || raw.more_info?.image);

    // Stream URL: direct media_url (from cyberboysumanjay service) OR decrypted from encrypted_media_url
    let streamUrl = raw.media_url || null;
    if (!streamUrl) {
      const encUrl = raw.encrypted_media_url || raw.more_info?.encrypted_media_url;
      streamUrl = decryptMediaUrl(encUrl);
    }
    if (!streamUrl && raw.media_preview_url) {
      streamUrl = raw.media_preview_url;
    }

    // Music director (composer) when the provider tells us, for related-song ranking
    const composerFromMap = Array.isArray(raw.more_info?.artistMap?.artists)
      ? raw.more_info.artistMap.artists.filter((a) => a.role === 'music').map((a) => a.name).join(', ')
      : '';
    const composer = decodeHtml(composerFromMap || raw.music || raw.more_info?.music || '') || null;
    const playCount = parseInt(raw.play_count || raw.more_info?.play_count || 0, 10) || 0;

    return {
      id: `saavn_${raw.id}`,
      title,
      artist,
      singers: artist,
      composer,
      playCount,
      album,
      duration: duration > 0 ? duration : 210,
      ...(duration > 0 ? {} : { durationEstimated: true }), // 210 is a guess: identity checks treat it as unknown
      ...(raw.isrc || raw.more_info?.isrc ? { isrc: String(raw.isrc || raw.more_info.isrc) } : {}),
      image,
      year: raw.year || raw.more_info?.year || '2024',
      streamUrl: streamUrl || null,
      language: raw.language || raw.more_info?.language || 'tamil',
      provider: 'jiosaavn',
      source: 'audio',
      isPlayable: !!streamUrl,
      licenseNotice: 'High-Quality Tamil Audio Stream (cyberboysumanjay/JioSaavnAPI)'
    };
  }

  async _fetchDirect(callName, params = {}) {
    const searchParams = new URLSearchParams({
      __call: callName,
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'web6dot0',
      cc: 'in', // Force India geo-availability for complete Tamil catalogue
      ...params
    });

    const url = `${this.baseUrl}?${searchParams.toString()}`;
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeoutMs) {
      return cached.data;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
          'X-Forwarded-For': '103.208.71.1',
          'Client-IP': '103.208.71.1'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`JioSaavn direct provider HTTP error: ${res.status}`);
        return null;
      }

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        try {
          const cleaned = text.replace(/^[^{]*(\{.*\})[^}]*$/, '$1');
          data = JSON.parse(cleaned);
        } catch (e2) {
          console.warn(`[JioSaavn] JSON parse failed for [${callName}], status: ${res.status}, snippet: ${text.slice(0, 150)}`);
          return null;
        }
      }

      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (err) {
      console.warn(`JioSaavn direct fetch error [${callName}]:`, err.message);
      return null;
    }
  }

  async searchSongs(query, limit = 20) {
    const qLower = query.toLowerCase().trim();
    const tamilQuery = qLower.includes('tamil') ? query : `${query} tamil`;

    // 1. Concurrently run direct search and autocomplete
    const [directRes, tamilRes, autoData] = await Promise.all([
      this._fetchDirect('search.getResults', { q: query, p: '1', n: '20' }),
      this._fetchDirect('search.getResults', { q: tamilQuery, p: '1', n: '20' }),
      this._fetchDirect('autocomplete.get', { query: query, includeMetaTags: '1' }).catch(() => null)
    ]);

    const candidateIdList = [];
    const seenIds = new Set();

    const trackId = (id) => {
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      candidateIdList.push(id);
    };

    // Collect IDs from direct search & tamil query
    for (const r of (directRes?.results || [])) trackId(r.id);
    for (const r of (tamilRes?.results || [])) trackId(r.id);
    for (const s of (autoData?.songs?.data || [])) trackId(s.id);

    // Fetch full song details with encrypted_media_url for all candidate IDs in batch
    let rawSongs = [];
    if (candidateIdList.length > 0) {
      const pidsChunk = candidateIdList.slice(0, 30).join(',');
      const detailsData = await this._fetchDirect('song.getDetails', { pids: pidsChunk });
      if (detailsData) {
        if (Array.isArray(detailsData.songs)) {
          rawSongs = detailsData.songs;
        } else {
          rawSongs = Object.values(detailsData).filter((v) => v && typeof v === 'object' && v.id);
        }
      }
    }

    // Format all candidate tracks and filter valid playable streams
    let formatted = rawSongs
      .map((c) => this._formatSong(c))
      .filter((s) => s && s.streamUrl);

    // Drop non-Tamil language tracks (Telugu, Hindi, etc.) unless query specifically targets them
    if (!qLower.includes('telugu') && !qLower.includes('hindi')) {
      formatted = formatted.filter((s) => {
        const lang = (s.language || '').toLowerCase();
        const titleLower = (s.title || '').toLowerCase();
        if (lang === 'telugu' || lang === 'hindi' || lang === 'kannada' || lang === 'malayalam') return false;
        if (titleLower.includes('[telugu]') || titleLower.includes('[hindi]') || titleLower.includes('[kannada]')) return false;
        return true;
      });
    }

    // Prioritize authentic Tamil tracks
    formatted.sort((a, b) => {
      const aTamil = (
        (a.language && a.language.toLowerCase() === 'tamil') ||
        a.title.toLowerCase().includes('tamil') ||
        a.album.toLowerCase().includes('tamil')
      ) ? 1 : 0;
      const bTamil = (
        (b.language && b.language.toLowerCase() === 'tamil') ||
        b.title.toLowerCase().includes('tamil') ||
        b.album.toLowerCase().includes('tamil')
      ) ? 1 : 0;
      return bTamil - aTamil;
    });

    if (formatted.length > 0) {
      return formatted.slice(0, limit);
    }

    // 2. Microservice fallback if needed
    try {
      const pyUrl = `${this.pythonServiceUrl}/song/?query=${encodeURIComponent(tamilQuery)}`;
      const pyController = new AbortController();
      const pyTimeout = setTimeout(() => pyController.abort(), 6000);
      const res = await fetch(pyUrl, { signal: pyController.signal });
      clearTimeout(pyTimeout);

      if (res.ok) {
        const songsJson = await res.json();
        if (Array.isArray(songsJson) && songsJson.length > 0) {
          const pyFormatted = songsJson.map((s) => this._formatSong(s)).filter((s) => s && s.streamUrl);
          if (pyFormatted.length > 0) {
            return pyFormatted.slice(0, limit);
          }
        }
      }
    } catch (err) {}

    return [];
  }

  async searchAlbums(query, limit = 20) {
    const qLower = query.toLowerCase();
    const tamilQuery = qLower.includes('tamil') ? query : `${query} tamil`;
    const data = await this._fetchDirect('search.getAlbumResults', {
      q: tamilQuery,
      p: '1',
      n: limit.toString()
    });

    if (!data || !data.results) return [];
    return data.results.map((a) => ({
      id: `album_${a.id}`,
      name: decodeHtml(a.title || a.name || a.album),
      title: decodeHtml(a.title || a.name || a.album),
      artist: decodeHtml(a.music || a.primary_artists || a.artist || 'Various Artists'),
      year: a.year || '2024',
      image: sanitizeImage(a.image)
    }));
  }

  async searchArtists(query, limit = 20) {
    const data = await this._fetchDirect('search.getArtistResults', {
      q: query,
      p: '1',
      n: limit.toString()
    });

    if (!data || !data.results) return [];
    return data.results.map((art) => ({
      id: `artist_${art.id || encodeURIComponent(art.name)}`,
      name: decodeHtml(art.name),
      role: 'Tamil Artist & Composer',
      image: sanitizeImage(art.image)
    }));
  }

  async searchTracks(query, options = {}) {
    return this.search(query, options.type || 'all');
  }

  async search(query, type = 'all') {
    const [songs, albums, artists] = await Promise.all([
      type === 'all' || type === 'songs' ? this.searchSongs(query, 15) : Promise.resolve([]),
      type === 'all' || type === 'albums' ? this.searchAlbums(query, 10) : Promise.resolve([]),
      type === 'all' || type === 'artists' ? this.searchArtists(query, 6) : Promise.resolve([])
    ]);

    return { songs, albums, artists };
  }

  async getSong(id) {
    return this.getSongById(id);
  }

  /**
   * Provider-side recommendations (JioSaavn `reco.getreco`), used as candidates for the radio.
   * UNTESTED against the live API: it can only be checked from a network that reaches JioSaavn.
   */
  async getRecommendations(id, limit = 30) {
    const pid = String(id).replace(/^saavn_/, '');
    if (!pid) return [];
    const data = await this._fetchDirect('reco.getreco', { pid, language: 'tamil' });
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.songs) ? data.songs : [];
    return list.map((raw) => this._formatSong(raw)).filter(Boolean).slice(0, limit);
  }

  async getSongById(id) {
    const cleanId = id.replace(/^saavn_/, '');
    // Try Python microservice first
    try {
      const res = await fetch(`${this.pythonServiceUrl}/song/get/?id=${cleanId}`);
      if (res.ok) {
        const raw = await res.json();
        if (raw && !raw.error) return this._formatSong(raw);
      }
    } catch (e) {}

    // Direct fallback
    const rawData = await this._fetchDirect('song.getDetails', { pids: cleanId });
    if (rawData) {
      if (Array.isArray(rawData.songs) && rawData.songs.length > 0) {
        return this._formatSong(rawData.songs[0]);
      }
      if (rawData[cleanId]) {
        return this._formatSong(rawData[cleanId]);
      }
    }
    return null;
  }

  async getAlbum(id) {
    const rawId = id.replace(/^album_/, '');
    const data = await this._fetchDirect('content.getAlbumDetails', { albumid: rawId });

    if (!data) return null;

    const songs = (data.songs || data.list || []).map((s) => this._formatSong(s)).filter(Boolean);
    return {
      id: `album_${data.id || rawId}`,
      name: decodeHtml(data.name || data.title),
      title: decodeHtml(data.name || data.title),
      artist: decodeHtml(data.primary_artists || data.music || 'Various Artists'),
      year: data.year || '2024',
      image: sanitizeImage(data.image),
      songs
    };
  }

  async getArtist(id) {
    const rawId = id.replace(/^artist_/, '');
    const data = await this._fetchDirect('artist.getArtistPageDetails', { artistId: rawId });

    if (!data) return null;

    const topSongs = (data.topSongs?.songs || data.topSongs || [])
      .slice(0, 15)
      .map((s) => this._formatSong(s))
      .filter(Boolean);

    const albums = (data.topAlbums?.albums || data.topAlbums || [])
      .slice(0, 8)
      .map((a) => ({
        id: `album_${a.id}`,
        name: decodeHtml(a.title || a.name),
        title: decodeHtml(a.title || a.name),
        artist: decodeHtml(data.name),
        image: sanitizeImage(a.image)
      }));

    return {
      id: `artist_${data.artistId || rawId}`,
      name: decodeHtml(data.name),
      role: 'Tamil Artist',
      image: sanitizeImage(data.image),
      topSongs,
      albums
    };
  }

  async healthCheck() {
    try {
      let pyStatus = 'offline';
      try {
        const pyRes = await fetch(`${this.pythonServiceUrl}/song/?query=Vikram%20Tamil`);
        if (pyRes.ok) pyStatus = 'online';
      } catch (e) {}

      return {
        status: 'healthy',
        provider: this.name,
        pythonService: pyStatus,
        decryption: 'cyberboysumanjay_DES_ECB_active',
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      return { status: 'degraded', provider: this.name, error: e.message };
    }
  }
}
