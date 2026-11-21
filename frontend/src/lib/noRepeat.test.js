import { describe, it, expect } from 'vitest';
import {
  createQueueState, playFromSearch, advance, applyRefill, startRefill, runRefill, needsRefill, filterNewSongs, cleanRadioDuplicates, addToQueue, findQueued,
  retryRefill, isExhausted, refillFailedBanner, refreshRecommendations, toSnapshot, fromSnapshot, REFILL_THRESHOLD, REFILL_BATCH, REFILL_BACKOFF_MS,
} from './radioQueue';
import { toSaved, fromSaved } from './queuePersist';
import { isSameSong } from './songIdentity';

// THE RULE (docs/NO_REPEAT.md): the same song never appears twice inside the QUEUE. Listening history is not a rule.
const song = (id, title, artist = 'Singer', album = 'Film') => ({ id, title, artist, album, movie: album, duration: 240 });
const entry = (s, origin = 'radio') => ({ uid: `u_${s.id}_${origin}`, song: s, origin });
const pairs = {
  pavazha: [song('p1', 'Pavazha Malli', 'Sid Sriram', 'Pavazha Malli - Single'), song('p2', 'Pavazha Malli (Unplugged)', 'Sid Sriram', 'Unplugged')],
  naanUn: [song('n1', 'Naan Un (From "24")', 'A.R. Rahman, Arijit Singh', '24'), song('n2', 'Naan Un (From "24")', 'Arijit Singh, A.R. Rahman', 'Romantic Hits')],
  annul: [song('a1', 'Annul Maelae', 'Sid Sriram', 'Thaanaa Serndha Koottam'), song('a2', 'Annul Melae', 'Sid Sriram', 'Thaana Serndha Kootam')],
  innum: [song('i1', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan'), song('i2', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan (Original Motion Picture Soundtrack)')],
};
const playing = (s, ...queue) => ({ ...playFromSearch(createQueueState(), s), upcoming: queue.map((q) => entry(q)) });
const queueOf = (state) => [state.current, ...state.upcoming.map((e) => e.song)].filter(Boolean);
const noDuplicates = (state) => { const q = queueOf(state); for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) if (isSameSong(q[i], q[j])) return false; return true; };

describe('the one rule: the same song never appears twice in the queue', () => {
  for (const name of ['naanUn', 'annul', 'innum']) {
    it(`${name}: the same song under another id, cover or spelling is not added while it is playing or queued`, () => {
      const [a, b] = pairs[name];
      expect(filterNewSongs(playing(a), [b])).toEqual([]);
      expect(filterNewSongs(playing(song('x', 'Something Else'), a), [b])).toEqual([]);
      expect(filterNewSongs(playing(song('x', 'Something Else')), [a, b]).length).toBe(1); // one copy inside a batch
    });
  }
  it('a version of the PLAYING song is skipped; a version of a queued song is fine', () => {
    const [orig, unplugged] = pairs.pavazha;
    expect(filterNewSongs(playing(orig), [unplugged])).toEqual([]);
    expect(filterNewSongs(playing(song('x', 'Something Else'), orig), [unplugged]).map((s) => s.id)).toEqual(['p2']);
  });

  it('a queue of 10 (and far beyond) never holds the same song twice, whatever the ids, covers or spellings', () => {
    const catalogue = [];
    for (let i = 0; i < 80; i++) {
      const base = song(`s${i}`, `Song ${i} ${'abcdefgh'[i % 8]}${i * 3}`, `Singer ${i % 17}`, `Film ${Math.floor(i / 4)}`);
      catalogue.push(base);
      if (i % 3 === 0) catalogue.push({ ...base, id: `dup${i}`, album: 'Romantic Hits' });                                   // another id and cover
      if (i % 5 === 0) catalogue.push({ ...base, id: `sp${i}`, title: base.title.replace('Song', 'Songg') });              // a spelling variant
    }
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    let state = playFromSearch(createQueueState(), catalogue[0]);
    let peak = 0;
    for (let step = 0; step < 150; step++) {
      if (state.upcoming.length < REFILL_THRESHOLD) {
        const { state: pending } = startRefill(state);
        const batch = Array.from({ length: REFILL_BATCH }, () => catalogue[Math.floor(rnd() * catalogue.length)]);
        state = applyRefill(pending, batch);
        expect(noDuplicates(state)).toBe(true);
        peak = Math.max(peak, queueOf(state).length);
        if (!state.upcoming.length) break;
      }
      state = advance(state, { reason: rnd() < 0.3 ? 'skip' : 'ended' }).state;
      expect(noDuplicates(state)).toBe(true);
    }
    expect(peak).toBeGreaterThanOrEqual(10); // the queue really was 10 songs or more while it was checked
  });

  it('the queue is checked as a whole after every refill: a duplicate radio row goes (keep the first); songs you added stay', () => {
    const [a, b] = pairs.annul;
    const s = { ...playing(song('cur', 'Current')), upcoming: [entry(a), entry(song('m', 'Mid Song')), entry(b), entry(b, 'user')], userCount: 0 };
    const clean = cleanRadioDuplicates(s);
    expect(clean.upcoming.map((e) => `${e.song.id}:${e.origin}`)).toEqual(['a1:radio', 'm:radio', 'a2:user']);
    // and when the batch is applied the same check runs on the full queue
    const withDuplicateAlreadyThere = { ...playing(song('cur', 'Current'), a) };
    const next = applyRefill(withDuplicateAlreadyThere, [b, song('z', 'Zed Song')]);
    expect(next.upcoming.map((e) => e.song.id)).toEqual(['a1', 'z']);
  });
});

