import api from '../services/api';

const enc = encodeURIComponent;
const msg = (err, fallback) => Object.assign(new Error(err?.response?.data?.message || fallback), { status: err?.response?.status });
const run = async (p, fallback) => {
  try {
    return (await p).data;
  } catch (err) {
    throw msg(err, fallback);
  }
};

export const speedDialApi = {
  get: () => run(api.get('/me/speed-dial'), 'Could not load your Speed Dial.'),
  pin: (songId, slot, song) => run(api.post('/me/speed-dial/pin', { songId, ...(slot != null ? { slot } : {}), ...(song ? { song } : {}) }), 'Could not pin that song.'),
  unpin: (songId) => run(api.delete(`/me/speed-dial/${enc(songId)}/pin`), 'Could not unpin that song.'),
  hide: (songId) => run(api.delete(`/me/speed-dial/${enc(songId)}`), 'Could not remove that song.'),
  order: (order, moved) => run(api.put('/me/speed-dial/order', { order, ...(moved ? { moved } : {}) }), 'Could not save the new order.'),
  reset: () => run(api.delete('/me/speed-dial'), 'Could not reset your Speed Dial.'),
  importPlays: (plays) => run(api.post('/me/speed-dial/import', { plays }), 'Could not import your plays.'),
  recordPlay: (event) => run(api.post('/me/play-events', event), 'Could not record the play.'),
};
