import api from '../services/api';

/** The saved picks, the choices to show, and whether to show the picker now. */
export const loadTaste = async () => (await api.get('/me/taste')).data;
export const saveTaste = async (payload) => (await api.put('/me/taste', payload)).data?.taste ?? null;
export const forgetTaste = async () => { await api.delete('/me/taste'); };
