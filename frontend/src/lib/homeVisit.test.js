import { describe, it, expect } from 'vitest';
import { newVisit, readShown, writeShown, MAX_SHOWN, SHOWN_KEY } from './homeVisit';
import { recordGuestPlay, topGuestArtists } from './guestPlays';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('visit token and shown songs', () => {
  it('a token is 10 safe characters and changes every time', () => {
    const a = newVisit();
    expect(a).toMatch(/^[a-z0-9]{10}$/);
    expect(newVisit()).not.toBe(a);
  });
  it('remembers the songs shown last time, capped, without duplicates', () => {
    const s = store();
    writeShown(s, ['a', 'b', 'a', null, ...Array.from({ length: 200 }, (_, i) => `x${i}`)]);
    const ids = readShown(s);
    expect(ids.slice(0, 2)).toEqual(['a', 'b']);
    expect(ids).toHaveLength(MAX_SHOWN);
  });
  it('ignores broken or hostile storage', () => {
    const s = store();
    s.setItem(SHOWN_KEY, '{not json');
    expect(readShown(s)).toEqual([]);
    s.setItem(SHOWN_KEY, JSON.stringify(['ok', 'bad id with spaces', 5, '../x']));
    expect(readShown(s)).toEqual(['ok']);
    expect(readShown(null)).toEqual([]);
  });
  it('an empty feed does not wipe the memory', () => {
    const s = store();
    writeShown(s, ['a']);
    writeShown(s, []);
    expect(readShown(s)).toEqual(['a']);
  });
});

describe('guest favourite artists (for Daily Mix)', () => {
  it('ranks artists by plays, first two names of each song, no placeholder', () => {
    const s = store();
    const song = (id, artist) => ({ id, title: id, artist });
    for (let i = 0; i < 3; i++) recordGuestPlay(s, song('s1', 'Anirudh Ravichander, Sid Sriram'));
    recordGuestPlay(s, song('s2', 'Sid Sriram'));
    recordGuestPlay(s, song('s3', 'Tamil Artist'));
    expect(topGuestArtists(s, 6)).toEqual(['Sid Sriram', 'Anirudh Ravichander']); // Sid: 3 + 1 plays, Anirudh: 3
    expect(topGuestArtists(s, 1)).toEqual(['Sid Sriram']);
    expect(topGuestArtists(store())).toEqual([]);
  });
});
