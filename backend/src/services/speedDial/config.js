/**
 * Tunable knobs for Speed Dial. See docs/SPEED_DIAL.md. Edit numbers here; code and tests read from this file.
 *
 * A song's score is the SUM over its plays in the last `windowDays` of:
 *   (playWeight + completionBonus if the song was played to the end)  x  decay(age)
 *   or  -skipPenalty x decay(age)  for a play that was skipped early
 * where decay(age) = 0.5 ^ (ageInDays / halfLifeDays).
 */
export const SPEED_DIAL = {
  slots: 9, // tiles shown
  windowDays: 90, // plays older than this are ignored
  halfLifeDays: 14, // a play loses half its weight every 14 days
  playWeight: 1.0, // a counted play
  completionBonus: 0.5, // extra for playing to the end
  skipPenalty: 0.5, // an early skip subtracts this
  minScore: 0.2, // songs scoring below this are not "most played" yet
  // What counts as a play (checked by the server, and by the player before it reports)
  countedAfterSeconds: 30, // listened this long...
  countedAfterFraction: 0.5, // ...or this share of the song, whichever comes first
  minSkipSeconds: 2, // a skip shorter than this is a mis-tap and is ignored
  cacheSeconds: 60,
  maxCandidates: 60, // songs ranked per user before pins and fill
  importMaxSongs: 50, // most songs accepted when a guest signs in
  importMaxPlaysPerSong: 5, // a guest's play count is replayed as at most this many events
};
