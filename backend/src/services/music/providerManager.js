import { JioSaavnProvider } from './jiosaavnProvider.js';
import { LocalAudioProvider, CURATED_TAMIL_SONGS, CURATED_ALBUMS, CURATED_ARTISTS } from './localAudioProvider.js';

export class MusicProviderManager {
  constructor() {
    this.jiosaavn = new JioSaavnProvider();
    this.curated = new LocalAudioProvider();
    this.homeCache = null;
    this.homeCacheTime = 0;
  }

  async search(query, type = 'all') {
    let result = { songs: [], albums: [], artists: [] };
    const q = (query || '').toLowerCase().trim();

    // 1. Search JioSaavn live Tamil catalog using cyberboysumanjay API
    try {
      const liveData = await this.jiosaavn.search(query, type);
      if (liveData) {
        result.songs = (liveData.songs || []).filter((s) => s.streamUrl);
        result.albums = liveData.albums || [];
        result.artists = liveData.artists || [];
      }
    } catch (err) {
      console.warn('JioSaavn search query error:', err.message);
    }

    // 2. Augment with curated authentic Tamil tracks if matched
    const curatedMatches = CURATED_TAMIL_SONGS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q))
    );

    const existingTitles = new Set(result.songs.map((s) => s.title.toLowerCase()));
    for (const s of curatedMatches) {
      if (!existingTitles.has(s.title.toLowerCase())) {
        result.songs.unshift(s);
        existingTitles.add(s.title.toLowerCase());
      }
    }

    // Curated albums match
    if (type === 'all' || type === 'albums') {
      const matchedAlbums = CURATED_ALBUMS.filter(
        (a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
      );
      for (const a of matchedAlbums) {
        if (!result.albums.some((al) => al.name.toLowerCase() === a.name.toLowerCase())) {
          result.albums.unshift(a);
        }
      }
    }

    // Curated artists match
    if (type === 'all' || type === 'artists') {
      const matchedArtists = CURATED_ARTISTS.filter((a) => a.name.toLowerCase().includes(q));
      for (const a of matchedArtists) {
        if (!result.artists.some((ar) => ar.name.toLowerCase() === a.name.toLowerCase())) {
          result.artists.unshift(a);
        }
      }
    }

    return result;
  }

  async getAlbum(id) {
    // Check curated albums first
    const curatedMatch = CURATED_ALBUMS.find((a) => a.id === id);
    if (curatedMatch) return curatedMatch;

    try {
      const album = await this.jiosaavn.getAlbum(id);
      if (album) return album;
    } catch (err) {
      console.warn('JioSaavn getAlbum error:', err.message);
    }

    return null;
  }

  async getArtist(id) {
    // Check curated artists first
    const curatedMatch = CURATED_ARTISTS.find((a) => a.id === id);
    if (curatedMatch) return curatedMatch;

    try {
      const artist = await this.jiosaavn.getArtist(id);
      if (artist && artist.topSongs?.length > 0) {
        return artist;
      }
    } catch (err) {
      console.warn('JioSaavn getArtist error:', err.message);
    }

    return null;
  }

  async getHomeFeed() {
    // Cache home feed for 10 minutes to minimize repetitive network roundtrips
    if (this.homeCache && Date.now() - this.homeCacheTime < 10 * 60 * 1000) {
      return this.homeCache;
    }

    // Base curated authentic tracks
    const trendingCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === 'trending');
    const ninetiesCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === '90s');
    const twoThousandsCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === '2000s');
    const melodiesCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === 'melodies');
    const folkCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === 'folk');

    // Fetch live categories from JioSaavn in parallel using top Kollywood terms
    const [
      liveTrending,
      liveLatest,
      live90s,
      live2000s,
      liveMelodies,
      liveLove,
      liveSad,
      liveFolk,
      liveInstrumental
    ] = await Promise.all([
      this.jiosaavn.searchSongs('tamil trending blockbusters anirudh', 8).catch(() => []),
      this.jiosaavn.searchSongs('latest tamil songs 2024 anirudh', 8).catch(() => []),
      this.jiosaavn.searchSongs('ar rahman 90s hits tamil', 8).catch(() => []),
      this.jiosaavn.searchSongs('harris jayaraj hits tamil', 8).catch(() => []),
      this.jiosaavn.searchSongs('tamil evergreen melodies', 8).catch(() => []),
      this.jiosaavn.searchSongs('tamil romantic love songs', 8).catch(() => []),
      this.jiosaavn.searchSongs('tamil sad breakup melodies', 8).catch(() => []),
      this.jiosaavn.searchSongs('kollywood kuthu celebration', 8).catch(() => []),
      this.jiosaavn.searchSongs('tamil instrumental violin flute', 8).catch(() => [])
    ]);

    // Filter out low-effort / amateur / local gaana tracks
    const JUNK_PATTERNS = [
      /gana\s+(velu|surya|suriya|muthu|mani|stephen|vinoth|bala|lokesh|suresh)/i,
      /trending\s+gana/i,
      /dj\s+remix/i,
      /bass\s+boosted/i,
      /whatsapp\s+status/i,
      /cover\s+song/i
    ];

    const isHighQuality = (song) => {
      if (!song) return false;
      const combined = `${song.title || ''} ${song.artist || ''} ${song.album || ''} ${song.singers || ''}`;
      return !JUNK_PATTERNS.some((pat) => pat.test(combined));
    };

    // Combine curated with live results, eliminating duplicates
    const mergeUnique = (curated, live) => {
      const titles = new Set();
      const result = [];
      for (const s of [...curated, ...live]) {
        if (!s || !s.title || !s.streamUrl || !isHighQuality(s)) continue;
        const norm = s.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!titles.has(norm)) {
          titles.add(norm);
          result.push(s);
        }
      }
      return result;
    };

    const feed = {
      trending: mergeUnique(trendingCurated, liveTrending),
      latest: liveLatest.length > 0 ? mergeUnique([], liveLatest) : trendingCurated,
      nineties: mergeUnique(ninetiesCurated, live90s),
      twoThousands: mergeUnique(twoThousandsCurated, live2000s),
      melodies: mergeUnique(melodiesCurated, liveMelodies),
      love: liveLove.length > 0 ? mergeUnique([], liveLove) : melodiesCurated,
      sad: liveSad.length > 0 ? mergeUnique([], liveSad) : ninetiesCurated,
      folk: mergeUnique(folkCurated, liveFolk),
      instrumental: liveInstrumental.length > 0 ? liveInstrumental : ninetiesCurated,
      popularAlbums: CURATED_ALBUMS,
      popularArtists: CURATED_ARTISTS
    };

    this.homeCache = feed;
    this.homeCacheTime = Date.now();
    return feed;
  }

  async health() {
    const jioHealth = await this.jiosaavn.healthCheck();
    return {
      status: 'operational',
      musicProvider: 'cyberboysumanjay/JioSaavnAPI',
      streamingEngine: 'aac.saavncdn.com 320kbps direct',
      providers: {
        jiosaavn: jioHealth
      }
    };
  }
}

export const musicService = new MusicProviderManager();
