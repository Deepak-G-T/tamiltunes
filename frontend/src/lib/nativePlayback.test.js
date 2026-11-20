import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The next song must start by itself with the screen locked, so the Android WebView must NOT require a tap to play audio.
// Capacitor sets this when the app starts; these tests fail if that setting is ever changed or overridden.
const root = path.resolve(__dirname, '..', '..'); // frontend/
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };

describe('Android WebView autoplay policy', () => {
  it('Capacitor starts the WebView with mediaPlaybackRequiresUserGesture = false', () => {
    const bridge = path.join(root, 'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java');
    expect(fs.existsSync(bridge)).toBe(true);
    expect(fs.readFileSync(bridge, 'utf8')).toMatch(/setMediaPlaybackRequiresUserGesture\(false\)/);
  });
  it('nothing in our Android code turns it back on', () => {
    const files = walk(path.join(root, 'android/app/src')).filter((f) => /\.(java|kt|xml)$/.test(f));
    expect(files.filter((f) => /setMediaPlaybackRequiresUserGesture\(\s*true\s*\)|mediaPlaybackRequiresUserGesture["']?\s*[:=]\s*true/i.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
    const cfg = fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8');
    expect(cfg).not.toMatch(/mediaPlaybackRequiresUserGesture/i);
  });
});

describe('the player keeps ONE audio element for every song (a new src on the same element, so a locked screen cannot block the next song)', () => {
  it('AudioContext has one playing element (audioRef); the only other Audio is the silent preloader for the next song', () => {
    const src = fs.readFileSync(path.join(root, 'src/context/AudioContext.jsx'), 'utf8');
    expect((src.match(/audioRef = useRef\(new Audio\(\)\)/g) || []).length).toBe(1);
    expect((src.match(/new Audio\(/g) || []).length).toBeLessThanOrEqual(2);
    expect((src.match(/preloadRef\.current = new Audio\(\)/g) || []).length).toBe(1);
  });
});
