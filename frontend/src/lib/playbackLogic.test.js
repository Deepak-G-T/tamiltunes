import { describe, it, expect } from 'vitest';
import {
  canToggleVideo, engineFor, hasAudioStream, isFatalEmbedError, planSwitch, planEmbedError, getVideoId, screenLockNotice
} from './playbackLogic';

const jio = { id: 'j1', source: 'audio', streamUrl: 'https://aac.saavncdn.com/a.mp4' };
const jioVideo = { ...jio, videoId: 'IqwIOlhfCak' };
const ytOnly = { id: 'yt_1', source: 'youtube', videoId: 'pYVzWlqZ388', streamUrl: 'https://www.youtube-nocookie.com/embed/x' };

describe('toggle visibility', () => {
  it('is hidden without a videoId', () => expect(canToggleVideo(jio)).toBe(false));
  it('is shown for an audio song with a videoId', () => expect(canToggleVideo(jioVideo)).toBe(true));
  it('is hidden for YouTube-only songs (no separate audio engine)', () => expect(canToggleVideo(ytOnly)).toBe(false));
  it('is hidden once that video failed to embed', () =>
    expect(canToggleVideo(jioVideo, new Set(['IqwIOlhfCak']))).toBe(false));
  it('is hidden with no song', () => expect(canToggleVideo(null)).toBe(false));
  it('hasAudioStream ignores YouTube embed URLs', () => expect(hasAudioStream(ytOnly)).toBe(false));
});

describe('engine selection', () => {
  it('a videoId alone does NOT switch an audio song to YouTube', () =>
    expect(engineFor(jioVideo, 'audio')).toBe('audio'));
  it('video mode selects YouTube', () => expect(engineFor(jioVideo, 'video')).toBe('youtube'));
  it('video mode is ignored when no videoId', () => expect(engineFor(jio, 'video')).toBe('audio'));
  it('video mode is ignored once video is unavailable', () =>
    expect(engineFor(jioVideo, 'video', new Set(['IqwIOlhfCak']))).toBe('audio'));
  it('YouTube-source songs always use YouTube', () => {
    expect(engineFor(ytOnly, 'audio')).toBe('youtube');
    expect(engineFor(ytOnly, 'video')).toBe('youtube');
  });
  it('no song defaults to audio', () => expect(engineFor(null, 'video')).toBe('audio'));
  it('exactly one engine is chosen per mode', () => {
    for (const mode of ['audio', 'video']) {
      expect(['audio', 'youtube']).toContain(engineFor(jioVideo, mode));
    }
  });
  it('getVideoId reads videoId or youtubeId', () => {
    expect(getVideoId({ youtubeId: 'abc' })).toBe('abc');
    expect(getVideoId({})).toBe(null);
  });
});

describe('mode switching', () => {
  it('allows audio -> video', () =>
    expect(planSwitch({ song: jioVideo, currentMode: 'audio', targetMode: 'video' })).toEqual({ ok: true }));
  it('allows video -> audio', () =>
    expect(planSwitch({ song: jioVideo, currentMode: 'video', targetMode: 'audio' })).toEqual({ ok: true }));
  it('refuses a no-op switch', () =>
    expect(planSwitch({ song: jioVideo, currentMode: 'audio', targetMode: 'audio' }).ok).toBe(false));
  it('refuses video when no videoId', () =>
    expect(planSwitch({ song: jio, currentMode: 'audio', targetMode: 'video' })).toEqual({ ok: false, reason: 'no-video' }));
  it('refuses audio for a YouTube-only song', () =>
    expect(planSwitch({ song: ytOnly, currentMode: 'video', targetMode: 'audio' })).toEqual({ ok: false, reason: 'no-audio' }));
});

describe('embed errors', () => {
  it('bad id (2), removed (100) and embedding off / region block (101, 150) are fatal embed errors', () => {
    for (const c of [2, 100, 101, 150]) expect(isFatalEmbedError(c)).toBe(true);
    for (const c of [5, 0, undefined, null]) expect(isFatalEmbedError(c)).toBe(false);
  });
  it('falls back to audio for a toggleable song', () =>
    expect(planEmbedError({ song: jioVideo, code: 101 })).toEqual({ action: 'fallback-audio', videoId: 'IqwIOlhfCak' }));
  it('falls back on 150 too', () =>
    expect(planEmbedError({ song: jioVideo, code: 150 }).action).toBe('fallback-audio'));
  it('YouTube-only songs keep the existing skip behaviour', () =>
    expect(planEmbedError({ song: ytOnly, code: 101 })).toEqual({ action: 'skip' }));
  it('other codes (5 = player error) keep the existing skip behaviour', () =>
    expect(planEmbedError({ song: jioVideo, code: 5 })).toEqual({ action: 'skip' }));
});

describe('screen-lock notice (YouTube pauses when the screen locks)', () => {
  const yt = { id: 'yt_abc', source: 'youtube', videoId: 'abc', title: 'T' };
  const both = { id: 'saavn_1', streamUrl: 'https://x/a.mp4', videoId: 'abc', title: 'T' };
  it('a YouTube song shows the notice, with no audio switch offered when it has no audio stream', () => {
    expect(screenLockNotice(yt, 'youtube')).toEqual({ text: 'This song pauses when the screen locks.', canSwitchToAudio: false });
  });
  it('a song in video mode offers switching to audio', () => expect(screenLockNotice(both, 'youtube').canSwitchToAudio).toBe(true));
  it('audio-engine songs and no song show nothing', () => {
    expect(screenLockNotice(both, 'audio')).toBeNull();
    expect(screenLockNotice(null, 'youtube')).toBeNull();
  });
});
