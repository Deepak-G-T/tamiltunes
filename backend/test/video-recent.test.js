import assert from 'node:assert/strict';
import { createVideoLookup, songKey } from '../src/services/music/videoLookup.js';
import { parseUploadTitle, pickCatalogSong, runRecent } from '../src/services/videoBatch/recent.js';
import { createMemoryStore } from '../src/services/videoMatches/store.js';

const CH = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const vid = (n) => `vid${String(n).padStart(8, '0')}`;

// ---- 1. upload titles -> { title, film }
{
  const cases = [
    ['Hukum - Video Song | Jailer | Superstar Rajinikanth | Anirudh', { title: 'Hukum', film: 'Jailer' }],
    ['Naa Ready (Official Video) | Leo | Thalapathy Vijay', { title: 'Naa Ready', film: 'Leo' }],
    ['Ennodu Nee Irundhaal Video Song | I | A.R. Rahman', { title: 'Ennodu Nee Irundhaal', film: 'I' }],
    ['Kaavaalaa Video Song - Jailer', { title: 'Kaavaalaa', film: '' }],
  ];
  for (const [raw, want] of cases) {
    const got = parseUploadTitle(raw);
    assert.equal(got?.title, want.title, raw);
    assert.equal(got?.film, want.film, raw);
  }
  assert.equal(parseUploadTitle('Video Song | Leo'), null, 'nothing but "Video Song" is not a title');
  assert.equal(parseUploadTitle('Official Trailer'), null, 'no video-song marker and no film part: too vague');
  assert.equal(parseUploadTitle(''), null);
  console.log('✓ recent: upload titles are split into song and film, vague titles are refused');
}

// ---- 2. which catalogue song is the upload's song
{
  const songs = [
    { id: 'a', title: 'Hukum - Thalaivar Alappara', artist: 'Anirudh', album: 'Jailer' },
    { id: 'b', title: 'Hukum', artist: 'Someone', album: 'Other Film' },
    { id: 'c', title: 'Hukum (Remix)', artist: 'DJ', album: 'Jailer' },
  ];
  assert.equal(pickCatalogSong(songs, { title: 'Hukum', film: 'Jailer' })?.id, 'a', 'same title and same film');
  assert.equal(pickCatalogSong(songs, { title: 'Hukum', film: 'Leo' }), null, 'the upload names a film the catalogue song is not from');
  assert.equal(pickCatalogSong(songs.slice(0, 2), { title: 'Hukum', film: '' }), null, 'no film and two possible songs: not sure, so no match');
  assert.equal(pickCatalogSong([songs[1]], { title: 'Hukum', film: '' })?.id, 'b', 'no film but only one candidate');
  assert.equal(pickCatalogSong([], { title: 'Hukum', film: 'Jailer' }), null);
  // an actor or singer in the film slot must not match a compilation album that merely contains the name
  const best = [{ id: 'x', title: 'Veezha Veera (From "O.M: Operation Mole")', artist: 'Sai Abhyankkar', album: 'Best Of Dhanush' }];
  assert.equal(pickCatalogSong(best, { title: 'Veezha Veera', film: 'Dhanush' }), null, 'one-word "film" (really an actor) needs an exact album match');
  const darbar = [{ id: 'y', title: 'Varavaa Varavaa', artist: 'Anirudh', album: "Anirudh's Darbar" }];
  assert.equal(pickCatalogSong(darbar, { title: 'Varavaa Varavaa', film: 'Anirudh' }), null);
  const long = [{ id: 'z', title: 'Annul Maelae', artist: 'Harris', album: 'Vaaranam Aayiram Original Soundtrack' }];
  assert.equal(pickCatalogSong(long, { title: 'Annul Maelae', film: 'Vaaranam Aayiram' })?.id, 'z', 'a longer film name may sit inside the album name');
  console.log('✓ recent: the catalogue song must match the title and, when the upload names one, the film');
}

