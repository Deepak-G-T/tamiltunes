import app from '../src/app.js';
import { initDb } from '../src/prisma/client.js';

const runTests = async () => {
  console.log('--- Starting TamilTunes Backend Integration Tests ---');
  await initDb();

  const server = app.listen(5002);
  const BASE = 'http://localhost:5002/api';

  try {
    // 1. Health check (both /health and /api/health)
    const rootHealth = await fetch('http://localhost:5002/health').then((r) => r.json());
    if (rootHealth.status !== 'ok' || !rootHealth.musicProvider || !rootHealth.cache) {
      throw new Error('Root /health check failed');
    }
    const apiHealth = await fetch(`${BASE}/health`).then((r) => r.json());
    if (apiHealth.status !== 'ok' || apiHealth.cache.ttlMinutes !== 10) {
      throw new Error('API /api/health check failed');
    }
    console.log(`✓ Health Check (Root + API, 10m TTL Cache, Provider: ${rootHealth.musicProvider}): PASSED`);

    // 2. Music Home feed (including Gana category)
    const homeRes = await fetch(`${BASE}/music/home`).then((r) => r.json());
    if (!homeRes.success || !homeRes.data?.trending?.length) throw new Error('Home feed failed');
    if (!homeRes.data.gana || !homeRes.data.gana.length) throw new Error('Film Gana category missing in home feed');
    console.log(`✓ Music Home Feed: PASSED (${homeRes.data.trending.length} trending, ${homeRes.data.gana.length} film gaana)`);

    // 3. Music Search (Anirudh) & Cache verification
    const searchRes1 = await fetch(`${BASE}/music/search?query=Anirudh`).then((r) => r.json());
    if (!searchRes1.success || !searchRes1.data?.songs?.length) throw new Error('Search failed');
    const searchRes2 = await fetch(`${BASE}/music/search?query=Anirudh`).then((r) => r.json());
    const healthAfterCache = await fetch(`${BASE}/health`).then((r) => r.json());
    if (healthAfterCache.cache.hits < 1) throw new Error('Search caching verification failed');
    console.log(`✓ Tamil Search & 10-Minute Cache: PASSED (${searchRes1.data.songs.length} songs found, Cache Hits: ${healthAfterCache.cache.hits})`);

    // 4. User Registration
    const testEmail = `test_${Date.now()}@tamiltunes.com`;
    const regRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Tamil Listener',
        email: testEmail,
        password: 'password123'
      })
    }).then((r) => r.json());
    if (!regRes.success || !regRes.token) throw new Error('Register failed');
    console.log('✓ User Registration: PASSED');

    const token = regRes.token;

    // 5. User Login
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'password123'
      })
    }).then((r) => r.json());
    if (!loginRes.success) throw new Error('Login failed');
    console.log('✓ User Login: PASSED');

    // 6. User Me
    const meRes = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((r) => r.json());
    if (!meRes.success || meRes.user?.name !== 'Test Tamil Listener') throw new Error('Me profile failed');
    console.log('✓ User Me Profile: PASSED');

    // 7. Playlist Operations
    const plRes = await fetch(`${BASE}/playlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'My Best Tamil Hits',
        description: 'Curated 90s and Anirudh tracks'
      })
    }).then((r) => r.json());
    if (!plRes.success) throw new Error('Create playlist failed');
    console.log('✓ Create Playlist: PASSED');

    const playlistId = plRes.playlist.id;

    // 8. Add Song to Playlist
    const addSongRes = await fetch(`${BASE}/playlists/${playlistId}/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        songId: 'tt_trending_1',
        title: 'Badass (Leo)',
        artist: 'Anirudh Ravichander',
        album: 'Leo',
        duration: 229,
        streamUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3'
      })
    }).then((r) => r.json());
    if (!addSongRes.success) throw new Error('Add song failed');
    console.log('✓ Add Song to Playlist: PASSED');

    // 9. Get Playlist by ID
    const getPlRes = await fetch(`${BASE}/playlists/${playlistId}`).then((r) => r.json());
    if (!getPlRes.success || getPlRes.playlist?.songs?.length !== 1) throw new Error('Get playlist failed');
    console.log('✓ Get Playlist by ID: PASSED');

    // 10. Favorites
    const favRes = await fetch(`${BASE}/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        songId: 'tt_trending_2',
        title: 'Hukum - Thalaivar Alappara',
        artist: 'Anirudh Ravichander',
        album: 'Jailer',
        duration: 206
      })
    }).then((r) => r.json());
    if (!favRes.success) throw new Error('Add favorite failed');
    console.log('✓ Add Favorite Song: PASSED');

    const listFavRes = await fetch(`${BASE}/favorites`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((r) => r.json());
    if (!listFavRes.success || listFavRes.favorites?.length !== 1) throw new Error('List favorites failed');
    console.log('✓ List Favorites: PASSED');

    // 11. History
    const histRes = await fetch(`${BASE}/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        songId: 'tt_trending_1',
        title: 'Badass (Leo)',
        artist: 'Anirudh Ravichander',
        album: 'Leo',
        duration: 229
      })
    }).then((r) => r.json());
    if (!histRes.success) throw new Error('Record history failed');
    console.log('✓ Record Listening History: PASSED');

    const listHistRes = await fetch(`${BASE}/history`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((r) => r.json());
    if (!listHistRes.success || listHistRes.history?.length !== 1) throw new Error('List history failed');
    console.log('✓ List Listening History: PASSED');

    console.log('--- ALL INTEGRATION TESTS PASSED 100% SUCCESSFULLY! ---');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
};

runTests();
