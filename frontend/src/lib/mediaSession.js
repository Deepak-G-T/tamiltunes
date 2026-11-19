const ARTWORK_SIZES = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512'];

/** Lock-screen artwork: the song's cover at every size Android asks for, or the app icon when the song has no cover. */
export function mediaArtwork(song, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  if (song?.image) return ARTWORK_SIZES.map((sizes) => ({ src: song.image, sizes, type: /\.png(\?|$)/i.test(song.image) ? 'image/png' : 'image/jpeg' }));
  return [
    { src: `${origin}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${origin}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
  ];
}
