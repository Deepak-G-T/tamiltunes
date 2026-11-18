import { describe, it, expect } from 'vitest';
import {
  createQueueState, playFromSearch, playFromContext, switchToRadio, advance, previous, jumpTo, addToQueue, playNext,
  removeFromUpcoming, reorderUpcoming, clearUserQueue, setShuffle, setRepeat, nextRepeat, setAutoplay, needsRefill,
  startRefill, applyRefill, refillFailed, runRefill, getSections, peekNext, toSnapshot, fromSnapshot, shuffled,
  applyFallback, toFlatQueue, removeFromHistory, indexOfUid, findQueued, moveToQueue, isQueueFull, MAX_QUEUE, removeByUids, restoreRemoved, moveManyToQueue, clearRadio, removeCurrent, setStopAfter, playFromHistory, spreadByArtist, artistKey, MAX_ARTIST_RUN, REFILL_BATCH,
  REFILL_THRESHOLD, MAX_EXCLUDE, REFILL_BACKOFF_MS,
} from './radioQueue';

const S = (id) => ({ id, title: `Song ${id}` });
const list = (...ids) => ids.map(S);
const ids = (entries) => entries.map((e) => e.song.id);
const deepFreeze = (o) => { Object.freeze(o); Object.values(o).forEach((v) => v && typeof v === 'object' && !Object.isFrozen(v) && deepFreeze(v)); return o; };
// radio batch helper: state with `current` and radio songs queued
const radio = (current, ...upcoming) => applyRefill(playFromSearch(createQueueState(), S(current)), list(...upcoming));
// deterministic rng
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('playing from search', () => {
  it('starts the song and leaves the radio to fill the queue', () => {
    const s = playFromSearch(createQueueState(), S('a'));
    expect(s.current.id).toBe('a');
    expect(s.mode).toBe('radio');
    expect(s.upcoming).toEqual([]);
    expect(s.played).toEqual(['a']);
    expect(needsRefill(s)).toBe(true); // nothing queued yet: ask the radio for songs
  });

  it('keeps user-added songs when a new search result is played, and moves the old song to history', () => {
    let s = radio('a', 'r1', 'r2');
    s = addToQueue(s, S('u1'));
    s = playFromSearch(s, S('b'));
    expect(s.current.id).toBe('b');
    expect(ids(s.upcoming)).toEqual(['u1']); // radio songs from the old seed are dropped
    expect(s.userCount).toBe(1);
    expect(s.history.map((h) => h.id)).toEqual(['a']);
  });

  it('never mutates its input', () => {
    const frozen = deepFreeze(radio('a', 'r1', 'r2'));
    expect(() => { advance(frozen); previous(frozen, { currentTime: 0 }); addToQueue(frozen, S('x')); reorderUpcoming(frozen, 0, 1); }).not.toThrow();
  });
});

describe('advancing', () => {
  it('plays the queue in order, tracking history and played ids', () => {
    let s = radio('a', 'b', 'c');
    let r = advance(s);
    expect(r.status).toBe('playing');
    expect(r.song.id).toBe('b');
    r = advance(r.state);
    expect(r.song.id).toBe('c');
    expect(r.state.history.map((h) => h.id)).toEqual(['a', 'b']);
    expect(r.state.played).toEqual(['a', 'b', 'c']);
  });

  it('user-added songs play before radio songs, in the order they were added', () => {
    let s = radio('a', 'r1', 'r2');
    s = addToQueue(s, S('u1'));
    s = addToQueue(s, S('u2'));
    expect(ids(s.upcoming)).toEqual(['u1', 'u2', 'r1', 'r2']);
    expect(advance(s).song.id).toBe('u1');
    const second = advance(advance(s).state);
    expect(second.song.id).toBe('u2');
    expect(second.state.userCount).toBe(0);
    expect(advance(second.state).song.id).toBe('r1');
  });

  it('"Play next" goes in front of earlier user-added songs', () => {
    let s = radio('a', 'r1');
    s = addToQueue(s, S('u1'));
    s = playNext(s, S('u0'));
    expect(ids(s.upcoming)).toEqual(['u0', 'u1', 'r1']);
    expect(s.userCount).toBe(2);
  });

  it('asks for a refill ("waiting") when the radio queue runs dry, and ends when autoplay is off', () => {
    const s = radio('a');
    expect(advance(s).status).toBe('waiting');
    const off = setAutoplay(s, false);
    const r = advance(off);
    expect(r.status).toBe('ended');
    expect(r.state.ended).toBe(true);
    expect(r.state.offerRadio).toBe(false);
  });

  it('repeat one replays the song when it ends, but a manual skip still moves on', () => {
    const s = setRepeat(radio('a', 'b'), 'one');
    expect(advance(s, { reason: 'ended' })).toMatchObject({ status: 'repeat-one', song: { id: 'a' } });
    expect(advance(s, { reason: 'skip' })).toMatchObject({ status: 'playing', song: { id: 'b' } });
  });

  it('cycles repeat modes off -> all -> one -> off', () => {
    expect([nextRepeat('off'), nextRepeat('all'), nextRepeat('one')]).toEqual(['all', 'one', 'off']);
    expect(setRepeat(createQueueState(), 'bogus').repeat).toBe('off');
  });
});

