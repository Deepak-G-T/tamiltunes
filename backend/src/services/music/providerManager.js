import { JioSaavnProvider } from './jiosaavnProvider.js';
import { YouTubeIframeProvider } from './youtubeIframeProvider.js';
import { LocalAudioProvider, CURATED_TAMIL_SONGS, CURATED_ALBUMS, CURATED_ARTISTS } from './localAudioProvider.js';
import { musicCache } from '../cacheService.js';
import { config } from '../../config/env.js';

// Recognized official Tamil cinema distributors, indie channels, and devotional labels
const OFFICIAL_LABELS = [
  'sony', 'saregama', 'think music', 'divo', 'lahari', 't-series',
  'zee music', 'muzik247', 'star music', 'ayngaran', 'five star',
  'mass audios', 'sun pictures', 'lyca', 'trend music', 'noise and grains',
  'ananda audio', 'rajshri', 'tips', 'universal', 'warner', 'think indie',
  'dvo', 'aditya music', 'v creations', 'gemini', 'junglee music', 'trendmusic',
  'symphony', 'giri', 'ramana', 'divine'
];

// Short junk filter for obvious spam audio formats and amateur social media meme songs
const SPAM_PATTERNS = [
  /whatsapp\s+status/i,
  /status\s+video/i,
  /status\s+la\s+potu/i,
  /bass\s+boosted/i,
  /karaoke/i,
  /slowed\s*(?:and|n|&|\+)?\s*reverb(?:ed)?/i,
  /speed\s*up/i,
  /dj\s+remix/i,
  /ringtone/i,
  /bgm\s+cut/i,
  /trending\s+version/i,
  /salem\s+gana/i,
  /trending\s+gana/i,
  /gana\s+surya/i,
  /gana\s+suriya/i,
  /gana\s+velu/i
];

// Top authentic Tamil music directors, singers, poets, indie artists, and lyricists
const RECOGNIZED_TAMIL_ARTISTS = [
  'anirudh', 'a.r. rahman', 'ar rahman', 'rahman', 'yuvan', 'ilaiyaraaja', 'ilayaraja',
  'harris jayaraj', 'sid sriram', 'g.v. prakash', 'gv prakash', 'santhosh narayanan',
  'd. imman', 'imman', 'hiphop tamizha', 'vijay antony', 'sean roldan', 'sai abhyankkar',
  'sam c.s.', 'sam cs', 'vidyasagar', 'deva', 'gana bala', 's.p. balasubrahmanyam',
  'spb', 'k.j. yesudas', 'yesudas', 'hariharan', 'shankar mahadevan', 'shreya ghoshal',
  'chinmayi', 'pradeep kumar', 'haricharan', 'andrea', 'jonita', 'dhee', 'anthony daasan',
  'karthik', 'sujatha', 'chitra', 'swarnalatha', 'mano', 'sadhana sargam', 'unni menon',
  'tippu', 'harish raghavendra', 'naresh iyer', 'alisha thomas', 'shashaa tirupati',
  'sathyaprakash', 'deepthi suresh', 'arunraja kamaraj', 'super subu', 'vignesh shivan',
  'kaala bhairava', 'silambarasan', 'dhanush', 'kamal haasan', 'rajinikanth', 'thalapathy vijay',
  'marana gana viji', 'rokesh', 'gana ulaganathan', 'shankar ganesh', 'arun srinivasan',
  'arivu', 'therukural', 't.m. soundararajan', 'tm soundararajan', 'soundararajan',
  'kannadasan', 'vaali', 'm.s. viswanathan', 'viswanathan', 'ramamoorthy',
  'l.r. eswari', 'lr eswari', 'sirpy', 'veeramanidaasan', 'veeramani daasan',
  'k.b. sundarambal', 'mahanadhi shobana', 't.l. maharajan', 'p. susheela',
  'soolamangalam', 'bombay sisters', 'm.s. subbulakshmi', 'subbulakshmi',
  'sirkazhi', 'sivachidambaram', 'vani jayaram', 'veeramani', 'murugadas',
  'srinivas', 'ravi basrur', 'ghibran', 'ananya bhat'
];

