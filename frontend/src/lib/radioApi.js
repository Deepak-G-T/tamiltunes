import api from '../services/api';

/**
 * Related songs for the radio queue. Shaped for `runRefill({ fetchRelated })` in radioQueue.js.
 * `exclude` is sent as a comma-separated list (the server accepts up to 200 ids, ~8 KB).
 * @param {{ seedId: string, exclude?: string[], limit?: number }} req
 * @returns {Promise<object[]>} songs (each with a `why` label such as "Same singer")
 */
export async function fetchRelated({ seedId, exclude = [], limit = 20 }) {
  const { data } = await api.get(`/songs/${encodeURIComponent(seedId)}/related`, {
    params: { limit, ...(exclude.length ? { exclude: exclude.join(',') } : {}) },
  });
  return data?.items ?? [];
}
