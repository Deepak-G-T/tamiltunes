import { describe, it, expect } from 'vitest';
import { mediaArtwork } from './mediaSession';

describe('lock-screen artwork', () => {
  it('uses the cover at several sizes', () => {
    const a = mediaArtwork({ image: 'https://c.example/cover_500x500.jpg' }, 'https://app.example');
    expect(a.map((x) => x.sizes)).toEqual(['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']);
    expect(a.every((x) => x.src === 'https://c.example/cover_500x500.jpg' && x.type === 'image/jpeg')).toBe(true);
  });
  it('knows a png cover', () => expect(mediaArtwork({ image: 'https://c.example/a.png?x=1' })[0].type).toBe('image/png'));
  it('falls back to the app icon, with absolute urls', () => {
    const a = mediaArtwork({ title: 'No cover' }, 'https://app.example');
    expect(a.map((x) => x.src)).toEqual(['https://app.example/icons/icon-192.png', 'https://app.example/icons/icon-512.png']);
    expect(mediaArtwork(null, 'https://app.example')).toHaveLength(2);
  });
});
