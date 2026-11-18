import { describe, it, expect } from 'vitest';
import { createQueueState, playFromSearch, applyRefill, addToQueue, findQueued, advance, clearRadio, cleanRadioDuplicates, filterNewSongs, startRefill } from './radioQueue';
import { fromSaved } from './queuePersist';
import { clusterSongs } from './songIdentity';

const S = (id, title, artist, album, duration, extra = {}) => ({ id, title, artist, singers: artist, album, duration, ...extra });
const innum = S('i1', 'Innum Konjam Neram', 'Vijay Prakash, Shreya Ghoshal', 'Maryan', 313);
const innum2 = S('i2', 'Innum Konjam Neram', 'Vijay Prakash', 'A.R. Rahman Romantic Hits', 313);
const naan1 = S('n1', 'Naan Un (From "24")', 'Arijit Singh, Chinmayi', 'A.R. Rahman Romantic Hits', 288);
const naan2 = S('n2', 'Naan Un (From "24")', 'Arijit Singh', 'Konjam Paatu Konjam Kaadhal', 288);
const annul1 = S('a1', 'Annul Maelae', 'Pradeep Kumar', 'Aadhavan', 322);
const annul2 = S('a2', 'Annul Melae', 'Pradeep Kumar', 'Aadhavan', 322);
const other = (n) => S(`o${n}`, `Other Tune ${String.fromCharCode(97 + n)}${n}`, `Singer ${n}`, `Film ${n}`, 200 + n * 9);
const canonCount = (songs) => clusterSongs(songs).groups.length;

describe('radio block: zero duplicates by canonicalSongId', () => {
  it('a radio batch with the playing song again, and the same song twice, keeps one of each', () => {
    const playing = playFromSearch(createQueueState(), innum);
    const s = applyRefill(playing, [innum2, naan1, naan2, annul1, annul2, other(1), other(2), other(3)]);
    const radio = s.upcoming.map((e) => e.song);
    expect(radio.some((x) => x.id === 'i2')).toBe(false); // the playing song under another id
    expect(canonCount([innum, ...radio])).toBe(1 + radio.length); // no two songs are the same
    expect(radio.filter((x) => /naan un/i.test(x.title))).toHaveLength(1);
    expect(radio.filter((x) => /annul/i.test(x.title))).toHaveLength(1);
  });
  it('the original release is chosen over the compilation copy', () => {
    const s = applyRefill(playFromSearch(createQueueState(), other(9)), [naan1, { ...naan2, album: '24' }, other(1), other(2)]);
    expect(s.upcoming.find((e) => /naan un/i.test(e.song.title)).song.id).toBe('n2'); // "Romantic Hits" loses to the film album
  });
  it('songs played in the last 50, and skipped ones, are kept out by canonical id, not only by id', () => {
    let s = playFromSearch(createQueueState(), annul1);
    s = applyRefill(s, [other(1), other(2), other(3)]);
    s = advance(s).state; // annul1 now in history
    const fresh = filterNewSongs(s, [annul2, other(7)]);
    expect(fresh.map((x) => x.id)).toEqual(['o7']);
  });
  it('the exclusion list is built from ids, and fuzzy twins of the queue never come back from the server', () => {
    let s = playFromSearch(createQueueState(), other(0));
    s = addToQueue(s, naan1);
    const out = filterNewSongs(s, [naan2, other(5)]);
    expect(out.map((x) => x.id)).toEqual(['o5']);
    expect(startRefill(s).request.exclude).toContain('n1');
  });
});

describe('cleaning an existing queue', () => {
  const dirty = () => {
    let s = playFromSearch(createQueueState(), innum);
    s = applyRefill(s, [other(1), other(2)]);
    return { ...s, upcoming: [{ uid: 'x1', song: innum2, origin: 'radio' }, ...s.upcoming, { uid: 'x2', song: annul1, origin: 'radio' }, { uid: 'x3', song: annul2, origin: 'radio' }] };
  };
  it('removes autoplay rows that repeat the playing song or an earlier row, keeps the first', () => {
    const c = cleanRadioDuplicates(dirty());
    const songs = c.upcoming.map((e) => e.song);
    expect(songs.some((x) => x.id === 'i2')).toBe(false);
    expect(songs.filter((x) => /annul/i.test(x.title)).map((x) => x.id)).toEqual(['a1']);
  });
  it('never touches songs you added yourself', () => {
    let s = playFromSearch(createQueueState(), innum);
    s = addToQueue(s, innum2); // the user wants it again
    s = { ...s, upcoming: [...s.upcoming, { uid: 'r', song: annul1, origin: 'radio' }, { uid: 'r2', song: annul2, origin: 'radio' }] };
    const c = cleanRadioDuplicates(s);
    expect(c.upcoming.some((e) => e.song.id === 'i2' && e.origin === 'user')).toBe(true);
    expect(c.upcoming.filter((e) => /annul/i.test(e.song.title))).toHaveLength(1);
  });
  it('is applied to a saved queue when it is restored', () => {
    const songsById = { i1: innum, i2: innum2, a1: annul1, a2: annul2, o1: other(1) };
    const saved = { items: [{ id: 'i1', o: 'r' }, { id: 'i2', o: 'r' }, { id: 'a1', o: 'r' }, { id: 'a2', o: 'r' }, { id: 'o1', o: 'r' }], currentIndex: 0, positionSec: 0, mode: 'radio' };
    const r = fromSaved(saved, songsById);
    expect(r.state.upcoming.map((e) => e.song.id)).toEqual(['a1', 'o1']);
  });
  it('Refresh recommendations: the radio is replaced, your songs stay', () => {
    let s = playFromSearch(createQueueState(), innum);
    s = addToQueue(s, naan1);
    s = applyRefill(s, [other(1)]);
    const c = clearRadio(s);
    expect(c.upcoming.map((e) => e.song.id)).toEqual(['n1']);
  });
});

describe('manual add of a duplicate still prompts', () => {
  it('findQueued finds the same song under another id, spelling or album, so the UI asks "Already in queue - add again?"', () => {
    let s = playFromSearch(createQueueState(), other(0));
    s = addToQueue(s, annul1);
    expect(findQueued(s, annul2)).toBeGreaterThanOrEqual(0);
    expect(findQueued(s, naan2)).toBe(-1);
    s = addToQueue(s, annul2); // "add again" is allowed
    expect(s.upcoming.filter((e) => /annul/i.test(e.song.title))).toHaveLength(2);
  });
});
