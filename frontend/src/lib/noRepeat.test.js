import { describe, it, expect } from 'vitest';
import {
  createQueueState, playFromSearch, advance, applyRefill, startRefill, runRefill, needsRefill, collectHeard,
  allowRepeatsNow, playSomethingDifferent, refreshRecommendations, cleanRadioDuplicates, toSnapshot, fromSnapshot, filterNewSongs,
} from './radioQueue';
import { toSaved, fromSaved } from './queuePersist';
import { variantKey } from './songIdentity';

const song = (id, title, artist = 'Singer', album = 'Film') => ({ id, title, artist, album, movie: album, duration: 240 });
const entry = (s, origin = 'radio') => ({ uid: `u_${s.id}_${origin}`, song: s, origin });
const fixtures = {
  pavazha: [song('p1', 'Pavazha Malli', 'Sid Sriram', 'Pavazha Malli - Single'), song('p2', 'Pavazha Malli (Unplugged)', 'Sid Sriram', 'Unplugged')],
  naanUn: [song('n1', 'Naan Un (From "24")', 'A.R. Rahman, Arijit Singh', '24'), song('n2', 'Naan Un (From "24")', 'Arijit Singh, A.R. Rahman', 'Romantic Hits')],
  annul: [song('a1', 'Annul Maelae', 'Sid Sriram', 'Thaanaa Serndha Koottam'), song('a2', 'Annul Melae', 'Sid Sriram', 'Thaana Serndha Kootam')],
  innum: [song('i1', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan'), song('i2', 'Innum Konjam Neram', 'Vijay Prakash', 'Maryan (Original Motion Picture Soundtrack)')],
};

describe('no-repeat: session memory', () => {
  it('collects played, skipped, playing and queued songs once per version, newest last', () => {
    let s = createQueueState({ current: song('c', 'Current Song'), history: [song('h', 'History Song')], skipped: [song('k', 'Skipped Song')], upcoming: [entry(song('q', 'Queued Song'))] });
    s = { ...s, heard: [{ k: 'old key', id: 'o' }] };
    const keys = collectHeard(s).map((h) => h.k);
    expect(keys[0]).toBe('old key');
    expect(keys.at(-1)).toBe(variantKey(song('q', 'Queued Song')));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('is capped', () => {
    const heard = Array.from({ length: 900 }, (_, i) => ({ k: `k${i}` }));
    expect(collectHeard(createQueueState({ heard })).length).toBe(600);
  });
  for (const [name, [a, b]] of Object.entries(fixtures)) {
    it(`${name}: the copy or version of a heard song is not added by autoplay`, () => {
      // saved memory holds exact keys (catches re-uploads, compilation copies, versions); a spelling variant is caught by the fuzzy check on recent songs
      const viaKeys = { ...createQueueState({ current: song('x', 'Something Else') }), heard: collectHeard(createQueueState({ history: [a] })) };
      const viaHistory = createQueueState({ current: song('x', 'Something Else'), history: [a] });
      expect(filterNewSongs(name === 'annul' ? viaHistory : viaKeys, [b]).length).toBe(0);
      expect(filterNewSongs(createQueueState({ current: song('x', 'Something Else') }), [a, b]).length).toBe(1);
    });
  }
  it('a snapshot and a saved queue keep the memory (refresh, another device)', () => {
    const s = playFromSearch(createQueueState(), fixtures.pavazha[0]);
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back.heard.map((h) => h.k)).toContain(variantKey(fixtures.pavazha[0]));
    const saved = toSaved({ ...s, upcoming: [entry(song('z', 'Zed Song'))] }, { deviceId: 'd' });
    expect(saved.heard.length).toBeGreaterThan(0);
    const songs = { p1: fixtures.pavazha[0], z: song('z', 'Zed Song') };
    const restored = fromSaved(saved, songs);
    expect(restored.state.heard.map((h) => h.k)).toEqual(saved.heard.map((h) => h.k));
    expect(filterNewSongs(restored.state, [fixtures.pavazha[1]]).length).toBe(0); // the heard version stays out after the restore
  });
  it('a restored snapshot keeps the saved memory and drops autoplay rows that repeat an earlier row', () => {
    const [a, b] = fixtures.annul;
    const dirty = createQueueState({ current: song('c', 'Playing'), upcoming: [entry(a), entry(song('m', 'Mid Song')), entry(b), entry(b, 'user')], userCount: 0 });
    const clean = cleanRadioDuplicates(dirty);
    expect(clean.upcoming.map((e) => `${e.song.id}:${e.origin}`)).toEqual(['a1:radio', 'm:radio', 'a2:user']); // the radio's second copy goes, the one you added stays
  });
});

describe('no-repeat: exhaustion and the listener\'s choices', () => {
  const playing = () => playFromSearch(createQueueState(), song('c', 'Playing Song'));
  it('an exhausted answer stops the refill and raises the flag', () => {
    const s = playing();
    const items = []; items.meta = { exhausted: true, widened: ['composer', 'era', 'language', 'trending'] };
    const out = applyRefill(startRefill(s).state, items, { meta: items.meta });
    expect(out.exhausted).toBe(true);
    expect(needsRefill(out, { now: Date.now() + 1e6 })).toBe(false); // no endless asking
  });
  it('an empty answer without "exhausted" is a normal failure with back-off', () => {
    const out = applyRefill(startRefill(playing()).state, []);
    expect(out.exhausted).toBe(false);
    expect(out.refill.failures).toBe(1);
  });
  it('"Allow repeats" asks again with allowRepeats and lets heard songs back (never the playing or queued one)', () => {
    let s = playing();
    s = { ...s, heard: collectHeard(createQueueState({ history: [fixtures.annul[0]] })), exhausted: true };
    s = allowRepeatsNow(s);
    expect(s.exhausted).toBe(false);
    const { request, state } = startRefill(s);
    expect(request.allowRepeats).toBe(true);
    const repeat = { ...fixtures.annul[0], repeat: true };
    const playingAgain = { ...s.current };
    const out = applyRefill(state, [repeat, playingAgain]);
    expect(out.upcoming.map((e) => e.song.id)).toEqual(['a1']);
  });
  it('"Play something different" sends wide=1 once', () => {
    const s = playSomethingDifferent({ ...playing(), exhausted: true });
    const first = startRefill(s);
    expect(first.request.wide).toBe(true);
    expect(startRefill({ ...first.state, refill: { pending: false, failures: 0, retryAt: 0 } }).request.wide).toBeUndefined();
  });
  it('playing a new song starts the normal rules again but keeps the memory', () => {
    const s = { ...playing(), allowRepeats: true, exhausted: true, heard: [{ k: 'kept' }] };
    const next = playFromSearch(s, song('n', 'Brand New'));
    expect(next.allowRepeats).toBe(false);
    expect(next.exhausted).toBe(false);
    expect(next.heard).toEqual([{ k: 'kept' }]);
  });
  it('runRefill passes the server meta along', async () => {
    let state = playing();
    const items = []; items.meta = { exhausted: true };
    await runRefill({ get: () => state, update: (fn) => { state = fn(state); }, fetchRelated: async () => items });
    expect(state.exhausted).toBe(true);
  });
  it('"Refresh recommendations" removes repeated autoplay rows, keeps your own, and retries', () => {
    const [a, b] = fixtures.pavazha;
    const s = { ...createQueueState({ current: a, upcoming: [entry(song('u', 'Mine'), 'user'), entry(b), entry(song('o', 'Other'))], userCount: 1 }), exhausted: true };
    const out = refreshRecommendations(s);
    expect(out.upcoming.map((e) => e.song.id)).toEqual(['u', 'o']);
    expect(out.exhausted).toBe(false);
  });
});

describe('no-repeat: a long simulated session in the engine', () => {
  it('500 songs, no song twice in the queue or in the last 200 played', () => {
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const catalogue = Array.from({ length: 800 }, (_, i) => song(`s${i}`, `Song ${i} ${'abcdefghijklmnop'[i % 16]}${i % 7}`, `Singer ${i % 40}`, `Film ${Math.floor(i / 5)}`));
    let state = playFromSearch(createQueueState(), catalogue[0]);
    const playedKeys = [];
    for (let step = 0; step < 500; step++) {
      if (state.upcoming.length < 3) {
        const { state: pending } = startRefill(state);
        const batch = Array.from({ length: 12 }, () => catalogue[Math.floor(rnd() * catalogue.length)]);
        state = applyRefill(pending, batch);
        if (!state.upcoming.length) break;
      }
      const keys = [state.current, ...state.upcoming.map((e) => e.song)].map(variantKey);
      expect(new Set(keys).size).toBe(keys.length);
      playedKeys.push(variantKey(state.current));
      const k = playedKeys.at(-1);
      expect(playedKeys.slice(-201, -1)).not.toContain(k);
      state = advance(state, { reason: rnd() < 0.3 ? 'skip' : 'ended' }).state;
    }
    expect(playedKeys.length).toBe(500);
  });
});
