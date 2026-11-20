/**
 * The no-repeat settings, in one place (docs/NO_REPEAT.md). Change numbers here; the code and the tests read from this file.
 *
 * THE RULE: the same song must not appear twice inside the queue. That is all that is forbidden.
 * "Same song" = the same canonical song: a re-upload, a compilation copy or a spelling variant ("Maelae"/"Melae") counts as the song itself;
 * a version of the CURRENT song (unplugged, remix ...) is skipped too. Nothing about listening history is a hard rule: a song played yesterday may come back.
 */
export const NO_REPEAT = {
  // ---- the one soft preference
  recentAvoid: 20,        // prefer songs that are not among the last N played ...
  softMinPool: 15,        // ... but only while at least this many songs remain without them. A smaller pool drops this preference first.
  maxRecent: 50,          // most recently-played ids the app may send with a request (the first `recentAvoid` are used)
  // ---- when the pool runs dry
  minCandidates: 15,      // fewer candidates than this after the hard rules: widen the search instead of stopping
  widenSteps: ['composer', 'era', 'language', 'trending'], // in this order: same music director, same era, same language, trending in the language
  // ---- Home page (its own rules: one song once across the shelves; shelves skip what was played in the last day)
  homeSkipPlayedHours: 24,
  homeShelvesExempt: ['jumpBackIn', 'speedDial', 'liked'],
  // ---- limits
  maxBlocks: 1000,        // "Don't recommend this" songs per account (the only thing a listener chose to keep out)
  maxExclude: 200,        // song ids the app may send as "already in my queue"
};
