import { describe, it, expect } from 'vitest';
import {
  canToggleVideo, engineFor, hasAudioStream, isFatalEmbedError, planSwitch, planEmbedError, getVideoId
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
  it('101 and 150 are fatal embed errors', () => {
    expect(isFatalEmbedError(101)).toBe(true);
    expect(isFatalEmbedError(150)).toBe(true);
    expect(isFatalEmbedError(2)).toBe(false);
    expect(isFatalEmbedError(undefined)).toBe(false);
  });
  it('falls back to audio for a toggleable song', () =>
    expect(planEmbedError({ song: jioVideo, code: 101 })).toEqual({ action: 'fallback-audio', videoId: 'IqwIOlhfCak' }));
  it('falls back on 150 too', () =>
    expect(planEmbedError({ song: jioVideo, code: 150 }).action).toBe('fallback-audio'));
  it('YouTube-only songs keep the existing skip behaviour', () =>
    expect(planEmbedError({ song: ytOnly, code: 101 })).toEqual({ action: 'skip' }));
  it('other codes keep the existing skip behaviour', () =>
    expect(planEmbedError({ song: jioVideo, code: 2 })).toEqual({ action: 'skip' }));
});