describe('history is not a rule', () => {
  it('a song played yesterday, or a minute ago, can appear again', () => {
    const [a] = pairs.annul;
    let s = playFromSearch(createQueueState(), a);
    s = applyRefill(s, [song('o1', 'Other One'), song('o2', 'Other Two')]);
    s = advance(s).state; // a is in the history now
    expect(s.history.map((h) => h.id)).toContain('a1');
    expect(filterNewSongs(s, [a, pairs.annul[1]]).length).toBe(1); // the song itself (and its spelling twin: one copy)
    const next = applyRefill(s, [a]);
    expect(next.upcoming.map((e) => e.song.id)).toContain('a1');
  });
  it('the request sends only the queue as exclusions; the last played are a hint, newest first', () => {
    let s = playFromSearch(createQueueState(), song('p0', 'P0'));
    for (let i = 1; i <= 8; i++) s = playFromSearch(s, song(`p${i}`, `P${i}`));
    s = { ...s, upcoming: [entry(song('q1', 'Q1'))] };
    const { request } = startRefill(s);
    expect(request.exclude).toEqual(['p8', 'q1']);
    expect(request.recent.slice(0, 3)).toEqual(['p7', 'p6', 'p5']);
    expect(request.limit).toBe(50);
  });
  it('a small pool still fills the queue', () => {
    const s = applyRefill(playFromSearch(createQueueState(), song('cur', 'Current')), [song('a', 'Alpha Tune', 'A1', 'F1'), song('b', 'Beta Tune', 'B2', 'F2'), song('c', 'Gamma Tune', 'C3', 'F3')]);
    expect(s.upcoming.map((e) => e.song.id)).toEqual(['a', 'b', 'c']);
  });
  it('no memory is saved or restored any more: an old saved queue with session memory loads without it', () => {
    const s = playing(song('c1', 'Current One'), song('q1', 'Queued One'));
    const saved = toSaved(s, { deviceId: 'd' });
    expect('heard' in saved).toBe(false);
    expect('allowRepeats' in saved).toBe(false);
    const songs = { c1: song('c1', 'Current One'), q1: song('q1', 'Queued One') };
    const restored = fromSaved({ ...saved, heard: [{ k: 'x', id: 'q9' }], allowRepeats: true }, songs);
    expect(restored.state.upcoming.map((e) => e.song.id)).toEqual(['q1']);
    expect('heard' in restored.state).toBe(false);
    const snap = fromSnapshot({ ...JSON.parse(JSON.stringify(toSnapshot(s))), heard: [{ k: 'x' }], allowRepeats: true, exhausted: true });
    expect('heard' in snap).toBe(false);
    expect(snap.exhaustedFor).toBeNull();
  });
});

