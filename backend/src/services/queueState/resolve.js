/**
 * Turn song ids into song objects. The database is asked once for all of them; ids it does not know are looked up
 * with the music provider (a few at a time, capped), and found songs are saved so the next restore is a single query.
 * Ids that cannot be resolved are simply absent from the result: the caller drops them ("no longer exists").
 */
export const MAX_PROVIDER_LOOKUPS = 40;
const CONCURRENCY = 6;

const present = (s) => ({
  id: s.id,
  title: s.title,
  artist: s.artist || s.singers || 'Unknown artist',
  album: s.album ?? null,
  image: s.image ?? null,
  duration: Number(s.duration) || 0,
  streamUrl: s.streamUrl ?? null,
  ...(s.videoId ? { videoId: s.videoId } : {}),
});

/**
 * @param {string[]} ids
 * @param {{ byIds: (ids: string[]) => Promise<object[]>, fetchOne: (id: string) => Promise<object | null>, save?: (song: object) => Promise<void> }} io
 * @returns {Promise<Record<string, object>>}
 */
export async function resolveSongs(ids, { byIds, fetchOne, save, maxLookups = MAX_PROVIDER_LOOKUPS }) {
  const unique = [...new Set(ids.filter((i) => typeof i === 'string' && i))];
  const out = {};
  for (const s of await byIds(unique)) if (s?.id) out[s.id] = present(s);

  const missing = unique.filter((id) => !out[id]).slice(0, maxLookups);
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const id = missing[next++];
      try {
        const song = await fetchOne(id);
        if (song?.id && song.title) {
          out[id] = present(song);
          if (save) await save(song).catch(() => {});
        }
      } catch { /* provider hiccup: treat as gone for now */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
  return out;
}
