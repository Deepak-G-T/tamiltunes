/**
 * What must never come back: songs the listener chose "Don't recommend this" for (and their versions). That is the only listener memory left:
 * play history, cool-downs and "everything heard this session" are NOT rules any more (docs/NO_REPEAT.md).
 */
import { createIdentitySet, variantKey } from '../related/identity.js';

const toSong = (row) => ({ id: row.id, title: row.title, artist: row.artist ?? row.singers?.join?.(', ') ?? '', album: row.album ?? row.movie ?? null, duration: row.duration ?? row.durationSec ?? 0, singers: row.singers });

/** @param {{ blocks?: object[] }} input */
export function createMemory({ blocks = [] } = {}) {
  const blocked = createIdentitySet(blocks.map(toSong));
  const blockedKeys = new Set(blocks.map((b) => b.key || variantKey(toSong(b))));
  return {
    isBlocked: (song) => blockedKeys.has(variantKey(song)) || blocked.hasVariant(song),
    size: () => ({ blocked: blockedKeys.size }),
  };
}

/** The listener's block list, read per request from whichever database is live. A guest has none. */
export async function loadMemory({ userId = null, blocksStore = null } = {}) {
  const blocks = userId && blocksStore ? await blocksStore.list(userId).catch(() => []) : [];
  return createMemory({ blocks });
}
