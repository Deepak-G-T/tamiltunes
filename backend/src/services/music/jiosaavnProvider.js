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

    return {
      id: `saavn_${raw.id}`,
      title,
      artist,
      singers: artist,
      album,
      duration: duration > 0 ? duration : 210,
      image,
      year: raw.year || raw.more_info?.year || '2024',
      streamUrl: streamUrl || null,
      provider: 'jiosaavn',
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
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json'
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

    // 1. Primary: Fast autocomplete search with country code (cc=in) from cyberboysumanjay/JioSaavnAPI
    try {
      const autoData = await this._fetchDirect('autocomplete.get', {
        query: query,
        includeMetaTags: '1'
      });
      console.log(`[JioSaavn] autocomplete.get for "${query}": songs count = ${autoData?.songs?.data?.length || 0}`);

      if (autoData?.songs?.data && autoData.songs.data.length > 0) {
        const songItems = autoData.songs.data;
        const pids = songItems.map((s) => s.id).join(',');
        const detailsData = await this._fetchDirect('song.getDetails', { pids });

        if (detailsData) {
          const rawSongs = Array.isArray(detailsData.songs)
            ? detailsData.songs
            : Object.values(detailsData).filter((v) => v && typeof v === 'object' && v.id);

          const songs = [];
          for (const raw of rawSongs) {
            const formatted = this._formatSong(raw);
            if (formatted && formatted.streamUrl) {
              songs.push(formatted);
            }
          }

          if (songs.length > 0) {
            // Sort authentic Tamil tracks to top
            songs.sort((a, b) => {
              const aTamil = (a.title.toLowerCase().includes('tamil') || a.album.toLowerCase().includes('tamil') || (a.language && a.language.toLowerCase() === 'tamil')) ? 1 : 0;
              const bTamil = (b.title.toLowerCase().includes('tamil') || b.album.toLowerCase().includes('tamil') || (b.language && b.language.toLowerCase() === 'tamil')) ? 1 : 0;
              return bTamil - aTamil;
            });
            return songs.slice(0, limit);
          }
        }
      }
    } catch (err) {
      console.warn('JioSaavn autocomplete search fallback:', err.message);
    }

    // 2. Secondary: Query the cyberboysumanjay/JioSaavnAPI microservice if available
    try {
      const tamilQuery = qLower.includes('tamil') ? query : `${query} tamil`;
      const pyUrl = `${this.pythonServiceUrl}/song/?query=${encodeURIComponent(tamilQuery)}`;
      const pyController = new AbortController();
      const pyTimeout = setTimeout(() => pyController.abort(), 6000);
      const res = await fetch(pyUrl, { signal: pyController.signal });
      clearTimeout(pyTimeout);

      if (res.ok) {
        const songsJson = await res.json();
        if (Array.isArray(songsJson) && songsJson.length > 0) {
          const formatted = songsJson.map((s) => this._formatSong(s)).filter((s) => s && s.streamUrl);
          if (formatted.length > 0) {
            return formatted.slice(0, limit);
          }
        }
      }
    } catch (err) {
      // Python microservice silent fallback
    }

    // 3. Fallback: Direct Node.js search.getResults with DES decryption
    const tamilQuery = qLower.includes('tamil') ? query : `${query} tamil`;
    const data = await this._fetchDirect('search.getResults', {
      q: tamilQuery,
      p: '1',
      n: '30'
    });

    if (!data || !data.results) return [];

    // Prioritize authentic Tamil tracks
    const sorted = [...data.results].sort((a, b) => {
      const aIsTamil = (a.language?.toLowerCase() === 'tamil' || (a.album && a.album.toLowerCase().includes('tamil'))) ? 1 : 0;
      const bIsTamil = (b.language?.toLowerCase() === 'tamil' || (b.album && b.album.toLowerCase().includes('tamil'))) ? 1 : 0;
      return bIsTamil - aIsTamil;
    });

    return sorted.map((item) => this._formatSong(item)).filter((s) => s && s.streamUrl).slice(0, limit);
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

  async search(query, type = 'all') {
    const [songs, albums, artists] = await Promise.all([
      type === 'all' || type === 'songs' ? this.searchSongs(query, 15) : Promise.resolve([]),
      type === 'all' || type === 'albums' ? this.searchAlbums(query, 10) : Promise.resolve([]),
      type === 'all' || type === 'artists' ? this.searchArtists(query, 6) : Promise.resolve([])
    ]);

    return { songs, albums, artists };
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
