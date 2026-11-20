/**
 * Every window and limit of the NO-REPEAT rules, in one place (docs/NO_REPEAT.md). Change numbers here; the code and the tests read from this file.
 * "Same song" always means the same canonical song: a re-upload, a compilation copy, a spelling variant ("Maelae"/"Melae") or a version of it
 * (unplugged, remix ...) counts as the song itself.
 */
export const NO_REPEAT = {
  // ---- memory: what "already heard" means
  rollingHistory: 200,               // the last N played songs of the account (play_events), compared by canonical song
  sessionMemoryMax: 600,             // songs remembered per listening session (played, skipped or queued), saved with the queue
  // ---- cool-down: a song cannot be auto-added again for ...
  cooldownDaysAfterFullListen: 7,    // ... days after it was played to the end
  cooldownDaysAfterEarlySkip: 30,    // ... days after an early skip
  earlySkipSeconds: 30,              // a skip before this many seconds is an "early skip" (same meaning as the radio's USER_WINDOWS)
  likedFamiliarAfterHours: 24,       // a liked song may return in "Taste Radio" (the radio started from liked / most-played songs) after this long
  // ---- when the pool runs dry
  minFreshCandidates: 10,            // fewer than this many fresh songs: widen the search instead of reusing old songs
  widenSteps: ['composer', 'era', 'language', 'trending'], // in this order: same music director, same era, same language, trending in the language
  // ---- Home page
  homeSkipPlayedHours: 24,           // shelves skip songs played in the last N hours (except "Jump back in" and "Liked songs")
  homeShelvesExempt: ['jumpBackIn', 'speedDial', 'liked'],
  // ---- limits
  maxBlocks: 1000,                   // "Don't recommend this" songs per account
  maxExclude: 200,                   // song ids the client may send as "already in my queue"
};

const DAY = 86400e3;
const HOUR = 3600e3;
export const cooldownMs = (kind, cfg = NO_REPEAT) => (kind === 'skip' ? cfg.cooldownDaysAfterEarlySkip * DAY : cfg.cooldownDaysAfterFullListen * DAY);
export const likedFamiliarMs = (cfg = NO_REPEAT) => cfg.likedFamiliarAfterHours * HOUR;
