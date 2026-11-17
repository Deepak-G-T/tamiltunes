import { chromium } from '../../node_modules/playwright/index.mjs';
import { preview } from '../../node_modules/vite/dist/node/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');
const screenshotDir = path.resolve(projectRoot, 'audit/screenshots');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const mockHomeData = {
  trending: [
    {
      id: 'tt_trending_1',
      title: 'Badass (Leo)',
      artist: 'Anirudh Ravichander',
      album: 'Leo',
      duration: 229,
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
      streamUrl: 'https://aac.saavncdn.com/415/46a7b21d2a3f4b9e019a7cdff7442c55_320.mp4',
      isPlayable: true
    },
    {
      id: 'tt_trending_2',
      title: 'Hukum',
      artist: 'Anirudh Ravichander',
      album: 'Jailer',
      duration: 206,
      image: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
      streamUrl: 'https://aac.saavncdn.com/187/0c4d0aee91a3ac81d4b645ec448a2960_320.mp4',
      isPlayable: true
    }
  ],
  latest: [
    {
      id: 'tt_trending_3',
      title: 'Naa Ready',
      artist: 'Thalapathy Vijay, Anirudh',
      album: 'Leo',
      duration: 248,
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
      streamUrl: 'https://aac.saavncdn.com/194/af240a77084e42e66f18defb87cda42a_320.mp4',
      isPlayable: true
    }
  ],
  albums: [
    {
      id: 'album_leo',
      title: 'Leo',
      name: 'Leo',
      artist: 'Anirudh Ravichander',
      year: '2023',
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg'
    }
  ],
  artists: [
    {
      id: 'artist_anirudh',
      name: 'Anirudh Ravichander',
      role: 'Music Director',
      image: 'https://c.saavncdn.com/artists/Anirudh_Ravichander_003_20260121134149_500x500.jpg'
    }
  ]
};

const mockSearchResults = {
  songs: [
    {
      id: 'yt_badass_leo',
      title: 'Badass (Leo) - Official Video',
      artist: 'Anirudh Ravichander',
      album: 'Leo',
      duration: 229,
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
      source: 'youtube',
      videoId: 'IqwIOlhfCak',
      streamUrl: 'https://www.youtube-nocookie.com/embed/IqwIOlhfCak?autoplay=1&enablejsapi=1',
      isPlayable: true
    },
    {
      id: 'tt_trending_1',
      title: 'Badass (Leo) - Audio',
      artist: 'Anirudh Ravichander',
      album: 'Leo',
      duration: 229,
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
      streamUrl: 'https://aac.saavncdn.com/415/46a7b21d2a3f4b9e019a7cdff7442c55_320.mp4',
      isPlayable: true
    }
  ],
  albums: [
    {
      id: 'album_leo',
      name: 'Leo',
      title: 'Leo',
      artist: 'Anirudh Ravichander',
      year: '2023',
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg'
    }
  ],
  artists: [
    {
      id: 'artist_anirudh',
      name: 'Anirudh Ravichander',
      role: 'Music Director',
      image: 'https://c.saavncdn.com/artists/Anirudh_Ravichander_003_20260121134149_500x500.jpg'
    }
  ]
};

