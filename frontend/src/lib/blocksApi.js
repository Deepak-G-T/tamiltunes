import api from '../services/api';

// "Don't recommend this": songs (and their versions) a signed-in listener never wants in a radio, Daily Mix or Home shelf.
// Only the song id is sent; the server looks the song up itself.
export const listBlocks = async () => (await api.get('/me/blocks')).data?.items ?? [];
export const blockSongById = async (songId) => (await api.post('/me/blocks', { songId })).data?.item ?? null;
export const unblockSongById = async (songId) => { await api.delete(`/me/blocks/${encodeURIComponent(songId)}`); };
