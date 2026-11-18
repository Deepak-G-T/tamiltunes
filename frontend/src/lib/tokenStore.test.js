import { describe, it, expect, beforeEach, vi } from 'vitest';

const prefs = new Map();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }) => ({ value: prefs.has(key) ? prefs.get(key) : null }),
    set: async ({ key, value }) => { prefs.set(key, value); },
    remove: async ({ key }) => { prefs.delete(key); },
  },
}));

// the unit tests run in plain Node: give them a small localStorage and window
const makeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; };
const localStorage = makeStorage();
globalThis.localStorage = localStorage;
globalThis.window = {};
const loadStore = async () => { vi.resetModules(); return import('./tokenStore'); };

describe('token store: website', () => {
  beforeEach(() => { localStorage.clear(); prefs.clear(); delete globalThis.window.Capacitor; });
  it('keeps the token in localStorage, as before', async () => {
    const t = await loadStore();
    expect(t.getToken()).toBeNull();
    await t.setToken('abc');
    expect(localStorage.getItem('tamiltunes_token')).toBe('abc');
    expect(t.getToken()).toBe('abc');
    await t.clearToken();
    expect(localStorage.getItem('tamiltunes_token')).toBeNull();
    expect(prefs.size).toBe(0);
  });
  it('reads an existing token before init too', async () => {
    localStorage.setItem('tamiltunes_token', 'old');
    const t = await loadStore();
    expect(t.getToken()).toBe('old');
    expect(await t.initTokenStore()).toBe('old');
  });
});

describe('token store: Android app (private storage)', () => {
  beforeEach(() => { localStorage.clear(); prefs.clear(); globalThis.window.Capacitor = { isNativePlatform: () => true }; });
  it('loads the saved token from private storage at start', async () => {
    prefs.set('tamiltunes_token', 'secret');
    const t = await loadStore();
    expect(await t.initTokenStore()).toBe('secret');
    expect(t.getToken()).toBe('secret');
  });
  it('stores a new token only in private storage, never in localStorage', async () => {
    const t = await loadStore();
    await t.initTokenStore();
    await t.setToken('fresh');
    expect(prefs.get('tamiltunes_token')).toBe('fresh');
    expect(localStorage.getItem('tamiltunes_token')).toBeNull();
    expect(t.getToken()).toBe('fresh');
    await t.clearToken();
    expect(prefs.has('tamiltunes_token')).toBe(false);
    expect(t.getToken()).toBeNull();
  });
  it('moves a token left in localStorage by an older version into private storage and removes it', async () => {
    localStorage.setItem('tamiltunes_token', 'legacy');
    const t = await loadStore();
    expect(await t.initTokenStore()).toBe('legacy');
    expect(prefs.get('tamiltunes_token')).toBe('legacy');
    expect(localStorage.getItem('tamiltunes_token')).toBeNull();
  });
});