describe('previous', () => {
  it('restarts the current song after a few seconds, otherwise goes back', () => {
    let s = advance(radio('a', 'b', 'c')).state; // now on b, history [a]
    expect(previous(s, { currentTime: 10 })).toMatchObject({ status: 'restart', song: { id: 'b' } });
    const back = previous(s, { currentTime: 1 });
    expect(back.status).toBe('playing');
    expect(back.song.id).toBe('a');
    // "previous, then next" returns to the song you left
    expect(advance(back.state).song.id).toBe('b');
  });

  it('restarts when there is no history', () => {
    expect(previous(radio('a', 'b'), { currentTime: 0 }).status).toBe('restart');
    expect(previous(createQueueState()).status).toBe('none');
  });
});

describe('jumping and editing the queue', () => {
  it('tapping a queued song plays it; songs skipped over count as played', () => {
    const s = addToQueue(radio('a', 'r1', 'r2', 'r3'), S('u1'));
    const { state, song } = jumpTo(s, 2); // u1, r1, [r2]
    expect(song.id).toBe('r2');
    expect(ids(state.upcoming)).toEqual(['r3']);
    expect(state.userCount).toBe(0);
    expect(state.played).toEqual(expect.arrayContaining(['a', 'u1', 'r1', 'r2']));
    expect(state.history.map((h) => h.id)).toEqual(['a', 'u1', 'r1']);
    expect(jumpTo(s, 99).song).toBeNull();
  });

  it('removing keeps the user-queue count right', () => {
    let s = addToQueue(addToQueue(radio('a', 'r1'), S('u1')), S('u2'));
    s = removeFromUpcoming(s, 0);
    expect(ids(s.upcoming)).toEqual(['u2', 'r1']);
    expect(s.userCount).toBe(1);
    s = removeFromUpcoming(s, 1); // a radio song
    expect(s.userCount).toBe(1);
    expect(removeFromUpcoming(s, 50)).toBe(s);
  });

  it('dragging between sections moves a song between "Next in queue" and "Next from radio"', () => {
    let s = addToQueue(radio('a', 'r1', 'r2', 'r3'), S('u1')); // [u1 | r1 r2 r3]
    let r = reorderUpcoming(s, 2, 0); // drag r2 to the very top
    expect(ids(r.upcoming)).toEqual(['r2', 'u1', 'r1', 'r3']);
    expect(r.userCount).toBe(2);
    expect(r.upcoming[0].origin).toBe('user');
    r = reorderUpcoming(r, 0, 3); // drag it back to the end of the radio section
    expect(r.userCount).toBe(1);
    expect(r.upcoming[3].origin).toBe('radio');
    expect(reorderUpcoming(s, 1, 1)).toBe(s);
    expect(reorderUpcoming(s, -1, 2)).toBe(s);
  });

  it('can clear only the user-added songs', () => {
    const s = clearUserQueue(addToQueue(radio('a', 'r1'), S('u1')));
    expect(ids(s.upcoming)).toEqual(['r1']);
    expect(s.userCount).toBe(0);
  });
});

