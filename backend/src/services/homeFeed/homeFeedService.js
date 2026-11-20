/**
 * Assembles the home page: candidate pools from the music provider and the database, then `assembleHome` (dedupe, caps,
 * seeded shuffle). The result is cached per person for a few minutes. Provider searches are cached for 10 minutes.
 */
import { NO_REPEAT } from '../noRepeat/config.js';
import { getBlocksStore } from '../noRepeat/blocksStore.js';
import { musicService } from '../music/providerManager.js';
import { CURATED_ARTISTS } from '../music/localAudioProvider.js';
import { musicCache } from '../cacheService.js';
import { getSignalsStore } from '../related/signalsStore.js';
import { getHomeSignals } from './signals.js';
import { assembleHome, MIN_ITEMS, ROTATION_PLAYS } from './assemble.js';
import { dayKey } from './seed.js';
import { videoLookup } from '../music/videoLookup.js';

export const VIDEO_SHELF_MIN = 4; // a video shelf needs fewer songs than the others: only some songs have an official video
/** Songs that have a video right now (curated map, cache, admin choice; no network), never a flagged one. */
const withVideos = (list) => videoLookup.attach(list || []).filter((s) => s?.videoId);

export const FEED_TTL_MS = 3 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;
const TAB_MAX = 30;
const cache = new Map(); // key -> { at, value }

export const TAB_TITLES = {
  trending: 'Trending now',
  melodies: 'Heartfelt melodies & love songs',
  gana: 'Authentic film gaana hits',
  nineties: '90s melodies',
  twoThousands: '2000s hits',
  folk: 'Folk & kuthu beats',
  love: 'Love songs',
  instrumental: 'Instrumental',
  videos: 'Video songs',
};

// Extra searches per pool: used to top a pool up when the feed's own list is short.
const QUERIES = {
  trending: ['tamil trending songs', 'anirudh latest hits tamil'],
  new: ['new tamil songs', 'latest tamil movie songs'],
  nineties: ['90s tamil melody hits', 'ilaiyaraaja 90s songs', 'ar rahman 90s tamil'],
  twoThousands: ['2000s tamil hits', 'harris jayaraj 2000s', 'yuvan shankar raja 2000s'],
  melodies: ['tamil melody songs', 'sid sriram tamil'],
  gana: ['tamil gaana songs', 'tamil mass songs'],
  folk: ['tamil folk songs', 'tamil kuthu songs'],
  love: ['tamil love songs'],
  instrumental: ['tamil instrumental'],
};

const yearOf = (s) => Number.parseInt(s?.year, 10);
const inYears = (from, to) => (s) => { const y = yearOf(s); return Number.isFinite(y) && y >= from && y <= to; };

async function search(query) {
  const key = `homepool:${musicService.providerName}:${query}`;
  const hit = musicCache.get(key);
  if (hit) return hit;
  const provider = musicService.activeProvider;
  const songs = (await provider.searchSongs?.(query, 15).catch(() => [])) || [];
  musicCache.set(key, songs, 600);
  return songs;
}

const playable = (list) => (list || []).filter((s) => s?.id && s.title && s.streamUrl);

async function poolFor(name, feed, extra = true) {
  const base = playable(feed[name === 'new' ? 'latest' : name]);
  const more = extra ? (await Promise.all((QUERIES[name] || []).map(search))).flat() : [];
  return playable([...base, ...more]);
}

/** Every song we could look up by id, to turn the client's "already on screen" ids into songs. */
async function resolveExclude(ids, pools) {
  if (!ids.length) return [];
  const byId = new Map();
  for (const list of Object.values(pools)) for (const s of list) if (!byId.has(s.id)) byId.set(s.id, s);
  const found = ids.map((id) => byId.get(id)).filter(Boolean);
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    const rows = await getSignalsStore().songsByIds(missing).catch(() => []);
    for (const r of rows) found.push({ id: r.id, title: r.title, artist: r.artist, singers: (r.singers || []).join(', ') || r.artist, album: r.album ?? r.movie ?? null });
    const known = new Set(found.map((s) => s.id));
    for (const id of missing) if (!known.has(id)) found.push({ id, title: '', artist: '' }); // unknown song: at least its id is excluded
  }
  return found;
}

export const MAX_MIXES = 3;
export const MAX_AVOID = 80;

/**
 * Daily Mix 1..3: each mix is built from two of the person's favourite artists (most played and liked), like Spotify's Daily Mix.
 * @returns {{ id: string, title: string, subtitle: string, artists: string[] }[]}
 */
export function planMixes(artists) {
  const names = [...new Set((artists || []).filter(Boolean))];
  const mixes = [];
  for (let i = 0; i < names.length && mixes.length < MAX_MIXES; i += 2) {
    const pair = names.slice(i, i + 2);
    mixes.push({ id: `daily-mix-${mixes.length + 1}`, title: `Daily Mix ${mixes.length + 1}`, subtitle: `${pair.join(', ')} and more`, artists: pair });
  }
  return mixes;
}

/**
 * @param {{ userId?: string | null, exclude?: string[], tab?: string | null, now?: number, visit?: string | null, avoid?: string[], hintArtists?: string[] }} args
 *   visit: a fresh token for each app open / pull to refresh: a new token is a new mix (the seed changes).
 *   avoid: songs shown last time: pushed down, not removed, so a thin shelf still fills.
 *   hintArtists: favourite artists of a logged-out listener (kept in the browser), used for Daily Mix.
 */
