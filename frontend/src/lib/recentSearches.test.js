import { describe, it, expect } from 'vitest';
import {
  addRecent, removeRecent, migrateRecent, loadRecent, saveRecent, normalizeQuery, queryKey, isSavable,
  MAX_RECENT, RECENT_KEY, LEGACY_RECENT_KEY,
} from './recentSearches';

const memory = (seed = {}) => { const m = new Map(Object.entries(seed)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

describe('what counts as a search', () => {
  it('trims and collapses spaces, and ignores one-character queries', () => {
    expect(normalizeQuery('  ambala   song ')).toBe('ambala song');
    expect(isSavable('a')).toBe(false);
    expect(isSavable('   a ')).toBe(false);
    expect(isSavable('am')).toBe(true);
    expect(isSavable('')).toBe(false);
    expect(isSavable(null)).toBe(false);
  });
  it('counts a Tamil letter with its vowel sign as one character', () => {
    expect(isSavable('கொ')).toBe(false); // one perceived character (two code points)
    expect(isSavable('கொல')).toBe(true);
  });
  it('compares without caring about case, and with one Unicode form', () => {
    expect(queryKey('LEO')).toBe(queryKey(' leo '));
    expect(queryKey('கொ'.normalize('NFD'))).toBe(queryKey('கொ'.normalize('NFC')));
  });
});

describe('saving a committed search', () => {
  it('pressing Enter on "ambala" saves exactly one entry', () => {
    const list = addRecent([], 'ambala');
    expect(list).toEqual(['ambala']);
  });
  it('"ambala" then "ambala song" leaves one entry (the longer one)', () => {
    let list = addRecent([], 'ambala');
    list = addRecent(list, 'ambala song');
    expect(list).toEqual(['ambala song']);
  });
  it('the half-typed words never pile up even if they were somehow saved in order', () => {
    let list = [];
    for (const q of ['am', 'amba', 'ambala']) list = addRecent(list, q);
    expect(list).toEqual(['ambala']);
  });
  it('a repeated search moves to the top and is not duplicated (any case or spacing)', () => {
    let list = ['Leo', 'Master', 'Jailer'];
    list = addRecent(list, '  jailer ');
    expect(list).toEqual(['jailer', 'Leo', 'Master']);
    list = addRecent(list, 'LEO');
    expect(list).toEqual(['LEO', 'jailer', 'Master']);
  });
  it('keeps the newest spelling of a repeated search', () => {
    expect(addRecent(['leo'], 'Leo')).toEqual(['Leo']);
  });
  it('ignores a query that is too short', () => {
    const list = ['Leo'];
    expect(addRecent(list, 'a')).toBe(list);
    expect(addRecent(list, '  ')).toBe(list);
  });
  it('works with Tamil text', () => {
    let list = addRecent([], 'கொலவெறி');
    list = addRecent(list, 'கொலவெறி பாடல்');
    expect(list).toEqual(['கொலவெறி பாடல்']);
    list = addRecent(list, 'கொலவெறி பாடல்'.normalize('NFD'));
    expect(list).toHaveLength(1);
  });
  it('does not drop an unrelated search that merely shares a letter', () => {
    expect(addRecent(['Master'], 'Leo')).toEqual(['Leo', 'Master']);
  });
  it('keeps at most 10, newest first', () => {
    let list = [];
    for (let i = 1; i <= 14; i++) list = addRecent(list, `search ${String.fromCharCode(96 + i)}${i}`);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe('search n14');
    expect(list.at(-1)).toBe('search e5');
  });
  it('does not change the list it was given', () => {
    const list = Object.freeze(['Leo']);
    expect(() => addRecent(list, 'Master')).not.toThrow();
    expect(list).toEqual(['Leo']);
  });
  it('removes one entry', () => {
    expect(removeRecent(['Leo', 'Master'], 'leo')).toEqual(['Master']);
  });
});

describe('cleaning an existing list (one time)', () => {
  const example = ['Ponniyin Selvan', 'Leo', 'Master', 'ko', 'aambala', 'ambala', 'amba', 'am'];
  it('drops the half-typed entries and keeps the full searches', () => {
    expect(migrateRecent(example)).toEqual(['Ponniyin Selvan', 'Leo', 'Master', 'ko', 'aambala', 'ambala']);
  });
  it('removes one-character entries, repeats and junk', () => {
    expect(migrateRecent(['a', 'Leo', 'leo', '', 5, null, 'Master'])).toEqual(['Leo', 'Master']);
    expect(migrateRecent('nope')).toEqual([]);
  });
  it('keeps a short entry that no longer entry starts with ("ko")', () => {
    expect(migrateRecent(['ko', 'Leo'])).toContain('ko');
  });
  it('caps the cleaned list at 10', () => {
    const many = Array.from({ length: 15 }, (_, i) => `song ${String.fromCharCode(97 + i)}`);
    expect(migrateRecent(many)).toHaveLength(10);
  });
  it('runs once: the old key is cleaned into the new key and removed', () => {
    const st = memory({ [LEGACY_RECENT_KEY]: JSON.stringify(example) });
    expect(loadRecent(st)).toEqual(['Ponniyin Selvan', 'Leo', 'Master', 'ko', 'aambala', 'ambala']);
    expect(st.getItem(LEGACY_RECENT_KEY)).toBeNull();
    expect(JSON.parse(st.getItem(RECENT_KEY))).toHaveLength(6);
    // a second load reads the new key and does not look at the old one again
    st.setItem(LEGACY_RECENT_KEY, JSON.stringify(['zzz']));
    expect(loadRecent(st)).not.toContain('zzz');
  });
  it('an empty or missing old list gives an empty list, and bad data does not crash', () => {
    expect(loadRecent(memory())).toEqual([]);
    expect(loadRecent(memory({ [LEGACY_RECENT_KEY]: '{not json' }))).toEqual([]);
    expect(loadRecent(null)).toEqual([]);
  });
  it('saving and loading round-trips, and blocked storage never throws', () => {
    const st = memory();
    saveRecent(st, ['Leo', 'Master']);
    expect(loadRecent(st)).toEqual(['Leo', 'Master']);
    const blocked = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
    expect(() => saveRecent(blocked, ['Leo'])).not.toThrow();
    expect(loadRecent(blocked)).toEqual([]);
  });
});
