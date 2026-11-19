/** Standard YouTube thumbnail (320 x 180, 16:9) for a video id, or null. Loaded lazily by <img loading="lazy">; never stored. */
export const youtubeThumb = (videoId, size = 'mqdefault') => (/^[A-Za-z0-9_-]{11}$/.test(String(videoId || '')) ? `https://i.ytimg.com/vi/${videoId}/${size}.jpg` : null);