// ---- 3. recent uploads from the index (newest first, per channel)
{
  const uploads = [{ id: vid(1), title: 'Hukum - Video Song | Jailer' }, { id: vid(2), title: 'Leo - Lyric Video | Leo' }, { id: vid(3), title: 'Naa Ready (Official Video) | Leo' }];
  const json = (b) => ({ ok: true, status: 200, json: async () => b });
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname.split('/').pop();
    if (path === 'playlistItems') return json({ items: uploads.map((x) => ({ contentDetails: { videoId: x.id }, snippet: { title: x.title } })) });
    if (path === 'videos') return json({ items: new URL(url).searchParams.get('id').split(',').map((id) => ({ id, status: { embeddable: true, privacyStatus: 'public' } })) });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const cfg = { youtubeApiKey: 'TESTKEY', videoChannelAllowlist: [CH], youtubeDailyBudget: 5000, videoIndexMaxPages: 1, videoSearchFallback: true };
  const lookup = createVideoLookup({ fetchImpl, cfg, curated: [] });
  const two = await lookup.recentUploads(2);
  assert.deepEqual(two.map((u) => u.videoId), [vid(1), vid(3)], 'newest first; the lyric upload is not an official video song');
  assert.equal((await lookup.recentUploads(1)).length, 1);
  const off = createVideoLookup({ fetchImpl, cfg: { ...cfg, youtubeApiKey: '' }, curated: [] });
  assert.deepEqual(await off.recentUploads(5), [], 'no key: nothing is read');

  // ---- 4. the run: dry run saves nothing, apply saves, known videos are not overwritten
  const catalogue = {
    'hukum jailer': [{ id: 's1', title: 'Hukum', artist: 'Anirudh', album: 'Jailer' }],
    'naa ready leo': [{ id: 's2', title: 'Naa Ready', artist: 'Vijay', album: 'Leo' }],
  };
  const searched = [];
  const search = async (q) => { searched.push(q); return catalogue[q.toLowerCase()] || []; };
  const store = createMemoryStore();
  const dry = await runRecent({ uploads: await lookup.recentUploads(10), search, store });
  assert.equal(dry.counts.matched, 2);
  assert.equal(dry.written, 0);
  assert.equal((await store.list()).length, 0, 'a dry run saves nothing');
  const existing = new Map([[songKey(catalogue['naa ready leo'][0]), { videoId: 'OLDvideo001' }]]);
  const applied = await runRecent({ uploads: await lookup.recentUploads(10), search, store, existing, apply: true });
  assert.equal(applied.counts.alreadyKnown, 1, 'a video that is already saved is not replaced');
  assert.equal(applied.written, 1);
  const rows = await store.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].songKey, songKey(catalogue['hukum jailer'][0]), 'saved under the same key the app looks songs up with');
  assert.equal(rows[0].videoId, vid(1));
  const notFound = await runRecent({ uploads: [{ videoId: vid(9), title: 'Unknown Gem - Video Song | Tiny Film' }, { videoId: vid(8), title: 'Trailer' }], search });
  assert.equal(notFound.counts.notInCatalogue, 1);
  assert.equal(notFound.counts.unparsed, 1);
  assert.deepEqual(notFound.missing, ['Unknown Gem (Tiny Film)']);
  const failing = await runRecent({ uploads: [{ videoId: vid(1), title: 'Hukum - Video Song | Jailer' }], search: async () => { throw new Error('network'); } });
  assert.equal(failing.counts.searchErrors, 1);
  assert.ok(!JSON.stringify([dry, applied]).includes('TESTKEY'), 'the key is never in the report');
  console.log('✓ recent: newest uploads only, dry run saves nothing, apply saves under the app key, known videos are kept, failures are counted');
}

// ---- 5. clips, visualizers and event videos are not video songs (this also protects the live channel index)
{
  const { scoreVideoTitle } = await import('../src/services/music/videoLookup.js');
  for (const bad of ['Veezha Veera | Dhanush | Sai Abhyankkar | #Shorts', 'Scenuke Scene (Visualizer) | Scene | Suriya', 'Bhairavi - Highlights (23 Nov 2026)', 'Dhanush Speech (O.M Pre-Release Event)', 'Kurinji - Preview (24 Nov 2026)', 'Hukum Glimpse | Jailer']) {
    assert.equal(scoreVideoTitle(bad), -1, bad);
  }
  for (const good of ['Hukum - Video Song | Jailer', 'Kaarkuzhal Kadavaiye - 8K Video Song | Vadachennai | Dhanush', 'Ayalaa Ayalaa | Ayalaan | A.R.Rahman']) {
    assert.ok(scoreVideoTitle(good) >= 0, good);
  }
  console.log('✓ recent: shorts, visualizers, highlights, speeches and previews are rejected; real video songs still pass');
}