describe('the banner: "Out of new songs" only when truly nothing is left; a failed request says so', () => {
  const start = () => playFromSearch(createQueueState(), song('cur', 'Current'));
  it('exhausted only when the server says nothing is left that is not queued, and nothing fresh arrived', () => {
    const items = []; items.meta = { exhausted: true, widened: ['composer', 'era', 'language', 'trending'] };
    const out = applyRefill(startRefill(start()).state, items, { meta: items.meta });
    expect(isExhausted(out)).toBe(true);
    expect(needsRefill(out, { now: Date.now() + 1e6 })).toBe(false); // no endless asking
    // everything the server sent is already queued, but it did NOT say "exhausted": an ordinary back-off, no banner
    const queued = playing(song('cur', 'Current'), song('q1', 'Queued One'));
    const same = applyRefill(startRefill(queued).state, [song('q1b', 'Queued One')], { meta: { exhausted: false } });
    expect(isExhausted(same)).toBe(false);
    expect(same.refill.failures).toBe(1);
    // fresh songs arrived: never exhausted, even if the server flagged it
    const mixed = applyRefill(startRefill(start()).state, [song('n1', 'New One')], { meta: { exhausted: true } });
    expect(isExhausted(mixed)).toBe(false);
    // the history can never exhaust it: a history full of songs changes nothing here
    let played = start();
    for (let i = 0; i < 30; i++) played = playFromSearch(played, song(`h${i}`, `History ${i}`));
    expect(isExhausted(applyRefill(startRefill(played).state, [song('h3', 'History 3')], { meta: { exhausted: false } }))).toBe(false);
  });
  it('the banner is about the playing song: the next song asks again', () => {
    const items = []; items.meta = { exhausted: true };
    let s = applyRefill(startRefill(playing(song('cur', 'Current'), song('nxt', 'Next'))).state, items, { meta: items.meta });
    s = { ...s, upcoming: [entry(song('nxt', 'Next'))] };
    expect(isExhausted(s)).toBe(true);
    s = advance(s).state;
    expect(isExhausted(s)).toBe(false);
  });
  it('a failed request shows "Couldn\'t load more songs" and Retry asks again at once', async () => {
    let state = start();
    let t = 5000;
    const io = { get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async () => { throw new Error('offline'); }, now: () => t };
    expect(await runRefill(io)).toBe(false);
    expect(refillFailedBanner(state)).toBe(true);
    expect(await runRefill(io)).toBe(false); // inside the back-off: no new request
    state = retryRefill(state);
    expect(refillFailedBanner(state)).toBe(false);
    expect(needsRefill(state, { now: t })).toBe(true);
    io.fetchRelated = async () => [song('y1', 'Y One'), song('y2', 'Y Two')];
    expect(await runRefill(io)).toBe(true);
    expect(refillFailedBanner(state)).toBe(false);
    expect(REFILL_BACKOFF_MS(1)).toBe(1000);
  });
  it('an empty answer that is not an error does not show the error banner', async () => {
    let state = start();
    await runRefill({ get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async () => [] });
    expect(refillFailedBanner(state)).toBe(false);
    expect(state.refill.failures).toBe(1);
  });
  it('"Refresh recommendations" clears the banner and asks again', () => {
    const items = []; items.meta = { exhausted: true };
    const s = applyRefill(startRefill(start()).state, items, { meta: items.meta });
    const r = refreshRecommendations(s);
    expect(isExhausted(r)).toBe(false);
    expect(needsRefill(r, { now: Date.now() })).toBe(true);
  });
});

describe('manual add keeps working', () => {
  it('adding a duplicate by hand still asks "Already in queue - add again?", then allows it; the radio never touches it', () => {
    const [a, b] = pairs.naanUn;
    let s = addToQueue(playing(song('cur', 'Current')), a);
    expect(findQueued(s, b)).toBe(0); // the app shows the prompt: the same song under another id
    s = addToQueue(s, b); // answered "add again"
    expect(s.upcoming.map((e) => `${e.song.id}:${e.origin}`)).toEqual(['n1:user', 'n2:user']);
    const cleaned = cleanRadioDuplicates(s);
    expect(cleaned.upcoming.length).toBe(2);
  });
});
