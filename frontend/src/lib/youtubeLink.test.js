import { describe, it, expect } from 'vitest';
import { parseYouTubeId, watchUrl, looksLikeNotAVideoSong, explainFailure } from './youtubeLink';

const ID = 'ZdMZ40GSVmc';
describe('parseYouTubeId', () => {
  it('reads every common link form', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`, `https://youtube.com/watch?v=${ID}&t=42s`, `https://www.youtube.com/watch?feature=share&v=${ID}`,
      `https://youtu.be/${ID}`, `https://youtu.be/${ID}?si=abc123`, `https://m.youtube.com/watch?v=${ID}`, `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
      `https://www.youtube.com/embed/${ID}`, `https://www.youtube-nocookie.com/embed/${ID}`, `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/live/${ID}?feature=share`,
      `youtube.com/watch?v=${ID}`, `  https://youtu.be/${ID}  `, `http://youtu.be/${ID}`,
    ]) expect(parseYouTubeId(link), link).toBe(ID);
  });
  it('accepts the bare 11-character id', () => {
    expect(parseYouTubeId(ID)).toBe(ID);
    expect(parseYouTubeId(` ${ID}\n`)).toBe(ID);
    expect(parseYouTubeId('a-b_c-d_e-f')).toBe('a-b_c-d_e-f');
  });
  it('refuses everything that is not one video', () => {
    for (const bad of [
      '', '   ', null, undefined, 'hello', 'too-short', `${ID}X`, 'abcdefghij', // not 11 characters
      'https://www.youtube.com/playlist?list=PL1234567890abcdef', 'https://www.youtube.com/@SomeChannel', 'https://www.youtube.com/channel/UCBnxEdpoZwstJqC1yZpOjRA',
      `https://evil.example/watch?v=${ID}`, `https://youtube.com.evil.example/watch?v=${ID}`, `https://notyoutube.com/watch?v=${ID}`, `https://youtu.be.evil.example/${ID}`,
      `javascript:alert('${ID}')`, `ftp://youtu.be/${ID}`, 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch', 'https://youtu.be/',
    ]) expect(parseYouTubeId(bad), String(bad)).toBeNull();
  });
  it('builds the watch address and flags titles that are not video songs', () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(looksLikeNotAVideoSong('LEO - Badass Lyric | Thalapathy Vijay')).toBe(true);
    expect(looksLikeNotAVideoSong('Anirudh Jukebox')).toBe(true);
    expect(looksLikeNotAVideoSong('Leo - Badass Video')).toBe(false);
    expect(looksLikeNotAVideoSong('')).toBe(false);
  });
});

describe('explainFailure', () => {
  const err = (status, message) => ({ response: { status, data: message ? { message } : {} } });
  it('says what to do for each kind of failure', () => {
    expect(explainFailure(err(403))).toMatch(/ADMIN_VIDEO_USER_IDS/);
    expect(explainFailure(err(401))).toMatch(/Sign in/);
    expect(explainFailure(err(404))).toMatch(/not found/);
    expect(explainFailure(err(400, 'A YouTube video id is 11 letters'))).toBe('A YouTube video id is 11 letters');
    expect(explainFailure(err(500))).toMatch(/Try again/);
    expect(explainFailure(null)).toMatch(/Could not reach/);
  });
});