/**
 * Validates whether a song originates from an official film release or reputable label
 * Uses positive signals (official label, "From <film>", recognized composer/singer)
 * with a short junk filter for obvious spam.
 */
export const isOfficialFilmRelease = (song) => {
  if (!song) return false;
  const combined = `${song.title || ''} ${song.artist || ''} ${song.album || ''} ${song.singers || ''}`.toLowerCase();

  // Reject non-Tamil languages (must be Tamil or unclassified single)
  const lang = (song.language || song.more_info?.language || '').toLowerCase().trim();
  if (lang && lang !== 'tamil' && lang !== 'unknown') {
    return false;
  }
  if (
    combined.includes('[telugu]') ||
    combined.includes('[hindi]') ||
    combined.includes('[kannada]') ||
    combined.includes('[malayalam]') ||
    combined.includes('[punjabi]') ||
    combined.includes('[marathi]')
  ) {
    return false;
  }

  // Reject obvious spam audio formats
  if (SPAM_PATTERNS.some((pattern) => pattern.test(combined))) {
    return false;
  }

  // Curated catalog and verified YouTube collection are pre-verified
  if (song.id && (song.id.startsWith('tt_') || song.id.startsWith('yt_'))) {
    return true;
  }

  // Positive Signal 1: Check if distributed by recognized official label
  const songLabel = (song.label || song.more_info?.label || '').toLowerCase();
  if (OFFICIAL_LABELS.some((lbl) => songLabel.includes(lbl))) {
    return true;
  }

  // Positive Signal 2: Check film release indicator ("From <film>", soundtrack, OST) in title or album
  const hasFilmIndicator =
    /from\s+["'].+?["']/i.test(combined) ||
    combined.includes('from "') ||
    combined.includes("from '") ||
    combined.includes('soundtrack') ||
    combined.includes('original motion picture') ||
    combined.includes('ost');

  if (hasFilmIndicator) {
    return true;
  }

  // Positive Signal 3: Check if track features a recognized Tamil music director/singer/lyricist
  const hasRecognizedArtist = RECOGNIZED_TAMIL_ARTISTS.some((a) => combined.includes(a));
  if (hasRecognizedArtist) {
    return true;
  }

  // Positive Signal 4: Traditional Tamil devotional scripture / prayers
  const isTraditionalDevotional =
    /\b(kavasam|kavacham|agaval|thiruppugazh|thevaram|thiruvasagam|abirami\s+andhadhi)\b/i.test(combined);
  if (isTraditionalDevotional && (lang === 'tamil' || !lang)) {
    return true;
  }

  return false;
};

export class MusicProviderManager {
  constructor() {
    this.providers = {
      jiosaavn: new JioSaavnProvider(),
      youtube: new YouTubeIframeProvider(),
      local: new LocalAudioProvider(),
      mock: new LocalAudioProvider()
    };

    // Active provider initialized via environment variable (default: jiosaavn)
    this.providerName = config.musicProvider || 'jiosaavn';
    this.activeProvider = this.providers[this.providerName] || this.providers.jiosaavn;
    this.curated = new LocalAudioProvider();
  }

  /**
   * Dynamically switch active provider (e.g. 'jiosaavn' <-> 'youtube')
   */
  setProvider(name) {
    const key = (name || '').toLowerCase();
    if (this.providers[key]) {
      this.providerName = key;
      this.activeProvider = this.providers[key];
      console.log(`Active music provider switched to: ${this.providerName}`);
      return true;
    }
    return false;
  }

  getProviderName() {
    return this.providerName;
  }

  /**
   * Search tracks via active provider (with 10-minute cache)
   */
  async searchTracks(query, options = {}) {
    const q = (query || '').toLowerCase().trim();
    const type = options.type || 'all';
    const cacheKey = `search_${this.providerName}_${q}_${type}`;

    const cached = musicCache.get(cacheKey);
    if (cached) return cached;

    let result = { songs: [], albums: [], artists: [] };

    // 1. Query active provider
    try {
      const liveData = await this.activeProvider.search(query, type);
      if (liveData) {
        result.songs = (liveData.songs || []).filter((s) => s.streamUrl && isOfficialFilmRelease(s));
        result.albums = liveData.albums || [];
        result.artists = liveData.artists || [];
      }
    } catch (err) {
      console.warn(`Provider [${this.providerName}] search query error:`, err.message);
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

    musicCache.set(cacheKey, result, 600); // 10 minute TTL
    return result;
  }

  // Compatibility alias
  async search(query, type = 'all') {
    return this.searchTracks(query, { type });
  }

  /**
   * Get single track by ID (with 10-minute cache)
   */
  async getSong(id) {
    const cacheKey = `song_${this.providerName}_${id}`;
    const cached = musicCache.get(cacheKey);
    if (cached) return cached;

    // Check curated tracks
    const curated = CURATED_TAMIL_SONGS.find((s) => s.id === id);
    if (curated) {
      musicCache.set(cacheKey, curated, 600);
      return curated;
    }

    try {
      const song = await this.activeProvider.getSong(id);
      if (song) {
        musicCache.set(cacheKey, song, 600);
        return song;
      }
    } catch (e) {
      console.warn(`getSong error [${id}]:`, e.message);
    }
    return null;
  }

  async getAlbum(id) {
    const curatedMatch = CURATED_ALBUMS.find((a) => a.id === id);
    if (curatedMatch) return curatedMatch;

    try {
      return await this.activeProvider.getAlbum(id);
    } catch (err) {
      console.warn('getAlbum error:', err.message);
      return null;
    }
  }

  async getArtist(id) {
    const curatedMatch = CURATED_ARTISTS.find((a) => a.id === id);
    if (curatedMatch) return curatedMatch;

    try {
      return await this.activeProvider.getArtist(id);
    } catch (err) {
      console.warn('getArtist error:', err.message);
      return null;
    }
  }

  /**
   * Retrieve categorized home feed with 10-minute TTL cache
   */
  async getHomeFeed() {
    const cacheKey = `home_feed_${this.providerName}`;
    const cached = musicCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Base curated authentic tracks
    const trendingCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === 'trending');
    const ninetiesCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === '90s');
    const twoThousandsCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === '2000s');
    const melodiesCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === 'melodies');
    const ganaCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === 'gana');
    const folkCurated = CURATED_TAMIL_SONGS.filter((s) => s.category === 'folk');

    // Fetch live categories from active provider in parallel
    const [
      liveTrending,
      liveLatest,
      live90s,
      live2000s,
      liveMelodies,
      liveGana,
      liveLove,
      liveSad,
      liveFolk,
      liveInstrumental
    ] = await Promise.all([
      this.activeProvider.searchSongs?.('leo jailer master anirudh tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('vettaiyan goat sai abhyankkar tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('ar rahman 90s hits tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('harris jayaraj hits tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('yuvan shankar raja melodies tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('marana mass aaluma doluma vaathi coming danga maari', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('sid sriram romantic tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('ilaiyaraaja sad evergreen tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('anirudh dhee kuthu beats tamil', 10).catch(() => []) || [],
      this.activeProvider.searchSongs?.('tamil instrumental violin flute', 10).catch(() => []) || []
    ]);

    // Combine curated with live results, verifying official film release
    const mergeUnique = (curated, live) => {
      const titles = new Set();
      const result = [];
      for (const s of [...curated, ...live]) {
        if (!s || !s.title || !s.streamUrl || !isOfficialFilmRelease(s)) continue;
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
      gana: mergeUnique(ganaCurated, liveGana),
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

    musicCache.set(cacheKey, feed, 600); // 10 minutes TTL
    return feed;
  }

  async health() {
    const providerHealth = await this.activeProvider.healthCheck();
    return {
      status: 'operational',
      activeProvider: this.providerName,
      cache: musicCache.stats(),
      providerDetails: providerHealth
    };
  }
}

export const musicService = new MusicProviderManager();