describe('radio refill', () => {
  it('refills only when fewer than 3 songs remain, never while one is in flight', () => {
    expect(needsRefill(radio('a', 'b', 'c', 'd', 'e'))).toBe(false); // 4 queued
    expect(needsRefill(radio('a', 'b', 'c', 'd'))).toBe(false); // 3 queued: exactly the threshold
    const low = radio('a', 'b', 'c'); // 2 queued
    expect(low.upcoming.length).toBeLessThan(REFILL_THRESHOLD);
    expect(needsRefill(low)).toBe(true);
    const { state: inFlight } = startRefill(low);
    expect(needsRefill(inFlight)).toBe(false);
    // playing a song also uses one up
    expect(needsRefill(advance(radio('a', 'b', 'c', 'd')).state)).toBe(true);
  });

  it('does not refill for playlists / albums, with autoplay off, or with nothing playing', () => {
    expect(needsRefill(playFromContext(createQueueState(), { songs: list('a', 'b') }))).toBe(false);
    expect(needsRefill(setAutoplay(radio('a'), false))).toBe(false);
    expect(needsRefill(createQueueState())).toBe(false);
  });

  it('the request seeds from the playing song and excludes everything already played or queued', () => {
    let s = radio('a', 'b', 'c');
    s = advance(advance(s).state).state; // playing c, played a b c
    const { request } = startRefill(s);
    expect(request.seedId).toBe('c');
    expect(request.exclude).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(request.limit).toBe(REFILL_BATCH);
  });

  it('caps the exclude list at what the endpoint accepts, keeping the most recent plays', () => {
    let s = playFromSearch(createQueueState(), S('s0'));
    s = { ...s, played: Array.from({ length: 400 }, (_, i) => `p${i}`) };
    const { request } = startRefill(s);
    expect(request.exclude.length).toBe(MAX_EXCLUDE);
    expect(request.exclude).toContain('p399');
    expect(request.exclude).not.toContain('p0');
  });

  it('never repeats a song already played this session, even if the server suggests it', () => {
    let s = radio('a', 'b');
    s = advance(s).state; // played a, b
    s = applyRefill(s, list('a', 'b', 'c', 'c', 'd')); // a, b already played; c duplicated
    expect(ids(s.upcoming)).toEqual(['c', 'd']);
  });

  it('an empty or all-duplicate batch backs off instead of hammering the server', () => {
    const s = radio('a', 'b');
    const empty = applyRefill(startRefill(s).state, [], { now: 1000 });
    expect(empty.refill.pending).toBe(false);
    expect(empty.refill.failures).toBe(1);
    expect(needsRefill(empty, { now: 1000 })).toBe(false);
    expect(needsRefill(empty, { now: 1000 + REFILL_BACKOFF_MS(1) })).toBe(true);
    // backoff grows and is capped
    expect([1, 2, 3, 4, 10].map(REFILL_BACKOFF_MS)).toEqual([1000, 2000, 4000, 8000, 30000]);
    expect(refillFailed(empty, { now: 0 }).refill.failures).toBe(2);
  });

  it('runRefill: fetches once, applies the batch, and ignores concurrent calls', async () => {
    let state = playFromSearch(createQueueState(), S('seed'));
    const calls = [];
    const io = { get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async (req) => { calls.push(req); return list('x1', 'x2', 'x3', 'x4'); } };
    const [a, b] = await Promise.all([runRefill(io), runRefill(io)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].seedId).toBe('seed');
    expect(ids(state.upcoming)).toEqual(['x1', 'x2', 'x3', 'x4']);
    expect(state.refill.pending).toBe(false);
    expect(await runRefill(io)).toBe(false); // enough songs queued: nothing to do
    expect(calls).toHaveLength(1);
  });

  it('runRefill: a failing fetch is contained and the radio retries later', async () => {
    let state = playFromSearch(createQueueState(), S('seed'));
    let t = 5000;
    const io = { get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async () => { throw new Error('offline'); }, now: () => t };
    expect(await runRefill(io)).toBe(false);
    expect(state.refill).toMatchObject({ pending: false, failures: 1 });
    expect(await runRefill(io)).toBe(false); // still inside the backoff window: no new request
    t += REFILL_BACKOFF_MS(1);
    io.fetchRelated = async () => list('y1', 'y2', 'y3');
    expect(await runRefill(io)).toBe(true);
    expect(state.refill.failures).toBe(0);
  });

  it('keeps refilling as songs are played: music never stops', async () => {
    let state = playFromSearch(createQueueState(), S('s0'));
    let n = 0;
    const io = { get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async ({ exclude }) => Array.from({ length: 20 }, () => S(`g${++n}`)).filter((x) => !exclude.includes(x.id)) };
    const playedIds = [];
    for (let i = 0; i < 100; i++) {
      await runRefill(io);
      const r = advance(state);
      expect(r.status).toBe('playing');
      state = r.state;
      playedIds.push(state.current.id);
    }
    expect(new Set(playedIds).size).toBe(100); // 100 songs, none repeated
  });
});

