import { describe, it, expect } from 'vitest';
import { readVideoPrefs, writeVideoPrefs, videoBlockedByData, DEFAULT_PREFS, PREFS_KEY } from './videoPrefs';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('video settings', () => {
  it('defaults: prefer video off, Wi-Fi only on', () => expect(readVideoPrefs(store())).toEqual({ preferVideo: false, wifiOnly: true }));
  it('saves and reads back, one setting at a time', () => {
    const s = store();
    writeVideoPrefs(s, { preferVideo: true });
    expect(readVideoPrefs(s)).toEqual({ preferVideo: true, wifiOnly: true });
    writeVideoPrefs(s, { wifiOnly: false });
    expect(readVideoPrefs(s)).toEqual({ preferVideo: true, wifiOnly: false });
  });
  it('broken or odd storage falls back to the defaults', () => {
    const s = store();
    s.setItem(PREFS_KEY, '{not json');
    expect(readVideoPrefs(s)).toEqual({ ...DEFAULT_PREFS });
    s.setItem(PREFS_KEY, JSON.stringify({ preferVideo: 'yes', wifiOnly: 0 }));
    expect(readVideoPrefs(s)).toEqual({ ...DEFAULT_PREFS });
    expect(readVideoPrefs(null)).toEqual({ ...DEFAULT_PREFS });
  });
  it('Wi-Fi only blocks video on mobile data only', () => {
    expect(videoBlockedByData({ wifiOnly: true }, 'cellular')).toBe(true);
    expect(videoBlockedByData({ wifiOnly: true }, 'wifi')).toBe(false);
    expect(videoBlockedByData({ wifiOnly: true }, undefined)).toBe(false); // unknown (most desktop browsers): allowed
    expect(videoBlockedByData({ wifiOnly: false }, 'cellular')).toBe(false);
  });
});
