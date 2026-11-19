import { describe, it, expect } from 'vitest';
import { controlsOptions, actionForEvent, shouldShowControls } from './nativeMedia';

describe('media notification', () => {
  const song = { title: 'Innum Konjam Neram', artist: 'Vijay Prakash', album: 'Maryan', image: 'https://c.example/a.jpg' };
  it('shows the song, with prev / next, scrubbing and no close button', () => {
    expect(controlsOptions(song, { isPlaying: true, duration: 313.4, currentTime: 12.6 })).toMatchObject({ track: 'Innum Konjam Neram', artist: 'Vijay Prakash', album: 'Maryan', cover: 'https://c.example/a.jpg', hasPrev: true, hasNext: true, hasClose: false, notificationIcon: 'ic_notification', dismissable: false, isPlaying: true, duration: 313, elapsed: 13, hasScrubbing: true });
  });
  it('has sensible defaults for a song with little data', () => {
    const o = controlsOptions({ title: 'T' });
    expect(o).toMatchObject({ artist: 'TamilTunes', album: 'TamilTunes', cover: '', duration: 0, elapsed: 0, hasScrubbing: false, isPlaying: false });
  });
  it('maps notification and headset events to player actions', () => {
    expect(actionForEvent({ message: 'music-controls-play' })).toEqual({ type: 'play' });
    expect(actionForEvent({ message: 'music-controls-pause' })).toEqual({ type: 'pause' });
    expect(actionForEvent({ message: 'music-controls-headset-unplugged' })).toEqual({ type: 'pause' });
    expect(actionForEvent({ message: 'music-controls-next' })).toEqual({ type: 'next' });
    expect(actionForEvent({ message: 'music-controls-previous' })).toEqual({ type: 'previous' });
    expect(actionForEvent({ message: 'music-controls-seek-to', position: '42.5' })).toEqual({ type: 'seek', position: 42.5 });
  });
  it('ignores events it does not use, and a seek with no position', () => {
    for (const m of ['music-controls-destroy', 'music-controls-media-button', 'music-controls-headset-plugged', 'whatever', undefined]) expect(actionForEvent({ message: m })).toBeNull();
    expect(actionForEvent({ message: 'music-controls-seek-to', position: 'abc' })).toBeNull();
    expect(actionForEvent(null)).toBeNull();
  });
  it('no notification for YouTube songs, in a browser, or with no song', () => {
    expect(shouldShowControls({ native: true, song, engine: 'audio' })).toBe(true);
    expect(shouldShowControls({ native: true, song, engine: 'youtube' })).toBe(false);
    expect(shouldShowControls({ native: false, song, engine: 'audio' })).toBe(false);
    expect(shouldShowControls({ native: true, song: null, engine: 'audio' })).toBe(false);
  });
});
