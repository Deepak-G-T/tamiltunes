import { SPEED_DIAL } from './config.js';

/**
 * Did the user really listen? True after `countedAfterSeconds`, or `countedAfterFraction` of the song,
 * or if it played to the end. Short songs therefore count after half their length.
 * @param {{ listenedSec?: number|null, durationSec?: number|null, completed?: boolean }} e
 */
export function isCountedPlay(e, cfg = SPEED_DIAL) {
  if (e.completed) return true;
  const listened = Number(e.listenedSec) || 0;
  if (listened >= cfg.countedAfterSeconds) return true;
  const duration = Number(e.durationSec) || 0;
  return duration > 0 && listened >= cfg.countedAfterFraction * duration;
}

/** A play that was cut short: skipped before it counted. */
export const isEarlySkip = (e, cfg = SPEED_DIAL) => e.skippedAtSec != null && !isCountedPlay(e, cfg);

/** 1 for a play right now, 0.5 after one half-life, and so on. */
export const decay = (ageDays, halfLifeDays = SPEED_DIAL.halfLifeDays) => 0.5 ** (Math.max(0, ageDays) / halfLifeDays);

/** Points one event adds (or subtracts) before decay. */
export function eventWeight(e, cfg = SPEED_DIAL) {
  if (isCountedPlay(e, cfg)) return cfg.playWeight + (e.completed ? cfg.completionBonus : 0);
  if (isEarlySkip(e, cfg)) return -cfg.skipPenalty;
  return 0;
}

/**
 * Rank songs from raw play events. Reference implementation: the Postgres query in store.js computes the same thing.
 * @param {{ songId: string, playedAt: Date|string|number, listenedSec?: number, durationSec?: number, completed?: boolean, skippedAtSec?: number|null }[]} events
 * @returns {{ songId: string, score: number, plays: number, lastPlayedAt: Date }[]} best first; songs with no counted play are left out
 */
export function scoreEvents(events, now = Date.now(), cfg = SPEED_DIAL) {
  const since = now - cfg.windowDays * 86400e3;
  const bySong = new Map();
  for (const e of events) {
    const t = new Date(e.playedAt).getTime();
    if (!Number.isFinite(t) || t < since || t > now + 60e3) continue;
    const w = eventWeight(e, cfg);
    if (!w) continue;
    const row = bySong.get(e.songId) || { songId: e.songId, score: 0, plays: 0, lastPlayedAt: null };
    row.score += w * decay((now - t) / 86400e3, cfg.halfLifeDays);
    if (isCountedPlay(e, cfg)) {
      row.plays += 1;
      if (!row.lastPlayedAt || t > row.lastPlayedAt.getTime()) row.lastPlayedAt = new Date(t);
    }
    bySong.set(e.songId, row);
  }
  return [...bySong.values()]
    .filter((r) => r.plays > 0)
    .map((r) => ({ ...r, score: Math.round(r.score * 1e6) / 1e6 }))
    .sort((a, b) => b.score - a.score || b.lastPlayedAt - a.lastPlayedAt || String(a.songId).localeCompare(String(b.songId)))
    .slice(0, cfg.maxCandidates);
}