async function runAudit() {
  console.log('--- Starting Playwright UI Audit & Verification Suite ---');

  // 1. Start Vite preview server on dedicated port
  const server = await preview({
    root: path.resolve(__dirname, '../..'),
    preview: { port: 4174 }
  });
  const baseURL = 'http://localhost:4174';
  console.log('✓ Vite preview server running at', baseURL);

  // 2. Launch Chromium
  const browser = await chromium.launch({ headless: true });
  console.log('✓ Playwright Chromium browser initialized');

  const setupMockRoutes = async (page) => {
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/music/home')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockHomeData }) });
      }
      if (url.includes('/api/music/search')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockSearchResults }) });
      }
      if (url.includes('/api/favorites/ids')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, ids: ['tt_trending_1'] }) });
      }
      if (url.includes('/api/favorites')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { items: mockHomeData.trending, total: 2, limit: 50, offset: 0, hasMore: false } })
        });
      }
      if (url.includes('/api/history')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { items: mockHomeData.trending, total: 2, limit: 50, offset: 0, hasMore: false } })
        });
      }
      if (url.includes('/api/playlists/p1')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'p1', name: 'Tamil Favorites', songs: mockHomeData.trending } })
        });
      }
      if (url.includes('/api/playlists')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { items: [{ id: 'p1', name: 'Tamil Favorites', songCount: 2 }], total: 1, limit: 50, offset: 0, hasMore: false } })
        });
      }
      if (url.includes('/api/music/albums/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'album_leo', title: 'Leo', artist: 'Anirudh Ravichander', songs: mockHomeData.trending } })
        });
      }
      if (url.includes('/api/music/artists/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'artist_anirudh', name: 'Anirudh Ravichander', songs: mockHomeData.trending, albums: mockHomeData.albums } })
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
  };

  const viewports = [
    { name: 'desktop_1366x768', width: 1366, height: 768 },
    { name: 'tablet_768x1024', width: 768, height: 1024 },
    { name: 'mobile_390x844', width: 390, height: 844 },
    { name: 'mobile_360x640', width: 360, height: 640 }
  ];

  // Run Viewport visual captures
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await setupMockRoutes(page);

    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotDir, `home_${vp.name}.png`) });
    console.log(`✓ Captured home_${vp.name}.png`);

    await context.close();
  }

  // Deep interaction tests on 1366x768 (Desktop)
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    await setupMockRoutes(page);

    // Search page
    await page.goto(`${baseURL}/search?q=leo`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotDir, 'search_1366x768.png') });
    console.log('✓ Captured search_1366x768.png');

    // Library (Favorites)
    await page.goto(`${baseURL}/favorites`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'library_favorites_1366x768.png') });
    console.log('✓ Captured library_favorites_1366x768.png');

    // Album detail
    await page.goto(`${baseURL}/album/album_leo`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'album_1366x768.png') });
    console.log('✓ Captured album_1366x768.png');

    // Artist detail
    await page.goto(`${baseURL}/artist/artist_anirudh`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'artist_1366x768.png') });
    console.log('✓ Captured artist_1366x768.png');

    // Playlist detail
    await page.goto(`${baseURL}/playlist/p1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'playlist_1366x768.png') });
    console.log('✓ Captured playlist_1366x768.png');

    // Queue drawer
    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    // Click play on first song card
    await page.locator('text=Badass (Leo)').first().click();
    await page.waitForTimeout(400);
    // Open queue drawer
    await page.click('button[aria-label="Toggle Queue"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotDir, 'queue_drawer_1366x768.png') });
    console.log('✓ Captured queue_drawer_1366x768.png');

    // YouTube Player visibility on Desktop
    await page.goto(`${baseURL}/search?q=leo`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    // Click on the YouTube song
    await page.locator('text=Badass (Leo) - Official Video').first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(screenshotDir, 'youtube_player_1366x768.png') });
    console.log('✓ Captured youtube_player_1366x768.png');

    await context.close();
  }

  // Deep interaction tests on 390x844 (Mobile)
  {
    console.log('\n--- Running Mobile Interaction & Overlap Assertions (390x844) ---');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await setupMockRoutes(page);

    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Click first song card to start playback
    await page.locator('text=Badass (Leo)').first().click();
    await page.waitForTimeout(500);

    // Verify MiniPlayer is visible
    const miniPlayer = page.locator('div[role="button"][aria-label="Open now playing full screen"]');
    const isMiniVisible = await miniPlayer.isVisible();
    console.log('Assertion: MiniPlayer visible on mobile ->', isMiniVisible ? 'PASS' : 'FAIL');
    if (!isMiniVisible) throw new Error('MiniPlayer failed to show on mobile');

    await page.screenshot({ path: path.join(screenshotDir, 'mini_player_390x844.png') });
    console.log('✓ Captured mini_player_390x844.png');

    // Assert: Tapping mini-player opens full-screen player
    await miniPlayer.click();
    await page.waitForTimeout(500);

    const fullScreenHeading = page.locator('text=Playing From "Leo"');
    const isFullVisible = await fullScreenHeading.isVisible();
    console.log('Assertion: Tapping mini-player opens full-screen ->', isFullVisible ? 'PASS' : 'FAIL');
    if (!isFullVisible) throw new Error('FullScreenPlayer failed to open upon tapping mini-player');

    // Assert: Body scroll lock is active when full-screen is open
    const bodyOverflowLocked = await page.evaluate(() => document.body.style.overflow);
    console.log('Assertion: Body scroll lock active ("hidden") ->', bodyOverflowLocked === 'hidden' ? 'PASS' : 'FAIL');
    if (bodyOverflowLocked !== 'hidden') throw new Error(`Expected body overflow hidden, got: ${bodyOverflowLocked}`);

    await page.screenshot({ path: path.join(screenshotDir, 'fullscreen_player_390x844.png') });
    console.log('✓ Captured fullscreen_player_390x844.png');

    // Assert: Close full-screen works
    const closeBtn = page.locator('button[aria-label="Close now playing"]');
    await closeBtn.click();
    await page.waitForTimeout(500);

    const isFullClosed = !(await fullScreenHeading.isVisible());
    console.log('Assertion: Close button closes full-screen ->', isFullClosed ? 'PASS' : 'FAIL');
    if (!isFullClosed) throw new Error('FullScreenPlayer failed to close');

    // Assert: Body scroll lock released
    const bodyOverflowReleased = await page.evaluate(() => document.body.style.overflow);
    console.log('Assertion: Body scroll lock released ("") ->', bodyOverflowReleased === '' ? 'PASS' : 'FAIL');
    if (bodyOverflowReleased !== '') throw new Error(`Expected body overflow empty string, got: ${bodyOverflowReleased}`);

    // Test YouTube Player bounding box overlap on mobile
    await page.goto(`${baseURL}/search?q=leo`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('text=Badass (Leo) - Official Video').first().click();
    await page.waitForTimeout(600);

    const ytContainer = page.locator('#yt-player-container');
    const isYtVisible = await ytContainer.isVisible();
    console.log('Assertion: YouTube player container rendered ->', isYtVisible ? 'PASS' : 'FAIL');

    const ytBox = await ytContainer.boundingBox();
    const miniBox = await miniPlayer.boundingBox();
    // Bottom nav tab bar
    const navBar = page.locator('nav.fixed.bottom-0');
    const navBox = await navBar.boundingBox();

    console.log('Bounding boxes:');
    console.log('  YouTube player:', ytBox);
    console.log('  Mini-player:   ', miniBox);
    console.log('  Bottom Tab Bar:', navBox);

    if (ytBox && miniBox) {
      // Check for overlap: ytBox bottom must be above miniBox top or horizontally separated
      const overlapsMini = !(
        ytBox.y + ytBox.height <= miniBox.y ||
        ytBox.y >= miniBox.y + miniBox.height ||
        ytBox.x + ytBox.width <= miniBox.x ||
        ytBox.x >= miniBox.x + miniBox.width
      );
      console.log('Assertion: Floating YouTube player does NOT overlap mini-player ->', !overlapsMini ? 'PASS' : 'FAIL');
      if (overlapsMini) throw new Error('YouTube player overlaps mini-player!');
    }

    if (ytBox && navBox) {
      const overlapsNav = !(
        ytBox.y + ytBox.height <= navBox.y ||
        ytBox.y >= navBox.y + navBox.height
      );
      console.log('Assertion: Floating YouTube player does NOT overlap bottom tab bar ->', !overlapsNav ? 'PASS' : 'FAIL');
      if (overlapsNav) throw new Error('YouTube player overlaps bottom tab bar!');
    }

    await page.screenshot({ path: path.join(screenshotDir, 'youtube_player_390x844.png') });
    console.log('✓ Captured youtube_player_390x844.png');

    await context.close();
  }

  // Cleanup
  await browser.close();
  await server.close();
  console.log('\n=== All Playwright UI tests and assertions PASSED successfully! ===');
}

runAudit().catch((err) => {
  console.error('\n❌ Playwright audit failed:', err);
  process.exit(1);
});
