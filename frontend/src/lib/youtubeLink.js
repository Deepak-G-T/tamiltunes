// Pull the 11-character YouTube video id out of whatever an admin pastes: a watch link, youtu.be, shorts, embed, live, a music.youtube.com link, or the bare id.
// Anything else (another website, a playlist-only link, a channel, text) gives null. Pure: no network.
const ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);

export function parseYouTubeId(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (ID.test(text)) return text;
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const seg = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (host === 'youtu.be') id = seg[0];
  else if (YOUTUBE_HOSTS.has(host)) {
    if (seg[0] === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(seg[0])) id = seg[1];
  }
  return id && ID.test(id) ? id : null;
}

export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/** Titles that are probably not a real video song (the player prefers official video songs). A hint for the admin, never a block. */
export const looksLikeNotAVideoSong = (title) => /\b(lyric|lyrics|audio|jukebox|teaser|trailer|karaoke|8d|slowed|reverb|live)\b/i.test(String(title || ''));

/** What to tell an admin when a request fails. */
export function explainFailure(err) {
  const status = err?.response?.status;
  if (status === 403) return 'Your account is not allowed to change videos yet. Add your user id to ADMIN_VIDEO_USER_IDS in the Render settings (and keep the admin role), then try again.';
  if (status === 401) return 'You are signed out. Sign in again.';
  if (status === 404) return 'That song was not found.';
  if (status === 400) return err?.response?.data?.message || 'That is not a valid YouTube video.';
  return err?.response?.data?.message || 'Could not reach the server. Try again.';
}
