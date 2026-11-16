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

    const normTitle = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const existingTitles = new Set(result.songs.map((s) => normTitle(s.title)));
    for (const s of curatedMatches) {
      const norm = normTitle(s.title);
      if (!existingTitles.has(norm)) {
        result.songs.unshift(s);
        existingTitles.add(norm);
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

    // Fetch live categories from JioSaavn in parallel using top Kollywood movie soundtracks
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
      this.jiosaavn.searchSongs('leo jailer master anirudh tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('vettaiyan goat sai abhyankkar tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('ar rahman 90s hits tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('harris jayaraj hits tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('yuvan shankar raja melodies tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('sid sriram romantic tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('ilaiyaraaja sad evergreen tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('anirudh dhee kuthu beats tamil', 10).catch(() => []),
      this.jiosaavn.searchSongs('tamil instrumental violin flute', 10).catch(() => [])
    ]);

    // Filter out low-effort / amateur / local gaana tracks and uninteresting artists
    const JUNK_PATTERNS = [
      /gana\s+/i,
      /\bgana\b/i,
      /trending\s+gana/i,
      /trending\s+version/i,
      /salem\s+gana/i,
      /the\s+independeners/i,
      /dj\s+remix/i,
      /\bremix\b/i,
      /bass\s+boosted/i,
      /whatsapp\s+status/i,
      /status\s+video/i,
      /cover\s+song/i,
      /cover\s+version/i,
      /karaoke/i,
      /lofi\s+flip/i,
      /slowed\s+reverb/i
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
      popularArtists: CURATED_ARTISTS,
      albums: CURATED_ALBUMS,
      artists: CURATED_ARTISTS
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
