/**
 * The candidate filter, in the order of the rule (before any scoring):
 *   a) not already in the current queue (playing, next, the radio block)
 *   b) not in the session memory or the rolling history
 *   c) not in its cool-down, not blocked, not hidden
 *   d) not a variant of a song that is playing or queued
 * Everything is by canonical song (identity.js). `allowRepeats` lifts (b) and (c) only: the queue itself is never repeated, and "Don't recommend" always holds.
 */
import { createIdentitySet } from '../related/identity.js';

const hidden = (s) => Boolean(s?.isHidden || s?.deletedAt);

/**
 * @param {object[]} candidates
 * @param {{ queueSongs?: object[], memory: ReturnType<import('./memory.js').createMemory>, allowRepeats?: boolean, context?: 'radio'|'taste'|'liked' }} ctx
 * @returns {{ fresh: object[], dropped: { inQueue:number, heard:number, cooling:number, blocked:number, hidden:number, variantOfQueued:number } }}
 */
export function filterCandidates(candidates, { queueSongs = [], memory, allowRepeats = false, context = 'radio' } = {}) {
  const dropped = { inQueue: 0, heard: 0, cooling: 0, blocked: 0, hidden: 0, variantOfQueued: 0 };
  const queued = createIdentitySet(queueSongs.filter(Boolean));
  const taken = createIdentitySet(); // songs already accepted in THIS batch: one copy of each song (and of its versions)
  const fresh = [];
  for (const s of candidates || []) {
    if (!s?.id || !s.title) continue;
    if (hidden(s)) { dropped.hidden++; continue; }
    if (queued.has(s)) { dropped.inQueue++; continue; }                                     // a) same song as something queued / playing
    if (memory?.isBlocked(s)) { dropped.blocked++; continue; }                               // c) "Don't recommend this" (always holds, even with repeats allowed)
    if (!allowRepeats) {
      if (memory?.inSession(s) || memory?.inRolling(s)) { dropped.heard++; continue; }       // b) already heard
      if (memory?.inCooldown(s, { context })) { dropped.cooling++; continue; }               // c) inside its cool-down
    }
    if (queued.hasVariant(s) || taken.hasVariant(s)) { dropped.variantOfQueued++; continue; } // d) a version of a queued song, or of one picked a moment ago
    taken.add(s);
    fresh.push(s);
  }
  return { fresh, dropped };
}
