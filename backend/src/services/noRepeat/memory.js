/**
 * "What has this listener already heard?" for the no-repeat rules. Built from four sources, all compared by canonical song (identity.js):
 *   session  the songs remembered with the saved queue (played, skipped, queued), shared by every device of the account
 *   rolling  the last NO_REPEAT.rollingHistory plays (play_events)
 *   cooling  songs still inside their cool-down (played to the end < 7 days ago, skipped early < 30 days ago)
 *   blocked  songs the listener chose "Don't recommend this" for (never come back)
 * Plus liked ids, and each song's last play time (for "allow repeats": least recently played first).
 */
import { createIdentitySet, variantKey } from '../related/identity.js';
import { NO_REPEAT, cooldownMs, likedFamiliarMs } from './config.js';

const toSong = (row) => ({ id: row.id, title: row.title, artist: row.artist ?? row.singers?.join?.(', ') ?? '', album: row.album ?? row.movie ?? null, duration: row.duration ?? row.durationSec ?? 0, singers: row.singers });

/**
 * @param {{ userId: string, plays: {song:object, playedAt:Date|number, completed?:boolean, skippedAtSec?:number|null}[], sessionKeys?: string[], sessionIds?: string[],
 *           blocks?: object[], liked?: Set<string>, now?: number, cfg?: object }} input
 */
export function createMemory({ plays = [], sessionKeys = [], sessionIds = [], blocks = [], liked = new Set(), now = Date.now(), cfg = NO_REPEAT } = {}) {
  const newestFirst = [...plays].sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
  const rollingPlays = newestFirst.slice(0, cfg.rollingHistory);
  const rolling = createIdentitySet(rollingPlays.map((p) => p.song));
  const cooling = createIdentitySet();
  const coolingUntil = new Map(); // song id -> ms when its cool-down ends (for liked songs in Taste Radio)
  const lastPlayed = new Map(); // variantKey -> { song, at }
  for (const p of newestFirst) {
    const at = new Date(p.playedAt).getTime();
    const key = variantKey(p.song);
    if (!lastPlayed.has(key)) lastPlayed.set(key, { song: p.song, at });
    // an early skip is "not for me": 30 days. Anything else (played to the end, or left after a good while) counts as heard: 7 days
    const early = !p.completed && p.skippedAtSec != null && p.skippedAtSec < cfg.earlySkipSeconds;
    const until = at + cooldownMs(early ? 'skip' : 'full', cfg);
    if (until > now) { cooling.add(p.song); coolingUntil.set(p.song.id, Math.max(coolingUntil.get(p.song.id) || 0, until)); }
  }
  const blocked = createIdentitySet(blocks.map(toSong));
  const blockedKeys = new Set(blocks.map((b) => b.key || variantKey(toSong(b))));
  const sessionKeySet = new Set(sessionKeys);
  const sessionIdSet = new Set(sessionIds);

  const keyOf = (song) => variantKey(song);
  const api = {
    cfg,
    liked,
    isBlocked: (song) => blockedKeys.has(keyOf(song)) || blocked.hasVariant(song),
    inSession: (song) => sessionIdSet.has(song.id) || sessionKeySet.has(keyOf(song)),
    inRolling: (song) => rolling.hasVariant(song),
    inCooldown(song, { context = 'radio' } = {}) {
      if (!cooling.hasVariant(song)) return false;
      if (!liked.has(song.id)) return true;
      if (context === 'liked') return false; // inside "Liked songs" playback a liked song is never held back by the cool-down
      if (context === 'taste') { // Taste Radio: the familiar part may return after 24 hours
        const until = coolingUntil.get(song.id);
        const last = lastPlayed.get(keyOf(song))?.at ?? 0;
        return now - last < likedFamiliarMs(cfg) && Boolean(until);
      }
      return true;
    },
    /** Songs the listener played, oldest first: what "allow repeats" brings back first. */
    lastPlayedAt: (song) => lastPlayed.get(keyOf(song))?.at ?? 0,
    leastRecentlyPlayed: () => [...lastPlayed.values()].sort((a, b) => a.at - b.at).map((x) => x.song),
    size: () => ({ rolling: rollingPlays.length, cooling: coolingUntil.size, blocked: blockedKeys.size, session: sessionKeySet.size + sessionIdSet.size }),
  };
  return api;
}

/** Build the memory from the stores (Prisma or in-memory). `heard` may also be passed by the caller (the live, not yet saved list). */
export async function loadMemory({ userId, signals, queueStore, blocksStore, extraHeard = [], now = Date.now(), cfg = NO_REPEAT }) {
  if (!userId) return createMemory({ sessionKeys: extraHeard.map((h) => h.k).filter(Boolean), sessionIds: extraHeard.map((h) => h.id).filter(Boolean), now, cfg });
  const [plays, queueRow, blocks, user] = await Promise.all([
    signals.playHistory?.(userId, { limit: 2000 }).catch(() => []) ?? [], // newest 2000 plays: enough for the last 200 AND every cool-down window
    queueStore.get(userId).catch(() => null),
    blocksStore.list(userId).catch(() => []),
    signals.userSignals(userId, now).catch(() => ({ liked: new Set() })),
  ]);
  const heard = [...(queueRow?.heard || []), ...extraHeard];
  return createMemory({
    plays: plays || [],
    sessionKeys: heard.map((h) => h.k).filter(Boolean),
    sessionIds: heard.map((h) => h.id).filter(Boolean),
    blocks,
    liked: user.liked || new Set(),
    now,
    cfg,
  });
}
