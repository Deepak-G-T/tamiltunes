import { describe, it, expect, vi } from 'vitest';
import {
  createQueueState, playFromSearch, playFromContext, addToQueue, applyRefill, advance, MAX_QUEUE,
} from './radioQueue';
import {
  toSaved, fromSaved, sameQueue, savedIds, readGuestQueue, writeGuestQueue, getDeviceId, withRetry, isTransient, GUEST_QUEUE_KEY,
} from './queuePersist';

const S = (id) => ({ id, title: `Song ${id}`, artist: 'A', image: null, duration: 100 });
const byId = (...ids) => Object.fromEntries(ids.map((i) => [i, S(i)]));
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const radioState = () => {
  let s = playFromSearch(createQueueState(), S('c1'));
  s = applyRefill(s, ['r1', 'r2', 'r3'].map(S));
  s = addToQueue(addToQueue(s, S('u1')), S('u2'));
  return s;
};

describe('saving the queue', () => {
  it('saves only ids, in order: history, current, then upcoming with where each came from', () => {
    let s = radioState();
    s = advance(s, { reason: 'skip' }).state; // u1 plays, c1 goes to history
    const saved = toSaved(s, { positionSec: 41.7, deviceId: 'dev1' });
    expect(saved.items).toEqual([{ id: 'c1', o: 'r' }, { id: 'u1', o: 'r' }, { id: 'u2', o: 'u' }, { id: 'r1', o: 'r' }, { id: 'r2', o: 'r' }, { id: 'r3', o: 'r' }]);
    expect(saved.currentIndex).toBe(1);
    expect(saved.positionSec).toBe(41);
    expect(saved.deviceId).toBe('dev1');
    expect(JSON.stringify(saved)).not.toMatch(/title|streamUrl|artist/);
  });

  it('saves nothing before anything has played', () => {
    expect(toSaved(createQueueState())).toBeNull();
  });

  it('keeps at most 50 history songs and 500 upcoming songs', () => {
    let s = playFromSearch(createQueueState(), S('s0'));
    for (let i = 1; i <= 70; i++) s = playFromSearch(s, S(`s${i}`));
    s = { ...s, upcoming: Array.from({ length: 700 }, (_, i) => ({ uid: `u${i}`, song: S(`q${i}`), origin: 'radio' })) };
    const saved = toSaved(s);
    expect(saved.currentIndex).toBe(50);
    expect(saved.items.length).toBe(50 + 1 + MAX_QUEUE);
  });

  it('skips ids the server would refuse', () => {
    let s = playFromSearch(createQueueState(), S('ok'));
    s = applyRefill(s, [S('fine'), { id: 'has space', title: 'x' }, S('x/../y')]);
    expect(toSaved(s).items.map((i) => i.id)).toEqual(['ok', 'fine']);
  });

  it('knows when only the position changed', () => {
    const s = radioState();
    expect(sameQueue(toSaved(s, { positionSec: 1 }), toSaved(s, { positionSec: 99 }))).toBe(true);
    expect(sameQueue(toSaved(s), toSaved(addToQueue(s, S('new'))))).toBe(false);
    expect(savedIds(toSaved(s))).toEqual(['c1', 'u1', 'u2', 'r1', 'r2', 'r3']);
  });
});

