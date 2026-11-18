import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import app, { isOriginAllowed } from '../src/app.js';
import { initDb } from '../src/prisma/client.js';
import { musicService, isOfficialFilmRelease } from '../src/services/music/providerManager.js';
import { musicCache } from '../src/services/cacheService.js';
import { config } from '../src/config/env.js';

const runTests = async () => {
  console.log('--- Starting TamilTunes Backend Integration Tests ---');

  if (process.env.TEST_DATABASE_URL) {
    console.log('--- TEST_DATABASE_URL detected: Running prisma migrate deploy and testing against real PostgreSQL ---');
    try {
      // absolute path: works from the repo root and from `npm test --prefix backend` alike
      const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'schema.prisma');
      execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
        env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
        stdio: 'inherit'
      });
      console.log('✓ prisma migrate deploy completed on real test database');
    } catch (migErr) {
      console.error('Failed to run prisma migrate deploy on real test database:', migErr);
      process.exit(1);
    }
  } else {
    console.log('ℹ Real PostgreSQL integration tests: UNTESTED (TEST_DATABASE_URL not set)');
  }

  await initDb();

  // Use isolated Mock Provider by default so tests run fast and offline
  musicService.setProvider('mock');
  musicCache.clear();

  const server = app.listen(5002);
  const BASE = 'http://localhost:5002/api';

  try {
    // 1. Trimmed health check (status & uptime only)
    const rootHealth = await fetch('http://localhost:5002/health').then((r) => r.json());
    if (rootHealth.status !== 'ok' || typeof rootHealth.uptime !== 'number') {
      throw new Error('Root /health check failed');
    }
    const apiHealth = await fetch(`${BASE}/health`).then((r) => r.json());
    if (apiHealth.status !== 'ok' || typeof apiHealth.uptime !== 'number') {
      throw new Error('API /api/health check failed');
    }
    console.log(`✓ Health Check (Trimmed to status & uptime): PASSED (uptime: ${rootHealth.uptime}s)`);

    // =========================================================================
    // 1A. CORS SECURITY SUITE (Origin Whitelist & Evil Origin Rejection)
    // =========================================================================
    console.log('--- Testing CORS Whitelist Enforcement ---');
    // Test 1: https://in-five-11-evil.vercel.app must be rejected
    const evilSubdomainRes = await fetch(`${BASE}/health`, {
      headers: { Origin: 'https://in-five-11-evil.vercel.app' }
    });
    if (evilSubdomainRes.headers.get('access-control-allow-origin')) {
      throw new Error('CORS Failure: https://in-five-11-evil.vercel.app was improperly allowed');
    }

    // Test 2: https://evil.vercel.app must be rejected
    const evilCorsRes = await fetch(`${BASE}/health`, {
      headers: { Origin: 'https://evil.vercel.app' }
    });
    if (evilCorsRes.headers.get('access-control-allow-origin')) {
      throw new Error('CORS Failure: https://evil.vercel.app was improperly allowed');
    }

    // Test 3: http://in-five-11.vercel.app (insecure HTTP) must be rejected
    const insecureHttpRes = await fetch(`${BASE}/health`, {
      headers: { Origin: 'http://in-five-11.vercel.app' }
    });
    if (insecureHttpRes.headers.get('access-control-allow-origin')) {
      throw new Error('CORS Failure: http://in-five-11.vercel.app was improperly allowed');
    }

    // Test 4: https://in-five-11.vercel.app (production HTTPS) must be accepted
    const prodCorsRes = await fetch(`${BASE}/health`, {
      headers: { Origin: 'https://in-five-11.vercel.app' }
    });
    if (prodCorsRes.headers.get('access-control-allow-origin') !== 'https://in-five-11.vercel.app') {
      throw new Error('CORS Failure: https://in-five-11.vercel.app was rejected');
    }

    // Test 5: Pinned VERCEL_TEAM_SLUG preview origin matching
    const teamSlug = 'deepakteam';
    if (!isOriginAllowed(`https://in-five-11-preview-${teamSlug}.vercel.app`, teamSlug)) {
      throw new Error('CORS Failure: Team preview URL was rejected');
    }
    if (isOriginAllowed('https://in-five-11-evil.vercel.app', teamSlug)) {
      throw new Error('CORS Failure: Fake preview URL was accepted when team slug was pinned');
    }

    console.log('✓ CORS Whitelist: PASSED (evil and insecure origins rejected, in-five-11 and team preview accepted)');

    // 2. Music Home feed (including Film Gaana category via mock provider)
    const homeRes = await fetch(`${BASE}/music/home`).then((r) => r.json());
    if (!homeRes.success || !homeRes.data?.trending?.length) throw new Error('Home feed failed');
    if (!homeRes.data.gana || !homeRes.data.gana.length) throw new Error('Film Gana category missing in home feed');
    console.log(`✓ Music Home Feed: PASSED (${homeRes.data.trending.length} trending, ${homeRes.data.gana.length} film gaana)`);

    // 3. Music Search (Anirudh) & LRU 10-Minute Cache verification
    const searchRes1 = await fetch(`${BASE}/music/search?query=Anirudh`).then((r) => r.json());
    if (!searchRes1.success || !searchRes1.data?.songs?.length) throw new Error('Search failed');
    const searchRes2 = await fetch(`${BASE}/music/search?query=Anirudh`).then((r) => r.json());
    const stats = musicCache.stats();
    if (stats.hits < 1) throw new Error('Search LRU caching verification failed');
    console.log(`✓ Tamil Search & LRU Cache: PASSED (${searchRes1.data.songs.length} songs found, Cache Hits: ${stats.hits}, Keys: ${stats.keys}/${stats.maxEntries})`);

    // 4. User Registration (User A)
    const userAEmail = `user_a_${Date.now()}@tamiltunes.com`;
    const regResA = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'User A (Owner)',
        email: userAEmail,
        password: 'password123'
      })
    }).then((r) => r.json());
    if (!regResA.success || !regResA.token) throw new Error('Register User A failed');
    const tokenA = regResA.token;
    console.log('✓ User Registration: PASSED');

    // 5. User Login
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password: 'password123'
      })
    }).then((r) => r.json());
    if (!loginRes.success) throw new Error('Login failed');
    console.log('✓ User Login: PASSED');

    // 6. User Me
    const meRes = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    }).then((r) => r.json());
    if (!meRes.success || meRes.user?.name !== 'User A (Owner)') throw new Error('Me profile failed');
    console.log('✓ User Me Profile: PASSED');

    // 7. Playlist Operations (User A creates Playlist)
    const plRes = await fetch(`${BASE}/playlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        name: 'User A Private Tamil Playlist',
        description: 'Curated 90s and Anirudh tracks'
      })
    }).then((r) => r.json());
    if (!plRes.success) throw new Error('Create playlist failed');
    const playlistId = plRes.playlist.id;
    console.log('✓ Create Playlist: PASSED');

    // 8. Add Song to Playlist
    const addSongRes = await fetch(`${BASE}/playlists/${playlistId}/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
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

    // 9. Get Playlist by ID: private by default (owner only), public once toggled
    const anonPl = await fetch(`${BASE}/playlists/${playlistId}`);
    if (anonPl.status !== 404) throw new Error('Private playlist leaked to anonymous request');
    const getPlRes = await fetch(`${BASE}/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    }).then((r) => r.json());
    if (!getPlRes.success || getPlRes.playlist?.songs?.length !== 1) throw new Error('Get playlist failed');
    if (getPlRes.playlist.user) throw new Error('Playlist response must not embed the owner user row');
    const makePublic = await fetch(`${BASE}/playlists/${playlistId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: getPlRes.playlist.name, isPublic: true })
    }).then((r) => r.json());
    if (!makePublic.success || makePublic.playlist.isPublic !== true) throw new Error('Making playlist public failed');
    const anonPublic = await fetch(`${BASE}/playlists/${playlistId}`).then((r) => r.json());
    if (!anonPublic.success) throw new Error('Public playlist should be readable without login');
    console.log('✓ Get Playlist by ID (private by default, public when toggled, no owner row leaked): PASSED');

    // 9B. List Playlists Pagination Envelope
    const listPlRes = await fetch(`${BASE}/playlists?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    }).then((r) => r.json());
    if (!listPlRes.success || !Array.isArray(listPlRes.items) || listPlRes.total !== 1 || typeof listPlRes.hasMore !== 'boolean') {
      throw new Error('List playlists pagination envelope { items, total, limit, offset, hasMore } verification failed');
    }
    console.log(`✓ List Playlists Pagination Envelope ({ items, total: ${listPlRes.total}, limit: ${listPlRes.limit}, offset: ${listPlRes.offset}, hasMore: ${listPlRes.hasMore} }): PASSED`);

    // 10. Favorites
    const favRes = await fetch(`${BASE}/favorites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
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

    const listFavRes = await fetch(`${BASE}/favorites?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    }).then((r) => r.json());
    if (!listFavRes.success || !Array.isArray(listFavRes.items) || listFavRes.total !== 1 || typeof listFavRes.hasMore !== 'boolean') {
      throw new Error('List favorites pagination envelope { items, total, limit, offset, hasMore } verification failed');
    }
    console.log(`✓ List Favorites Pagination Envelope ({ items, total: ${listFavRes.total}, limit: ${listFavRes.limit}, offset: ${listFavRes.offset}, hasMore: ${listFavRes.hasMore} }): PASSED`);

    // 10B. Favorites IDs Only Endpoint (GET /api/favorites/ids)
    const favIdsRes = await fetch(`${BASE}/favorites/ids`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    }).then((r) => r.json());
    if (!favIdsRes.success || !Array.isArray(favIdsRes.ids) || !favIdsRes.ids.includes('tt_trending_2') || favIdsRes.total !== 1) {
      throw new Error('GET /api/favorites/ids failed');
    }
    console.log(`✓ Favorites IDs Only Endpoint (GET /api/favorites/ids, up to 5000 IDs): PASSED (returned [${favIdsRes.ids.join(', ')}])`);

    // 11. History
    const histRes = await fetch(`${BASE}/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
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

    const listHistRes = await fetch(`${BASE}/history?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    }).then((r) => r.json());
    if (!listHistRes.success || !Array.isArray(listHistRes.items) || listHistRes.total !== 1 || typeof listHistRes.hasMore !== 'boolean') {
      throw new Error('List history pagination envelope { items, total, limit, offset, hasMore } verification failed');
    }
    console.log(`✓ List Listening History Pagination Envelope ({ items, total: ${listHistRes.total}, limit: ${listHistRes.limit}, offset: ${listHistRes.offset}, hasMore: ${listHistRes.hasMore} }): PASSED`);

    // =========================================================================
    // 12. NEW TEST SUITE: Playlist Ownership & Cross-User Authorization
    // =========================================================================
    console.log('--- Testing Playlist Ownership & Authorization ---');
    // Register User B
    const userBEmail = `user_b_${Date.now()}@tamiltunes.com`;
    const regResB = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'User B (Attacker/Stranger)',
        email: userBEmail,
        password: 'password123'
      })
    }).then((r) => r.json());
    const tokenB = regResB.token;

    // Test A: User B attempts to edit User A's playlist (expect 403 Forbidden)
    const editRes = await fetch(`${BASE}/playlists/${playlistId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        name: 'Hacked Playlist Name'
      })
    });
    if (editRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden on cross-user playlist edit, got ${editRes.status}`);
    }
    const editData = await editRes.json();
    if (editData.success !== false) throw new Error('Cross-user playlist edit returned success=true');

    // Test B: User B attempts to delete User A's playlist (expect 403 Forbidden)
    const deleteRes = await fetch(`${BASE}/playlists/${playlistId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    if (deleteRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden on cross-user playlist delete, got ${deleteRes.status}`);
    }

    // Test C: User B attempts to add a song to User A's playlist (expect 403 Forbidden)
    const addSongCrossRes = await fetch(`${BASE}/playlists/${playlistId}/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        songId: 'tt_trending_3',
        title: 'Unauthorized Track'
      })
    });
    if (addSongCrossRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden on cross-user song add, got ${addSongCrossRes.status}`);
    }
    console.log('✓ Playlist Ownership (User A cannot be edited/deleted by User B): PASSED (HTTP 403)');

    // =========================================================================
    // 13. NEW TEST SUITE: Authentication Failures
    // =========================================================================
    console.log('--- Testing Authentication Failures ---');
    // Test A: Missing Authorization Header on protected route
    const missingTokenRes = await fetch(`${BASE}/playlists`);
    if (missingTokenRes.status !== 401) {
      throw new Error(`Expected 401 on missing token, got ${missingTokenRes.status}`);
    }

    // Test B: Malformed / Invalid JWT token
    const invalidTokenRes = await fetch(`${BASE}/playlists`, {
      headers: { Authorization: 'Bearer totally_invalid_jwt_token_gibberish' }
    });
    if (invalidTokenRes.status !== 401) {
      throw new Error(`Expected 401 on malformed token, got ${invalidTokenRes.status}`);
    }

    // Test C: Login with incorrect password
    const badLoginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password: 'wrong_password_123'
      })
    });
    if (badLoginRes.status !== 401) {
      throw new Error(`Expected 401 on invalid password, got ${badLoginRes.status}`);
    }
    console.log('✓ Authentication Failures (Missing Token, Invalid JWT, Bad Password): PASSED (HTTP 401)');

    // =========================================================================
    // 14. NEW TEST SUITE: Input Validation Errors
    // =========================================================================
    console.log('--- Testing Request Body Validation Errors ---');
    // Test A: Register with invalid email
    const invalidEmailRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tester',
        email: 'not-a-valid-email-string',
        password: 'password123'
      })
    });
    if (invalidEmailRes.status !== 400) {
      throw new Error(`Expected 400 on invalid email, got ${invalidEmailRes.status}`);
    }

    // Test B: Register with short password (< 6 chars)
    const shortPasswordRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Tester',
        email: `short_pw_${Date.now()}@example.com`,
        password: '123'
      })
    });
    if (shortPasswordRes.status !== 400) {
      throw new Error(`Expected 400 on short password, got ${shortPasswordRes.status}`);
    }

    // Test C: Create playlist with empty name
    const emptyPlaylistNameRes = await fetch(`${BASE}/playlists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        name: '',
        description: 'Invalid empty name playlist'
      })
    });
    if (emptyPlaylistNameRes.status !== 400) {
      throw new Error(`Expected 400 on empty playlist name, got ${emptyPlaylistNameRes.status}`);
    }

    // Test D: Zod Advisory Reachability Test (Oversized payload > 1MB)
    const oversizedPayload = JSON.stringify({
      name: 'Adversarial Tester',
      email: 'oversized@example.com',
      password: 'password123',
      junkData: 'A'.repeat(1024 * 1024 + 50) // > 1MB
    });
    const oversizedRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedPayload
    });
    if (oversizedRes.status !== 413) {
      throw new Error(`Expected 413 Payload Too Large for >1MB payload, got ${oversizedRes.status}`);
    }

    // Test E: Deeply nested JSON payload under 1MB
    let nestedObj = {};
    let pointer = nestedObj;
    for (let i = 0; i < 300; i++) {
      pointer.nested = {};
      pointer = pointer.nested;
    }
    pointer.email = 'not-an-email';
    pointer.password = '123';
    const nestedRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nestedObj)
    });
    if (nestedRes.status !== 400) {
      throw new Error(`Expected 400 validation error on deeply nested payload, got ${nestedRes.status}`);
    }
    console.log('✓ Input Validation & Zod Advisory Reachability: PASSED (Invalid Email/Password 400, >1MB Payload 413, Deeply Nested <1MB 400)');

    // =========================================================================
    // 14B. YOUTUBE PROVIDER HOME FEED INTEGRITY & VIDEOID ENFORCEMENT
    // =========================================================================
    console.log('--- Testing YouTube Provider Home Feed videoId Completeness ---');
    musicService.setProvider('youtube');
    musicCache.clear();

    const ytHomeRes = await fetch(`${BASE}/music/home`).then((r) => r.json());
    if (!ytHomeRes.success || !ytHomeRes.data) {
      throw new Error('Failed to retrieve home feed with MUSIC_PROVIDER=youtube');
    }

    const shelvesToCheck = [
      'trending',
      'latest',
      'gana',
      'melodies',
      'nineties',
      'twoThousands',
      'love',
      'sad',
      'folk',
      'instrumental'
    ];

    let totalSongsVerified = 0;
    for (const shelf of shelvesToCheck) {
      const songs = ytHomeRes.data[shelf] || [];
      for (const song of songs) {
        if (!song.videoId || typeof song.videoId !== 'string' || song.videoId.trim() === '') {
          throw new Error(`YouTube home-feed song "${song.title}" in shelf "${shelf}" is missing videoId!`);
        }
        if (song.source !== 'youtube') {
          throw new Error(`YouTube home-feed song "${song.title}" in shelf "${shelf}" has invalid source: ${song.source}`);
        }
        if (song.provider !== 'youtube') {
          throw new Error(`YouTube home-feed song "${song.title}" in shelf "${shelf}" has invalid provider: ${song.provider}`);
        }
        totalSongsVerified++;
      }
    }
    console.log(`✓ YouTube Provider Home Feed: PASSED (${totalSongsVerified} songs verified across shelves, 100% contain videoId/source/provider)`);

    // =========================================================================
    // 14C. GET /api/music/song/:id RECOVERY ENDPOINT & CACHE BYPASS TESTS
    // =========================================================================
    console.log('--- Testing GET /api/music/song/:id Endpoint & fresh=1 Cache Bypass ---');
    const songSuccessRes = await fetch(`${BASE}/music/song/yt_badass_leo`).then((r) => r.json());
    if (!songSuccessRes.success || songSuccessRes.data?.id !== 'yt_badass_leo' || !songSuccessRes.data?.videoId) {
      throw new Error(`Expected GET /api/music/song/yt_badass_leo to return song with videoId, got ${JSON.stringify(songSuccessRes)}`);
    }

    // Verify cache key includes active provider name
    const expectedCacheKey = `song_youtube_yt_badass_leo`;
    if (!musicCache.has(expectedCacheKey)) {
      throw new Error(`Expected cache to contain key "${expectedCacheKey}", keys: ${JSON.stringify(musicCache.keys())}`);
    }

    // Mutate cached value to verify cache hit without fresh
    musicCache.set(expectedCacheKey, { ...songSuccessRes.data, title: 'MUTATED_CACHED_TITLE' }, 600);
    const cachedHitRes = await fetch(`${BASE}/music/song/yt_badass_leo`).then((r) => r.json());
    if (cachedHitRes.data?.title !== 'MUTATED_CACHED_TITLE') {
      throw new Error(`Expected normal GET to hit cache with mutated title, got "${cachedHitRes.data?.title}"`);
    }

    // With fresh=1, cache must be bypassed and fresh song returned
    const freshRes = await fetch(`${BASE}/music/song/yt_badass_leo?fresh=1`).then((r) => r.json());
    if (freshRes.data?.title === 'MUTATED_CACHED_TITLE' || !freshRes.data?.title.includes('Badass')) {
      throw new Error(`Expected GET with fresh=1 to bypass cache, got "${freshRes.data?.title}"`);
    }

    const songNotFoundRes = await fetch(`${BASE}/music/song/non_existent_id_9999`);
    if (songNotFoundRes.status !== 404) {
      throw new Error(`Expected 404 for non-existent song, got ${songNotFoundRes.status}`);
    }
    const songNotFoundJson = await songNotFoundRes.json();
    if (songNotFoundJson.success !== false) {
      throw new Error(`Expected success: false for non-existent song, got ${JSON.stringify(songNotFoundJson)}`);
    }
    console.log('✓ GET /api/music/song/:id Recovery Endpoint: PASSED (200 on valid ID, cache key has provider, fresh=1 bypasses cache, 404 on missing ID)');

    // =========================================================================
    // 14D. STREAMING PROXY SECURITY & HOST ALLOW-LIST TESTS
    // =========================================================================
    console.log('--- Testing /api/music/stream Security & Host Allowlist ---');
    // When config.enableExternalStreams is false (default), requests must return 403 Forbidden
    const streamForbiddenRes = await fetch(`${BASE}/music/stream?url=https://aac.saavncdn.com/test.mp4`);
    if (streamForbiddenRes.status !== 403) {
      throw new Error(`Expected 403 when ENABLE_EXTERNAL_STREAMS is false, got ${streamForbiddenRes.status}`);
    }

    // Temporarily enable stream proxy to test host allowlist enforcement
    config.enableExternalStreams = true;
    const streamSsrRes = await fetch(`${BASE}/music/stream?url=http://169.254.169.254/latest/meta-data/`);
    if (streamSsrRes.status !== 403) {
      throw new Error(`Expected 403 for SSRF internal IP host, got ${streamSsrRes.status}`);
    }
    const streamEvilRes = await fetch(`${BASE}/music/stream?url=https://evil.com/malicious.mp3`);
    if (streamEvilRes.status !== 403) {
      throw new Error(`Expected 403 for unlisted evil.com host, got ${streamEvilRes.status}`);
    }
    config.enableExternalStreams = false; // Restore to default false
    console.log('✓ /api/music/stream Security: PASSED (disabled by default with 403, rejects non-allowlisted and internal hosts)');

    // Reset back to mock provider for remaining tests
    musicService.setProvider('mock');
    musicCache.clear();

    // =========================================================================
    // 15. NEW TEST SUITE: Table-Driven Tamil Filter Test (20 Sample Tracks)
    // =========================================================================
    console.log('--- Testing Tamil Filter with 20 Sample Tracks (Table-Driven) ---');
    const SAMPLE_TRACKS = [
      // 1. Kollywood Hit (Anirudh)
      { track: { id: 's1', title: 'Badass (Leo)', artist: 'Anirudh Ravichander', album: 'Leo', language: 'tamil' }, expect: true },
      // 2. A.R. Rahman Soundtrack
      { track: { id: 's2', title: 'Aalaporaan Thamizhan', artist: 'A.R. Rahman, Kailash Kher', album: 'Mersal', language: 'tamil' }, expect: true },
      // 3. Ilaiyaraaja Classic
      { track: { id: 's3', title: 'Thendral Vanthu Theendum Pothu', artist: 'Ilaiyaraaja, S. Janaki', album: 'Avatharam', language: 'tamil' }, expect: true },
      // 4. Yuvan Shankar Raja Melodies
      { track: { id: 's4', title: 'Thuli Thuli (From "Paiya")', artist: 'Yuvan Shankar Raja, Haricharan', album: 'Paiya', language: 'tamil' }, expect: true },
      // 5. Harris Jayaraj Romance
      { track: { id: 's5', title: 'Vaseegara', artist: 'Harris Jayaraj, Bombay Jayashri', album: 'Minnale', language: 'tamil' }, expect: true },
      // 6. Sai Abhyankkar Film Hit
      { track: { id: 's6', title: 'Veezha Veera (From "OM Chapter 1: Udhiram - The Blood Wood") [Tamil]', artist: 'Sai Abhyankkar, Tippu', album: 'Veezha Veera', language: 'tamil' }, expect: true },
      // 7. Official Label (Sony Music South)
      { track: { id: 's7', title: 'Ordinary Person', artist: 'Nikhita Gandhi', album: 'Leo', label: 'Sony Music South', language: 'tamil' }, expect: true },
      // 8. Film Gaana Indicator
      { track: { id: 's8', title: 'Marana Mass (From "Petta")', artist: 'Anirudh Ravichander, SPB', album: 'Petta', language: 'tamil' }, expect: true },
      // 9. Independent Release via Think Indie
      { track: { id: 's9', title: 'Katchi Sera', artist: 'Sai Abhyankkar', album: 'Katchi Sera', label: 'Think Indie', language: 'tamil' }, expect: true },
      // 10. Legendary Devotional by TMS
      { track: { id: 's10', title: 'Ullam Uruguthaiya', artist: 'T.M. Soundararajan', album: 'Murugan Devotional', language: 'tamil' }, expect: true },
      // 11. Telugu Dub (Explicit Title Tag)
      { track: { id: 's11', title: 'Badass [Telugu]', artist: 'Anirudh Ravichander', album: 'Leo (Telugu)', language: 'telugu' }, expect: false },
      // 12. Hindi Version (Language hindi)
      { track: { id: 's12', title: 'Chaleya (Hindi)', artist: 'Anirudh Ravichander, Arijit Singh', album: 'Jawan', language: 'hindi' }, expect: false },
      // 13. Kannada Song (Language kannada)
      { track: { id: 's13', title: 'Sulthana', artist: 'KGF Team', album: 'KGF Chapter 2', language: 'kannada' }, expect: false },
      // 14. Malayalam Dub (Explicit Title Tag)
      { track: { id: 's14', title: 'Hukum [Malayalam]', artist: 'Anirudh Ravichander', album: 'Jailer', language: 'malayalam' }, expect: false },
      // 15. Marathi Folk Song (Language marathi)
      { track: { id: 's15', title: 'Sur Niragas Ho', artist: 'Shankar Mahadevan', album: 'Katyar Kaljat Ghusali', language: 'marathi' }, expect: false },
      // 16. WhatsApp Status Spam
      { track: { id: 's16', title: 'Anirudh BGM Whatsapp Status 30s', artist: 'Anirudh Ravichander', album: 'Status World', language: 'tamil' }, expect: false },
      // 17. Bass Boosted Spam
      { track: { id: 's17', title: 'Badass Leo 8D Bass Boosted HQ', artist: 'Anirudh Ravichander', album: 'DJ Remix Bass', language: 'tamil' }, expect: false },
      // 18. Slowed Reverb Spam
      { track: { id: 's18', title: 'Vaseegara (slowed + reverbed)', artist: 'Harris Jayaraj', album: 'Lofi Vibes', language: 'tamil' }, expect: false },
      // 19. Amateur Gana Single (No Official Label/Film/Composer)
      { track: { id: 's19', title: 'Trending La Alla Pudikum', artist: 'Salem Gana Velu', album: 'Local Singles', language: 'tamil' }, expect: false },
      // 20. Meme Reels Gaana
      { track: { id: 's20', title: 'Unakosam En Usura Tharuvan', artist: 'Trending Gana Surya', album: 'Instagram Reels Viral', language: 'tamil' }, expect: false }
    ];

    let passedSampleCount = 0;
    for (const { track, expect: expectedResult } of SAMPLE_TRACKS) {
      const actual = isOfficialFilmRelease(track);
      if (actual !== expectedResult) {
        throw new Error(`Filter mismatch for track "${track.title}": expected ${expectedResult}, got ${actual}`);
      }
      passedSampleCount++;
    }
    console.log(`✓ Table-Driven Tamil Filter (20/20 Tracks Correctly Kept/Dropped): PASSED`);

    // Optional Live Upstream Smoke Test (gated by TEST_LIVE_API=true)
    if (process.env.TEST_LIVE_API === 'true') {
      console.log('--- Running Optional Live Upstream Smoke Test (JioSaavn) ---');
      musicService.setProvider('jiosaavn');
      const liveRes = await fetch(`${BASE}/music/search?query=Anirudh`).then((r) => r.json());
      if (!liveRes.success || !liveRes.data?.songs?.length) throw new Error('Live search smoke test failed');
      console.log(`✓ Optional Live Upstream Smoke Test: PASSED (${liveRes.data.songs.length} live tracks retrieved)`);
    }

    console.log('--- ALL INTEGRATION & SECURITY TESTS PASSED 100% SUCCESSFULLY! ---');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
};

runTests();
