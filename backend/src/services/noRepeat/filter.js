/**
 * The candidate filter (the hard rules). A candidate is dropped when it is:
 *   - hidden or deleted, or blocked ("Don't recommend this", with its versions)
 *   - the same song as the playing song or as anything already in the queue (same id, cover, album or spelling: canonical matching, identity.js)
 *   - a version of the PLAYING song (unplugged, remix ...)
 *   - the same song as one already accepted in this batch
 * Listening history is not consulted. Versions of other queued songs are allowed.
 */
import { createIdentitySet } from '../related/identity.js';

const hidden = (s) => Boolean(s?.isHidden || s?.deletedAt);

/**
 * @param {object[]} candidates
 * @param {{ current?: object|null, queueSongs?: object[], memory?: { isBlocked: (s: object) => boolean } }} ctx  queueSongs = everything queued (the radio block and what the person added)
 * @returns {{ fresh: object[], dropped: { inQueue:number, variantOfCurrent:number, blocked:number, hidden:number, duplicateInBatch:number } }}
 */
export function filterCandidates(candidates, { current = null, queueSongs = [], memory = null } = {}) {
  const dropped = { inQueue: 0, variantOfCurrent: 0, blocked: 0, hidden: 0, duplicateInBatch: 0 };
  const queued = createIdentitySet([current, ...queueSongs].filter(Boolean)); // the same song, however it is spelled or covered
  const playing = createIdentitySet(current ? [current] : []);               // plus its versions
  const taken = createIdentitySet();                                          // accepted in THIS batch
  const fresh = [];
  for (const s of candidates || []) {
    if (!s?.id || !s.title) continue;
    if (hidden(s)) { dropped.hidden++; continue; }
    if (memory?.isBlocked(s)) { dropped.blocked++; continue; }
    if (queued.has(s)) { dropped.inQueue++; continue; }
    if (playing.hasVariant(s)) { dropped.variantOfCurrent++; continue; }
    if (taken.has(s)) { dropped.duplicateInBatch++; continue; }
    taken.add(s);
    fresh.push(s);
  }
  return { fresh, dropped };
}

/**
 * The one soft preference: leave out songs among the last N played, but only while enough songs remain without them.
 * A small pool keeps everything (this preference is dropped first). Never changes the order.
 * @returns {{ pool: object[], applied: boolean }}
 */
export function softAvoidRecent(fresh, recentSongs, { minPool }) {
  if (!recentSongs?.length) return { pool: fresh, applied: false };
  const recent = createIdentitySet(recentSongs);
  const rest = fresh.filter((s) => !recent.has(s));
  return rest.length >= minPool ? { pool: rest, applied: rest.length !== fresh.length } : { pool: fresh, applied: false };
}