describe('restoring the queue', () => {
  it('rebuilds the same queue, paused at the saved position, with ids and the user block intact', () => {
    const s = radioState();
    const saved = toSaved(s, { positionSec: 33 });
    const r = fromSaved(saved, byId('c1', 'u1', 'u2', 'r1', 'r2', 'r3'));
    expect(r.currentSong.id).toBe('c1');
    expect(r.positionSec).toBe(33);
    expect(r.dropped).toBe(0);
    expect(r.state.upcoming.map((e) => e.song.id)).toEqual(['u1', 'u2', 'r1', 'r2', 'r3']);
    expect(r.state.userCount).toBe(2);
    expect(r.state.upcoming.map((e) => e.origin)).toEqual(['user', 'user', 'radio', 'radio', 'radio']);
    expect(new Set(r.state.upcoming.map((e) => e.uid)).size).toBe(5);
  });

  it('drops songs that no longer exist', () => {
    const saved = toSaved(radioState(), { positionSec: 10 });
    const r = fromSaved(saved, byId('c1', 'u1', 'r2', 'r3')); // u2 and r1 are gone
    expect(r.state.upcoming.map((e) => e.song.id)).toEqual(['u1', 'r2', 'r3']);
    expect(r.state.userCount).toBe(1);
    expect(r.dropped).toBe(2);
    expect(r.positionSec).toBe(10);
  });

  it('when the playing song is gone, the next one starts from 0:00', () => {
    const saved = toSaved(radioState(), { positionSec: 70 });
    const r = fromSaved(saved, byId('u1', 'u2', 'r1'));
    expect(r.currentSong.id).toBe('u1');
    expect(r.positionSec).toBe(0);
    expect(r.state.upcoming.map((e) => e.song.id)).toEqual(['u2', 'r1']);
    expect(r.dropped).toBe(3);
  });

  it('when only earlier songs are left, the last of them becomes current', () => {
    let s = playFromSearch(createQueueState(), S('a'));
    s = applyRefill(s, [S('b')]);
    s = advance(s).state; // b plays, a in history
    const r = fromSaved(toSaved(s, { positionSec: 5 }), byId('a'));
    expect(r.currentSong.id).toBe('a');
    expect(r.positionSec).toBe(0);
    expect(r.state.upcoming).toEqual([]);
  });

  it('returns null when nothing survives or the save is empty or broken', () => {
    const saved = toSaved(radioState());
    expect(fromSaved(saved, {})).toBeNull();
    expect(fromSaved(null, {})).toBeNull();
    expect(fromSaved({ items: [] }, {})).toBeNull();
    expect(fromSaved({ items: 'x' }, {})).toBeNull();
  });

  it('a user-marked song after a radio song is treated as radio, so user songs stay a prefix', () => {
    const saved = { items: [{ id: 'c', o: 'r' }, { id: 'a', o: 'u' }, { id: 'b', o: 'r' }, { id: 'd', o: 'u' }], currentIndex: 0, positionSec: 0, shuffle: false, repeat: 'off', autoplay: true, mode: 'radio' };
    const r = fromSaved(saved, byId('c', 'a', 'b', 'd'));
    expect(r.state.userCount).toBe(1);
    expect(r.state.upcoming.map((e) => e.origin)).toEqual(['user', 'radio', 'radio']);
  });

  it('restores a playlist queue with its source name, shuffle and repeat', () => {
    let s = playFromContext(createQueueState(), { songs: [S('p1'), S('p2'), S('p3')], index: 0, label: 'My mix' });
    s = { ...s, repeat: 'all', shuffle: true };
    const r = fromSaved(toSaved(s), byId('p1', 'p2', 'p3'));
    expect(r.state.mode).toBe('context');
    expect(r.state.context.label).toBe('My mix');
    expect(r.state.context.songs.map((x) => x.id)).toEqual(['p1', 'p2', 'p3']);
    expect(r.state.repeat).toBe('all');
    expect(r.state.shuffle).toBe(true);
  });

  it('a corrupt index is clamped instead of crashing', () => {
    const r = fromSaved({ items: [{ id: 'a', o: 'r' }, { id: 'b', o: 'r' }], currentIndex: 99, positionSec: 'x', mode: 'radio' }, byId('a', 'b'));
    expect(r.currentSong.id).toBe('b');
    expect(r.positionSec).toBe(0);
  });
});

describe('browser storage', () => {
  it('keeps a guest queue across refreshes and ignores junk', () => {
    const st = memory();
    expect(readGuestQueue(st)).toBeNull();
    const saved = toSaved(radioState());
    writeGuestQueue(st, saved);
    expect(readGuestQueue(st).items).toEqual(saved.items);
    st.setItem(GUEST_QUEUE_KEY, '{not json');
    expect(readGuestQueue(st)).toBeNull();
    writeGuestQueue(st, saved);
    writeGuestQueue(st, null);
    expect(readGuestQueue(st)).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    const blocked = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
    expect(() => writeGuestQueue(blocked, toSaved(radioState()))).not.toThrow();
    expect(readGuestQueue(blocked)).toBeNull();
    expect(getDeviceId(blocked)).toMatch(/^d/);
  });

  it('gives this browser a stable device id', () => {
    const st = memory();
    const a = getDeviceId(st);
    expect(getDeviceId(st)).toBe(a);
    expect(a).toMatch(/^[\w-]{1,64}$/);
  });
});

describe('quiet retries', () => {
  const err = (status) => Object.assign(new Error('x'), status === undefined ? {} : { response: { status } });
  it('treats network errors and gateway errors as transient, real answers as final', () => {
    for (const st of [undefined, 502, 503, 504, 500, 408]) expect(isTransient(err(st))).toBe(true);
    for (const st of [400, 401, 403, 404, 413, 429]) expect(isTransient(err(st))).toBe(false);
  });

  it('retries a request that fails while the server wakes up, then succeeds without an error', async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const result = await withRetry(async () => { calls++; if (calls < 3) throw err(503); return 'ok'; }, { sleep });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('does not retry a real error', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw err(401); }, { sleep: async () => {} })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('gives up after the last retry and throws, so the caller can stay quiet', async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw err(undefined); }, { retries: 2, sleep: async () => {} })).rejects.toThrow();
    expect(calls).toBe(3);
  });
});
