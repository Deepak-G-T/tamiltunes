import { songFingerprint, variantKey, sameSong, sameVariant, clusterSongs } from './identity.js';

/**
 * Groups of songs that are the same song (or versions of it). Report only: nothing is changed or deleted.
 * @param {object[]} songs rows with id, title, artist/singers, album
 * @returns {{ kind: 'same-song' | 'versions', key: string, songs: object[] }[]}
 */
export function findDuplicateGroups(songs) {
  const byTitle = new Map(); // fingerprint title -> songs, so only likely twins are compared
  for (const s of songs) {
    if (!s?.id || !s.title) continue;
    const key = songFingerprint(s).split('|')[0];
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(s);
  }
  const groups = [];
  for (const list of byTitle.values()) {
    const used = new Set();
    for (const a of list) {
      if (used.has(a.id)) continue;
      const twins = list.filter((b) => !used.has(b.id) && (b.id === a.id || sameSong(a, b)));
      if (twins.length > 1) { twins.forEach((t) => used.add(t.id)); groups.push({ kind: 'same-song', key: songFingerprint(a), songs: twins }); }
    }
  }
  // versions: the same title once version words are removed, and the film or singers agree, but they are not the same song
  const byVariantTitle = new Map();
  for (const s of songs) {
    if (!s?.id || !s.title) continue;
    const key = variantKey(s).split('|')[0];
    if (!byVariantTitle.has(key)) byVariantTitle.set(key, []);
    byVariantTitle.get(key).push(s);
  }
  for (const list of byVariantTitle.values()) {
    const used = new Set();
    for (const a of list) {
      if (used.has(a.id)) continue;
      const cluster = list.filter((b) => !used.has(b.id) && (b.id === a.id || sameVariant(a, b)));
      cluster.forEach((c) => used.add(c.id));
      const distinct = [];
      for (const s of cluster) if (!distinct.some((d) => sameSong(d, s))) distinct.push(s);
      if (distinct.length > 1) groups.push({ kind: 'versions', key: variantKey(a), songs: cluster });
    }
  }
  return groups.sort((x, y) => y.songs.length - x.songs.length);
}

/**
 * Fuzzy duplicate clusters (same song under another id, spelling, album or compilation) with the copy that would be shown.
 * Report only. Uses the same rules as the queue and the related endpoint (identity.js: isSameSong).
 */
export function findCanonicalClusters(songs) {
  return clusterSongs(songs).groups
    .filter((g) => g.songs.length > 1)
    .sort((a, b) => b.songs.length - a.songs.length);
}