describe('playing a playlist or album', () => {
  const songs = list('p1', 'p2', 'p3', 'p4');

  it('follows the playlist order from the chosen song, not the radio', () => {
    let s = playFromContext(createQueueState(), { songs, index: 1, type: 'playlist', label: 'My mix' });
    expect(s.current.id).toBe('p2');
    expect(ids(s.upcoming)).toEqual(['p3', 'p4']);
    expect(s.mode).toBe('context');
    expect(getSections(s).nextFrom.label).toBe('Next from My mix');
    expect(needsRefill(s)).toBe(false);
    expect(advance(s).song.id).toBe('p3');
  });

  it('ends after the last song and offers to continue with radio', () => {
    let s = playFromContext(createQueueState(), { songs: list('p1', 'p2') });
    s = advance(s).state; // on p2, queue empty
    const end = advance(s);
    expect(end.status).toBe('ended');
    expect(end.state.offerRadio).toBe(true);
    expect(end.state.current.id).toBe('p2'); // still showing the last song
    // accepting the offer: radio takes over, seeded from the last song
    const r = switchToRadio(end.state);
    expect(r.mode).toBe('radio');
    expect(needsRefill(r)).toBe(true);
    expect(startRefill(r).request.seedId).toBe('p2');
  });

  it('repeat all loops the playlist', () => {
    let s = setRepeat(playFromContext(createQueueState(), { songs: list('p1', 'p2') }), 'all');
    s = advance(s).state; // p2
    const wrap = advance(s);
    expect(wrap.status).toBe('playing');
    expect(wrap.song.id).toBe('p1');
    expect(ids(wrap.state.upcoming)).toEqual(['p2']);
    expect(peekNext(s).id).toBe('p1');
  });

  it('shuffle permutes the remaining songs and restores the original order when turned off', () => {
    const many = list(...Array.from({ length: 12 }, (_, i) => `m${i}`));
    let s = playFromContext(createQueueState(), { songs: many });
    const original = ids(s.upcoming);
    s = setShuffle(s, true, { rng: seeded(7) });
    const shuf = ids(s.upcoming);
    expect(shuf).not.toEqual(original);
    expect([...shuf].sort()).toEqual([...original].sort());
    expect(s.current.id).toBe('m0'); // the playing song is untouched
    s = setShuffle(s, false);
    expect(ids(s.upcoming)).toEqual(original);
  });

  it('starting a playlist with shuffle on plays the chosen song first, then the rest shuffled', () => {
    const many = list(...Array.from({ length: 10 }, (_, i) => `m${i}`));
    const s = playFromContext(setShuffle(createQueueState(), true), { songs: many, index: 4, rng: seeded(3) });
    expect(s.current.id).toBe('m4');
    expect(s.upcoming).toHaveLength(9);
    expect(ids(s.upcoming)).not.toContain('m4');
  });

  it('user-added songs still play first inside a playlist', () => {
    let s = playFromContext(createQueueState(), { songs: list('p1', 'p2', 'p3') });
    s = addToQueue(s, S('u1'));
    expect(advance(s).song.id).toBe('u1');
    expect(getSections(s).nextInQueue.map((x) => x.id)).toEqual(['u1']);
  });
});