export async function buildHome({ userId = null, exclude = [], tab = null, now = Date.now(), visit = null, avoid = [], hintArtists = [] } = {}) {
  const ex = [...new Set(exclude)].slice(0, 60).sort();
  const av = [...new Set(avoid)].slice(0, MAX_AVOID);
  const hints = [...new Set(hintArtists)].slice(0, 6);
  const day = dayKey(now);
  const cacheKey = `${userId || 'guest'}|${tab || 'all'}|${day}|${visit || ''}|${musicService.providerName}|${ex.join(',')}|${av.join(',')}|${hints.join(',')}`;
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < FEED_TTL_MS) return hit.value;

  const signals = getHomeSignals();
  const feed = await musicService.getHomeFeed();
  const seed = `${userId || 'guest'}:${day}${visit ? `:${visit}` : ''}`;
  const weekPlays = userId ? await signals.weekPlays(userId, now).catch(() => new Map()) : new Map();

  let plan;
  let pools;
  if (tab === 'videos') {
    // the "Videos" chip: every pool we have, only songs with a video, shown as 16:9 thumbnails
    const all = (await Promise.all(['trending', 'new', 'melodies', 'nineties', 'twoThousands', 'gana', 'love', 'folk'].map((n) => poolFor(n, feed)))).flat();
    const pool = withVideos(all);
    pools = { videos: pool };
    plan = [{ id: 'videos', title: TAB_TITLES.videos, display: 'video', pool, min: 1, max: TAB_MAX, caps: false }];
  } else if (tab && TAB_TITLES[tab]) {
    const pool = await poolFor(tab, feed);
    pools = { [tab]: pool };
    plan = [{ id: tab, title: TAB_TITLES[tab], pool, min: 1, max: TAB_MAX, caps: false }];
  } else {
    const [trendingPool, newPool, ninetiesPool, aughtsPool, recent, topArtists, trendingNow] = await Promise.all([
      poolFor('trending', feed), poolFor('new', feed), poolFor('nineties', feed), poolFor('twoThousands', feed),
      userId ? signals.recentSongs(userId, 30).catch(() => []) : [],
      userId ? signals.topArtists(userId, MAX_MIXES * 2, now).catch(() => []) : [],
      signals.globalTrending(30, now).catch(() => []),
    ]);
    const favourites = topArtists.length ? topArtists : hints; // a new account or a guest: the artists they play in this browser
    const mixes = planMixes(favourites);
    const mixPools = await Promise.all(mixes.map(async (m) => playable((await Promise.all(m.artists.flatMap((a) => [search(`${a} tamil songs`), search(`${a} hits`)]))).flat()).filter((s) => !weekPlays.has(s.id))));
    const mixPool = playable((await Promise.all(favourites.slice(0, 3).map((a) => search(`${a} tamil songs`)))).flat()).filter((s) => !weekPlays.has(s.id));
    const trending = playable([...trendingNow.map((t) => t.song), ...trendingPool]); // real plays first, the provider's trending fills the rest
    const currentYear = new Date(now).getUTCFullYear();
    pools = { continue: recent, mix: mixPool, ...Object.fromEntries(mixes.map((m, i) => [m.id, mixPools[i]])), trending, new: newPool, nineties: ninetiesPool, aughts: aughtsPool };
    plan = [
      { id: 'continue', title: 'Continue listening', pool: recent, min: 4 },
      ...(mixes.length
        ? mixes.map((m, i) => ({ id: m.id, title: m.title, subtitle: m.subtitle, pool: mixPools[i] }))
        : [{ id: 'made-for-you', title: 'Made for you', pool: mixPool }]),
      // before Trending, so the songs with a video are not all taken by the shelves above it; the shared "already shown" set
      // (canonical-song dedupe) still keeps every song to one place on the page
      { id: 'videos', title: 'Video songs', display: 'video', pool: withVideos([...trending, ...newPool, ...ninetiesPool, ...aughtsPool]), min: VIDEO_SHELF_MIN, max: 12 },
      { id: 'trending', title: 'Trending now', pool: trending, heroFrom: true },
      { id: 'new', title: 'New releases', pool: newPool.filter(inYears(currentYear - 1, currentYear)).sort((a, b) => yearOf(b) - yearOf(a)) },
      { id: 'nineties', title: '90s melodies', pool: ninetiesPool.filter(inYears(1990, 1999)) },
      { id: 'aughts', title: '2000s hits', pool: aughtsPool.filter(inYears(2000, 2009)) },
      { id: 'artists', title: 'Popular artists', kind: 'artists', pool: CURATED_ARTISTS },
      { id: 'albums', title: 'Popular albums', kind: 'albums', pool: feed.popularAlbums || feed.albums || [] },
    ];
  }

  // No-repeat rules for the page (docs/NO_REPEAT.md): songs played in the last day and blocked songs are kept out of the shelves
  let recent = [];
  let blocked = [];
  if (userId) {
    const sinceMs = new Date(now - NO_REPEAT.homeSkipPlayedHours * 3600e3);
    recent = (await getSignalsStore().playHistory(userId, { since: sinceMs, limit: 300 }).catch(() => [])).map((p) => p.song).filter(Boolean);
    blocked = await getBlocksStore().list(userId).catch(() => []);
  }
  const excluded = await resolveExclude(ex, pools);
  // songs shown last time count like songs played a lot this week: they sink, but stay if a shelf would be thin
  const penalty = new Map(weekPlays);
  for (const id of av) penalty.set(id, Math.max(penalty.get(id) || 0, ROTATION_PLAYS));
  const result = assembleHome(plan, { exclude: excluded, seed, weekPlays: penalty, hero: !tab, recent, blocked, exempt: NO_REPEAT.homeShelvesExempt.concat(['continue']) });
  const value = { seed, ...result };
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { at: now, value });
  return value;
}

export const clearHomeCache = () => cache.clear();
export { MIN_ITEMS };
