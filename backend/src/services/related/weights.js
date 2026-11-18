/**
 * Tunable knobs for the related-songs ("radio") ranking. See docs/RADIO.md.
 * Change numbers here; the scoring code and tests read everything from this file.
 * A candidate's score is the SUM of the signals below (higher = more similar).
 */
export const WEIGHTS = {
  // --- how the song itself relates to the seed song ---
  sameComposer: 3.0, // same music director
  sharedSinger: 2.0, // multiplied by the share of the seed's singers that also sing this song (0..1)
  sameMovie: 2.5, // same film / album
  era: { within1: 1.5, within3: 1.0, within7: 0.5, within12: 0.2 }, // release-year distance, in years
  sameLanguage: 1.0,
  differentLanguage: -10.0, // stronger than every positive signal combined (about 9), so Telugu/Hindi never enter a Tamil radio
  sameShelf: 0.8, // both songs sit on the same home-feed shelf (melodies, 90s, gana, folk...): genre/mood stand-in
  // --- behaviour signals ---
  coListening: 2.0, // up to this much, rising with how often songs share playlists / listeners (log scale)
  coListeningSaturation: 5, // this many co-occurrences earn the full coListening weight
  providerRecommendation: 1.5, // the music provider itself recommends it
  popularity: 0.4, // tie-breaker, scaled by play count (log)
  // --- this listener ---
  liked: 0.6, // small boost for songs the user liked
  recentlyPlayed: -3.0, // played in the last RECENT_HOURS
  skippedRecently: -2.5, // skipped early in the last SKIP_DAYS
};

export const VARIETY = {
  maxRun: 3, // never more than this many in a row from the same artist or the same album
  discoveryRatio: 0.3, // about 30% of a batch is "discovery" (less similar), the rest is very similar
  similarMinScore: 2.0, // score at or above this counts as "very similar"
  maxPerMovie: 2, // within any movieWindow songs of a batch, at most this many from one film or album
  movieWindow: 10,
  maxSingerOnlyShare: 0.3, // "same singer" must not be the only reason for more than this share of a batch
};

export const LIMITS = {
  defaultLimit: 20,
  maxLimit: 50,
  candidatePool: 120, // most candidates kept per seed song
  poolCacheSeconds: 300, // candidate pool per seed song
  signalCacheSeconds: 60, // per-user like/recent/skip lookups
  sourceTimeoutMs: 6000, // a slow provider call never blocks the whole response
};

export const USER_WINDOWS = {
  recentHours: 6,
  skipDays: 7,
  skipEarlySeconds: 30, // a skip before this many seconds counts as "not for me"
};
