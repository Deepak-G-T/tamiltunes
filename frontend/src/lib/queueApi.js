import api from '../services/api';
import { withRetry } from './queuePersist';
import { getToken } from './tokenStore';

// The server may be waking from idle (Render) or its database may be (Neon). Transient failures are retried quietly;
// a real answer (401, 400 ...) is not. Callers decide whether a final failure is worth mentioning (it usually is not).

/** @returns {Promise<{ queue: object | null, songs: Record<string, object> }>} */
export const loadServerQueue = () =>
  withRetry(async () => {
    const { data } = await api.get('/me/queue');
    return { queue: data?.queue ?? null, songs: data?.songs ?? {} };
  });

export const loadServerQueueMeta = () => withRetry(async () => (await api.get('/me/queue/meta')).data?.meta ?? null);

export const saveServerQueue = (saved) => withRetry(async () => (await api.put('/me/queue', saved)).data);

/** Ids -> songs (guests, and the fallback when a signed-in user has only a browser copy). At most 100 ids per request. */
export async function resolveSongIds(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await withRetry(() => api.post('/music/songs/resolve', { ids: chunk }));
    Object.assign(out, data?.songs ?? {});
  }
  return out;
}

/** Best-effort save while the page is closing or hidden: keepalive lets the request finish after the tab is gone. */
export function saveServerQueueOnExit(saved) {
  try {
    const token = getToken();
    if (!token) return;
    fetch(`${api.defaults.baseURL}/me/queue`, {
      method: 'PUT',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(saved),
    }).catch(() => {});
  } catch { /* closing anyway */ }
}
