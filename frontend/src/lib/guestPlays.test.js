import { describe, it, expect } from 'vitest';
import { GUEST_KEY, MAX_GUEST_SONGS, recordGuestPlay, topGuestSongs, exportGuestPlays, clearGuestPlays, migrateGuestPlays, loadGuestPlays } from './guestPlays';
import { guestItems } from './speedDialOps';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
const S = (id) => ({ id, title: `Song ${id}`, artist: 'A', image: `i/${id}.jpg`, duration: 200, streamUrl: `s/${id}` });
const DAY = 86400e3;
const NOW = Date.UTC(2026, 10, 20);

describe('guest play counts', () => {
  it('counts plays per song and ranks by count with recency decay', () => {
    const st = memoryStorage();
    for (let i = 0; i < 3; i++) recordGuestPlay(st, S('a'), NOW - 1 * DAY);
    recordGuestPlay(st, S('b'), NOW - 1 * DAY);
    for (let i = 0; i < 6; i++) recordGuestPlay(st, S('old'), NOW - 30 * DAY); // more plays, but a month ago
    for (let i = 0; i < 9; i++) recordGuestPlay(st, S('gone'), NOW - 120 * DAY); // many plays, long forgotten
    const top = topGuestSongs(st, 9, NOW);
    expect(top.map((g) => g.song.id)).toEqual(['a', 'old', 'b']);
    expect(top[0].count).toBe(3);
    expect(top.find((g) => g.song.id === 'old').count).toBe(6);
  });

  it('ignores songs that have decayed to nothing', () => {
    const st = memoryStorage();
    recordGuestPlay(st, S('ancient'), NOW - 400 * DAY);
    expect(topGuestSongs(st, 9, NOW)).toEqual([]);
  });

  it('keeps only the most recent songs', () => {
    const st = memoryStorage();
    for (let i = 0; i < MAX_GUEST_SONGS + 10; i++) recordGuestPlay(st, S(`s${i}`), NOW + i);
    const data = loadGuestPlays(st);
    expect(Object.keys(data)).toHaveLength(MAX_GUEST_SONGS);
    expect(data.s0).toBeUndefined();
    expect(data[`s${MAX_GUEST_SONGS + 9}`]).toBeDefined();
  });

  it('survives corrupt or blocked storage', () => {
    const st = memoryStorage();
    st.setItem(GUEST_KEY, '{not json');
    expect(loadGuestPlays(st)).toEqual({});
    expect(() => recordGuestPlay(st, S('a'))).not.toThrow();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(() => recordGuestPlay(broken, S('a'))).not.toThrow();
    expect(topGuestSongs(broken)).toEqual([]);
  });

  it('exports a valid import payload without stream urls', () => {
    const st = memoryStorage();
    recordGuestPlay(st, S('a'), NOW);
    recordGuestPlay(st, S('a'), NOW);
    const out = exportGuestPlays(st);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ count: 2, song: { id: 'a', title: 'Song a' } });
    expect(out[0].song.streamUrl).toBeUndefined();
    expect(new Date(out[0].lastAt).getTime()).toBe(NOW);
  });

  it('migrates on sign-in and clears the counts; keeps them when the import fails', async () => {
    const st = memoryStorage();
    recordGuestPlay(st, S('a'));
    const sent = [];
    expect(await migrateGuestPlays(st, async (p) => { sent.push(p); })).toBe(true);
    expect(sent[0][0].song.id).toBe('a');
    expect(loadGuestPlays(st)).toEqual({});
    recordGuestPlay(st, S('b'));
    expect(await migrateGuestPlays(st, async () => { throw new Error('offline'); })).toBe(false);
    expect(Object.keys(loadGuestPlays(st))).toEqual(['b']); // still there for next time
    expect(await migrateGuestPlays(memoryStorage(), async () => { throw new Error('should not be called'); })).toBe(false);
    clearGuestPlays(st);
    expect(loadGuestPlays(st)).toEqual({});
  });

  it('builds the logged-out grid: own top songs first, then unplayed trending songs', () => {
    const top = [{ song: S('a'), count: 5 }, { song: S('b'), count: 2 }];
    const trending = ['a', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'].map(S);
    const items = guestItems(top, trending, 9);
    expect(items).toHaveLength(9);
    expect(items.slice(0, 2).map((i) => [i.id, i.source, i.playCount])).toEqual([['a', 'played', 5], ['b', 'played', 2]]);
    expect(items.slice(2).every((i) => i.source === 'suggested')).toBe(true);
    expect(items.filter((i) => i.id === 'a')).toHaveLength(1);
    expect(items.map((i) => i.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(items.filter((i) => i.hot).map((i) => i.id)).toEqual(['a', 'b']);
  });
});
