import { describe, it, expect } from 'vitest';
import { pathFromLink } from './native';

const HOST = 'frontend-eosin-five-11.vercel.app';
describe('deep links', () => {
  it('opens profiles, albums, artists, playlists and search', () => {
    expect(pathFromLink(`https://${HOST}/u/deepak`, HOST)).toBe('/u/deepak');
    expect(pathFromLink(`https://${HOST}/album/abc?x=1#top`, HOST)).toBe('/album/abc?x=1#top');
    expect(pathFromLink(`https://${HOST}/artist/9`, HOST)).toBe('/artist/9');
    expect(pathFromLink(`https://${HOST}/playlist/p1`, HOST)).toBe('/playlist/p1');
    expect(pathFromLink(`https://${HOST}/search?q=kadhal`, HOST)).toBe('/search?q=kadhal');
  });
  it('a song link opens the app at home (there is no song page)', () => {
    expect(pathFromLink(`https://${HOST}/song`, HOST)).toBe('/');
    expect(pathFromLink(`https://${HOST}/song/saavn_1`, HOST)).toBe('/');
  });
  it('the home page itself', () => expect(pathFromLink(`https://${HOST}/`, HOST)).toBe('/'));
  it('ignores other hosts, pages we do not open from a link, and junk', () => {
    expect(pathFromLink('https://evil.example/u/x', HOST)).toBeNull();
    expect(pathFromLink(`https://${HOST}/admin`, HOST)).toBeNull();
    expect(pathFromLink(`https://${HOST}/reset-password?token=abc`, HOST)).toBeNull();
    expect(pathFromLink(`https://${HOST}/login`, HOST)).toBeNull();
    expect(pathFromLink(`https://${HOST}/searchfoo`, HOST)).toBeNull();
    expect(pathFromLink(`https://${HOST}/songs`, HOST)).toBeNull();
    expect(pathFromLink('not a url', HOST)).toBeNull();
    expect(pathFromLink(undefined, HOST)).toBeNull();
  });
});