describe('sections, snapshot and helpers', () => {
  it('splits the queue into Now playing / Next in queue / Next from radio', () => {
    const s = addToQueue(radio('a', 'r1', 'r2'), S('u1'));
    const sec = getSections(s);
    expect(sec.nowPlaying.id).toBe('a');
    expect(sec.nextInQueue.map((x) => x.id)).toEqual(['u1']);
    expect(sec.nextFrom.label).toBe('Next from radio');
    expect(sec.nextFrom.items.map((x) => x.id)).toEqual(['r1', 'r2']);
    expect(peekNext(s).id).toBe('u1');
  });

  it('round-trips a snapshot (for resuming elsewhere later)', () => {
    const s = setRepeat(addToQueue(radio('a', 'r1', 'r2'), S('u1')), 'all');
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back.current.id).toBe('a');
    expect(ids(back.upcoming)).toEqual(['u1', 'r1', 'r2']);
    expect(back.userCount).toBe(1);
    expect(back.repeat).toBe('all');
    expect(back.history).toEqual([]);
  });

  it('shuffled() is a permutation and does not change its input', () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = shuffled(src, seeded(11));
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('fallback, flat view and history', () => {
  it('queues the fallback songs when the radio fails or has nothing new', async () => {
    let state = playFromSearch(createQueueState(), S('seed'), { fallback: list('t1', 'seed', 't2', 't3') });
    expect(state.fallback.map((x) => x.id)).toEqual(['t1', 't2', 't3']); // never the seed itself
    const io = { get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async () => { throw new Error('offline'); }, now: () => 1000 };
    expect(await runRefill(io)).toBe(false);
    expect(ids(state.upcoming)).toEqual(['t1', 't2', 't3']);
    expect(state.fallback).toEqual([]); // used once
    expect(state.refill.failures).toBe(1); // and the radio still backs off

    let s2 = playFromSearch(createQueueState(), S('seed'), { fallback: list('t1') });
    const io2 = { get: () => s2, update: (fn) => { s2 = fn(s2); }, fetchRelated: async () => [], now: () => 1000 };
    await runRefill(io2);
    expect(ids(s2.upcoming)).toEqual(['t1']);
  });

  it('does not use the fallback when the radio delivers', async () => {
    let state = playFromSearch(createQueueState(), S('seed'), { fallback: list('t1') });
    const io = { get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async () => list('r1', 'r2', 'r3') };
    await runRefill(io);
    expect(ids(state.upcoming)).toEqual(['r1', 'r2', 'r3']);
    expect(state.fallback.map((x) => x.id)).toEqual(['t1']);
  });

  it('applyFallback skips songs already played or queued', () => {
    let s = playFromSearch(createQueueState(), S('seed'), { fallback: list('a', 'b') });
    s = advance(applyRefill(s, list('a'))).state; // a is now playing
    expect(ids(applyFallback(s).upcoming)).toEqual(['b']);
    expect(applyFallback(createQueueState())).toEqual(createQueueState());
  });

  it('starting a playlist mid-way lets Previous walk back through the earlier songs', () => {
    const songs = list('p1', 'p2', 'p3', 'p4');
    const s = playFromContext(createQueueState(), { songs, index: 2 });
    expect(s.history.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(s.played).toEqual(['p3']); // the earlier songs were not actually played
    const back = previous(s, { currentTime: 0 });
    expect(back.song.id).toBe('p2');
    expect(advance(back.state).song.id).toBe('p3'); // and forward again
  });

  it('exposes one flat list: history, the current song, then the queue', () => {
    expect(toFlatQueue(createQueueState())).toEqual({ queue: [], queueIndex: -1 });
    let s = radio('a', 'b', 'c');
    s = advance(s).state; // a in history, b playing, c next
    s = addToQueue(s, S('u'));
    const flat = toFlatQueue(s);
    expect(flat.queue.map((x) => x.id)).toEqual(['a', 'b', 'u', 'c']);
    expect(flat.queueIndex).toBe(1);
    expect(flat.queue[flat.queueIndex].id).toBe('b');
  });

  it('can remove a song from history', () => {
    const s = advance(advance(radio('a', 'b', 'c')).state).state; // history a b, playing c
    expect(removeFromHistory(s, 0).history.map((x) => x.id)).toEqual(['b']);
    expect(removeFromHistory(s, 5)).toBe(s);
  });
});

describe('queue item ids (queue v2)', () => {
  it('gives every slot a unique id, so the same song can be queued twice', () => {
    let s = radio('a', 'r1');
    s = addToQueue(addToQueue(s, S('x')), S('x'));
    const uids = s.upcoming.map((e) => e.uid);
    expect(uids.every(Boolean)).toBe(true);
    expect(new Set(uids).size).toBe(uids.length);
    expect(ids(s.upcoming).filter((i) => i === 'x')).toHaveLength(2);
  });

  it('keeps a slot id when it is dragged to a new place', () => {
    let s = radio('a', 'r1', 'r2', 'r3');
    const uid = s.upcoming[2].uid;
    s = reorderUpcoming(s, 2, 0);
    expect(s.upcoming[0].uid).toBe(uid);
  });

  it('repairs old snapshots that have no ids, and repeated or invalid entries', () => {
    const old = { current: S('c'), upcoming: [{ song: S('a'), origin: 'user' }, { song: S('b'), origin: 'radio' }], userCount: 1, mode: 'radio' };
    const s = fromSnapshot(old);
    expect(s.upcoming.every((e) => typeof e.uid === 'string' && e.uid)).toBe(true);
    const dup = fromSnapshot({ current: S('c'), upcoming: [{ uid: 'same', song: S('a'), origin: 'user' }, { uid: 'same', song: S('b'), origin: 'radio' }, { song: null }, { uid: 'z', song: S('d'), origin: 'weird' }], userCount: 9 });
    expect(new Set(dup.upcoming.map((e) => e.uid)).size).toBe(3);
    expect(dup.upcoming[2].origin).toBe('radio');
    expect(dup.userCount).toBe(3); // clamped to the list
  });

  it('keeps ids through a save and restore', () => {
    const s = addToQueue(radio('a', 'r1'), S('x'));
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back.upcoming.map((e) => e.uid)).toEqual(s.upcoming.map((e) => e.uid));
  });

  it('finds a slot by id and exposes entries to the panel', () => {
    let s = addToQueue(radio('a', 'r1'), S('x'));
    const u = s.upcoming[0].uid;
    expect(indexOfUid(s, u)).toBe(0);
    expect(indexOfUid(s, 'nope')).toBe(-1);
    expect(getSections(s).nextInQueueEntries[0].uid).toBe(u);
    expect(getSections(s).nextFrom.entries.length).toBe(1);
  });

  it('keeps only the last 50 songs of history', () => {
    let s = playFromSearch(createQueueState(), S('s0'));
    for (let i = 1; i <= 60; i++) s = playFromSearch(s, S(`s${i}`));
    expect(s.history).toHaveLength(50);
    expect(s.history[49].id).toBe('s59');
  });
});

describe('duplicates and the 500 cap (queue v2)', () => {
  it('finds a queued song, but not the one that is playing', () => {
    const s = addToQueue(radio('a', 'r1', 'r2'), S('x'));
    expect(findQueued(s, 'r2')).toBe(2);
    expect(findQueued(s, 'x')).toBe(0);
    expect(findQueued(s, 'a')).toBe(-1);
    expect(findQueued(s, 'zzz')).toBe(-1);
  });

  it('"add again" really queues a second copy', () => {
    let s = addToQueue(radio('a', 'r1'), S('x'));
    s = addToQueue(s, S('x'));
    expect(ids(s.upcoming)).toEqual(['x', 'x', 'r1']);
    expect(s.userCount).toBe(2);
  });

  it('moving a radio song to Play next puts it first and marks it user-added', () => {
    let s = radio('a', 'r1', 'r2', 'r3');
    const uid = s.upcoming[2].uid;
    s = moveToQueue(s, 2, 'next');
    expect(ids(s.upcoming)).toEqual(['r3', 'r1', 'r2']);
    expect(s.userCount).toBe(1);
    expect(s.upcoming[0].origin).toBe('user');
    expect(s.upcoming[0].uid).toBe(uid);
  });

  it('moving to the end of "Next in queue" lands after the other added songs, before the radio songs', () => {
    let s = radio('a', 'r1', 'r2');
    s = addToQueue(addToQueue(s, S('u1')), S('u2'));
    s = moveToQueue(s, 3, 'end'); // r2
    expect(ids(s.upcoming)).toEqual(['u1', 'u2', 'r2', 'r1']);
    expect(s.userCount).toBe(3);
    // moving a user song to the end keeps the count right
    s = moveToQueue(s, 0, 'end');
    expect(ids(s.upcoming)).toEqual(['u2', 'r2', 'u1', 'r1']);
    expect(s.userCount).toBe(3);
  });

  it('ignores a bad index', () => {
    const s = radio('a', 'r1');
    expect(moveToQueue(s, 9, 'next')).toBe(s);
  });

  it('refuses to grow past 500 songs', () => {
    let s = radio('a');
    s = { ...s, upcoming: Array.from({ length: MAX_QUEUE }, (_, i) => ({ uid: `u${i}`, song: S(`q${i}`), origin: 'radio' })) };
    expect(isQueueFull(s)).toBe(true);
    expect(addToQueue(s, S('x'))).toBe(s);
    expect(playNext(s, S('x'))).toBe(s);
    expect(isQueueFull(removeFromUpcoming(s, 0))).toBe(false);
  });
});

describe('removing, undo, moving many, refresh, remove current, stop after (queue v2)', () => {
  const build = () => {
    let s = radio('a', 'r1', 'r2', 'r3');
    s = addToQueue(addToQueue(s, S('u1')), S('u2'));
    return s; // upcoming: u1 u2 r1 r2 r3
  };

  it('removes several songs at once and keeps the user block count right', () => {
    const s = build();
    const pick = [s.upcoming[1].uid, s.upcoming[3].uid]; // u2, r2
    const { state, removed } = removeByUids(s, pick);
    expect(ids(state.upcoming)).toEqual(['u1', 'r1', 'r3']);
    expect(state.userCount).toBe(1);
    expect(removed.map((r) => r.index)).toEqual([1, 3]);
  });

  it('undo puts everything back in the same place', () => {
    const s = build();
    const pick = [s.upcoming[0].uid, s.upcoming[3].uid];
    const { state, removed } = removeByUids(s, pick);
    const back = restoreRemoved(state, removed);
    expect(ids(back.upcoming)).toEqual(ids(s.upcoming));
    expect(back.userCount).toBe(s.userCount);
    expect(back.upcoming.map((e) => e.uid)).toEqual(s.upcoming.map((e) => e.uid));
  });

  it('undo does not duplicate songs when pressed twice, and does not bring back the queue past 500', () => {
    const s = build();
    const { state, removed } = removeByUids(s, [s.upcoming[0].uid]);
    const once = restoreRemoved(state, removed);
    expect(restoreRemoved(once, removed).upcoming).toHaveLength(once.upcoming.length);
    const full = { ...state, upcoming: Array.from({ length: MAX_QUEUE }, (_, i) => ({ uid: `f${i}`, song: S(`f${i}`), origin: 'radio' })), userCount: 0 };
    expect(restoreRemoved(full, removed).upcoming).toHaveLength(MAX_QUEUE);
  });

  it('removing nothing changes nothing', () => {
    const s = build();
    expect(removeByUids(s, ['nope']).state).toBe(s);
    expect(restoreRemoved(s, [])).toBe(s);
  });

  it('moves several songs to play next, keeping their order', () => {
    const s = build();
    const m = moveManyToQueue(s, [s.upcoming[4].uid, s.upcoming[2].uid], 'next'); // r3 and r1
    expect(ids(m.upcoming)).toEqual(['r1', 'r3', 'u1', 'u2', 'r2']);
    expect(m.userCount).toBe(4);
    expect(m.upcoming.slice(0, 4).every((e) => e.origin === 'user')).toBe(true);
  });

  it('moves several songs to the end of the added block, before the radio songs', () => {
    const s = build();
    const m = moveManyToQueue(s, [s.upcoming[0].uid, s.upcoming[4].uid], 'end'); // u1 and r3
    expect(ids(m.upcoming)).toEqual(['u2', 'u1', 'r3', 'r1', 'r2']);
    expect(m.userCount).toBe(3);
  });

  it('refresh recommendations drops only the auto-added songs and resets the refill backoff', () => {
    let s = refillFailed(refillFailed(build()));
    s = clearRadio(s);
    expect(ids(s.upcoming)).toEqual(['u1', 'u2']);
    expect(s.refill).toEqual({ pending: false, failures: 0, retryAt: 0 });
    expect(needsRefill(s, { threshold: 3 })).toBe(true);
    const list = playFromContext(createQueueState(), { songs: list3(), index: 0 });
    expect(clearRadio(list)).toBe(list); // playlists are not radio
  });

  it('removing the playing song plays the next one and leaves it out of history', () => {
    const s = build();
    const r = removeCurrent(s);
    expect(r.status).toBe('playing');
    expect(r.state.current.id).toBe('u1');
    expect(r.state.history.map((x) => x.id)).not.toContain('a');
    expect(r.state.userCount).toBe(1);
  });

  it('removing the playing song with nothing queued asks for more (radio) instead of stopping', () => {
    const s = radio('a');
    expect(removeCurrent(s).status).toBe('waiting');
  });

  it('stop after this song is a flag that can be set and cleared', () => {
    let s = setStopAfter(radio('a', 'r1'), true);
    expect(s.stopAfter).toBe(true);
    s = setStopAfter(s, false);
    expect(s.stopAfter).toBe(false);
    expect(createQueueState().stopAfter).toBe(false);
  });
});

function list3() { return [S('p1'), S('p2'), S('p3')]; }

describe('history replay (queue v2)', () => {
  it('plays a history song now, keeps the queue, and puts the playing song into history', () => {
    let s = radio('a', 'r1', 'r2');
    s = advance(s).state; // r1 plays, a in history
    s = advance(s).state; // r2 plays, a r1 in history
    const r = playFromHistory(s, 0); // replay a
    expect(r.song.id).toBe('a');
    expect(r.state.current.id).toBe('a');
    expect(r.state.history.map((x) => x.id)).toEqual(['r1', 'r2']);
    expect(r.state.upcoming).toEqual(s.upcoming);
  });
  it('ignores a bad index', () => {
    const s = radio('a', 'r1');
    expect(playFromHistory(s, 5).song).toBeNull();
  });
  it('never keeps 51 songs in history', () => {
    let s = playFromSearch(createQueueState(), S('s0'));
    for (let i = 1; i <= 55; i++) s = playFromSearch(s, S(`s${i}`));
    const r = playFromHistory(s, 10);
    expect(r.state.history.length).toBeLessThanOrEqual(50);
  });
});

describe('smarter autoplay (queue feel)', () => {
  const by = (id, artist) => ({ id, title: `T ${id}`, artist });
  const runOf = (list) => { let best = 0; let run = 0; let last = null; for (const s of list) { const k = artistKey(s); run = k === last ? run + 1 : 1; last = k; best = Math.max(best, run); } return best; };

  it('never puts more than 3 songs by one artist in a row', () => {
    const fresh = [...Array.from({ length: 6 }, (_, i) => by(`a${i}`, 'Anirudh')), ...Array.from({ length: 4 }, (_, i) => by(`b${i}`, 'Rahman'))];
    const out = spreadByArtist([], fresh);
    expect(out).toHaveLength(10);
    expect(runOf(out)).toBeLessThanOrEqual(MAX_ARTIST_RUN);
    expect(new Set(out.map((s) => s.id)).size).toBe(10);
  });
  it('counts the songs already queued before the new ones', () => {
    const tail = [by('x1', 'Anirudh'), by('x2', 'Anirudh'), by('x3', 'Anirudh')];
    const out = spreadByArtist(tail, [by('a1', 'Anirudh'), by('b1', 'Rahman'), by('a2', 'Anirudh')]);
    expect(out[0].artist).toBe('Rahman');
    expect(runOf([...tail, ...out])).toBeLessThanOrEqual(MAX_ARTIST_RUN);
  });
  it('keeps the incoming order when there is no problem, and never drops songs when only one artist is left', () => {
    const ok = [by('1', 'A'), by('2', 'B'), by('3', 'A')];
    expect(spreadByArtist([], ok).map((s) => s.id)).toEqual(['1', '2', '3']);
    const one = Array.from({ length: 6 }, (_, i) => by(`s${i}`, 'Same'));
    expect(spreadByArtist([], one)).toHaveLength(6);
  });
  it('treats "Anirudh, Vishal" and "anirudh" as the same artist', () => {
    expect(artistKey(by('1', 'Anirudh Ravichander, Vishal'))).toBe(artistKey(by('2', 'anirudh ravichander')));
  });
  it('a refill spreads artists out and says how many songs it added', async () => {
    let s = playFromSearch(createQueueState(), by('cur', 'Anirudh'));
    const batch = [...Array.from({ length: 5 }, (_, i) => by(`a${i}`, 'Anirudh')), ...Array.from({ length: 5 }, (_, i) => by(`b${i}`, 'Rahman'))];
    let added = 0;
    await runRefill({ get: () => s, update: (fn) => { s = fn(s); }, fetchRelated: async () => batch, onAdded: (n) => { added = n; } });
    expect(added).toBe(10);
    expect(runOf([s.current, ...s.upcoming.map((e) => e.song)])).toBeLessThanOrEqual(MAX_ARTIST_RUN);
  });
  it('asks for 10 songs, and keeps songs shown on the home page out (after the recent plays)', () => {
    expect(REFILL_BATCH).toBe(10);
    const s = playFromSearch(createQueueState(), by('cur', 'A'));
    const { request, state } = startRefill(s, { avoid: ['home1', 'home2'] });
    expect(request.limit).toBe(10);
    expect(request.exclude).toEqual(['cur', 'home1', 'home2']);
    const next = applyRefill(state, [by('home1', 'A'), by('fresh', 'B')]);
    expect(next.upcoming.map((e) => e.song.id)).toEqual(['fresh']); // even if the server sent a home song, it is not added
  });
  it('the last 50 played are kept out too', () => {
    let s = playFromSearch(createQueueState(), by('p0', 'A'));
    for (let i = 1; i <= 60; i++) s = playFromSearch(s, by(`p${i}`, 'A'));
    const { request } = startRefill(s);
    for (let i = 11; i <= 60; i++) expect(request.exclude).toContain(`p${i}`);
  });
});
