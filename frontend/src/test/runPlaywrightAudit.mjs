import { chromium } from '../../node_modules/playwright/index.mjs';
import { preview } from '../../node_modules/vite/dist/node/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');
// Optional: point at an existing Chromium binary (e.g. CHROMIUM_PATH=/opt/pw-browsers/chromium); default unchanged
const chromiumOverride = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const screenshotDir = path.resolve(projectRoot, 'audit/screenshots');

if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

// Authentic YouTube Tamil songs feed shape
const mockHomeData = {
  trending: [
    {
      id: 'yt_badass_leo',
      title: 'Badass (Leo)',
      artist: 'Anirudh Ravichander',
      singers: 'Anirudh Ravichander',
      album: 'Leo',
      duration: 229,
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
      youtubeId: 'IqwIOlhfCak',
      embedUrl: 'https://www.youtube-nocookie.com/embed/IqwIOlhfCak?autoplay=1&enablejsapi=1',
      streamUrl: 'https://www.youtube-nocookie.com/embed/IqwIOlhfCak?autoplay=1&enablejsapi=1',
      isPlayable: true,
      provider: 'youtube',
      source: 'youtube',
      videoId: 'IqwIOlhfCak',
      category: 'trending',
      licenseNotice: 'Official YouTube IFrame Player Embed (Sony Music South)'
    },
    {
      id: 'yt_hukum_jailer',
      title: 'Hukum - Thalaivar Alappara',
      artist: 'Anirudh Ravichander, Super Subu',
      singers: 'Anirudh Ravichander',
      album: 'Jailer',
      duration: 206,
      image: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
      youtubeId: '1F3hm6MfR1k',
      embedUrl: 'https://www.youtube-nocookie.com/embed/1F3hm6MfR1k?autoplay=1&enablejsapi=1',
      streamUrl: 'https://www.youtube-nocookie.com/embed/1F3hm6MfR1k?autoplay=1&enablejsapi=1',
      isPlayable: true,
      provider: 'youtube',
      source: 'youtube',
      videoId: '1F3hm6MfR1k',
      category: 'trending',
      licenseNotice: 'Official YouTube IFrame Player Embed (Sun TV)'
    },
    {
      id: 'yt_naa_ready',
      title: 'Naa Ready',
      artist: 'Thalapathy Vijay, Anirudh Ravichander',
      singers: 'Thalapathy Vijay, Anirudh Ravichander',
      album: 'Leo',
      duration: 248,
      image: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
      youtubeId: 'szvt1vD0Uug',
      embedUrl: 'https://www.youtube-nocookie.com/embed/szvt1vD0Uug?autoplay=1&enablejsapi=1',
      streamUrl: 'https://www.youtube-nocookie.com/embed/szvt1vD0Uug?autoplay=1&enablejsapi=1',
      isPlayable: true,
      provider: 'youtube',
      source: 'youtube',
      videoId: 'szvt1vD0Uug',
      category: 'trending',
      licenseNotice: 'Official YouTube IFrame Player Embed (Sony Music South)'
    }
  ],
  latest: [
    {
      id: 'yt_kaavaalaa',
      title: 'Kaavaalaa',
      artist: 'Anirudh Ravichander, Shilpa Rao',
      album: 'Jailer',
      duration: 190,
      image: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
      youtubeId: 'RVLNBVK8auM',
      embedUrl: 'https://www.youtube-nocookie.com/embed/RVLNBVK8auM?autoplay=1&enablejsapi=1',
      streamUrl: 'https://www.youtube-nocookie.com/embed/RVLNBVK8auM?autoplay=1&enablejsapi=1',
      isPlayable: true,
      provider: 'youtube',
      source: 'youtube',
      videoId: 'RVLNBVK8auM'
    }
  ],
  gana: [
    {
      id: 'yt_vaathi_coming',
      title: 'Vaathi Coming',
      artist: 'Anirudh Ravichander, Gana Balachandar',
      album: 'Master',
      duration: 230,
      image: 'https://c.saavncdn.com/169/Master-Tamil-2020-20201202164426-500x500.jpg',
      youtubeId: 'fRD_3vJagxk',
      embedUrl: 'https://www.youtube-nocookie.com/embed/fRD_3vJagxk?autoplay=1&enablejsapi=1',
      streamUrl: 'https://www.youtube-nocookie.com/embed/fRD_3vJagxk?autoplay=1&enablejsapi=1',
      isPlayable: true,
      provider: 'youtube',
      source: 'youtube',
      videoId: 'fRD_3vJagxk'
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
  songs: mockHomeData.trending,
  albums: mockHomeData.albums,
  artists: mockHomeData.artists
};

async function runAudit() {
  console.log('--- Starting Playwright UI Audit & Verification Suite ---');

  // 1. Start Vite preview server
  const server = await preview({
    root: path.resolve(__dirname, '../..'),
    preview: { port: 4175 }
  });
  const baseURL = 'http://localhost:4175';
  console.log('✓ Vite preview server running at', baseURL);

  // 2. Launch Chromium
  const browser = await chromium.launch({ headless: true, ...chromiumOverride });
  console.log('✓ Playwright Chromium browser initialized');

  // Every context below runs with serviceWorkers: 'block': this audit mocks the server with page.route, and page.route cannot see requests made by a service worker.
  const setupMockRoutes = async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('tamiltunes_token', 'audit_token');
      localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' }));
    });
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/api/auth/me')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, user: { id: 'u1', name: 'Tester', email: 'tester@example.com', role: 'user' } })
        });
      }
      if (url.includes('/api/me/speed-dial')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, items: mockHomeData.trending.map((s) => ({ ...s, isPinned: false, isHidden: false })) })
        });
      }
      if (url.includes('/api/home')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            seed: 'test',
            hero: null,
            sections: [
              { id: 'trending', title: 'Trending now', kind: 'songs', items: mockHomeData.trending }
            ]
          })
        });
      }
      if (url.includes('/api/music/home')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockHomeData }) });
      }
      if (url.includes('/api/music/search')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockSearchResults }) });
      }
      if (url.includes('/api/favorites/ids')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, ids: ['yt_badass_leo'] }) });
      }
      if (url.includes('/api/favorites')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { items: mockHomeData.trending, total: 3, limit: 50, offset: 0, hasMore: false } })
        });
      }
      if (url.includes('/api/history')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { items: mockHomeData.trending, total: 3, limit: 50, offset: 0, hasMore: false } })
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
          body: JSON.stringify({ success: true, data: { items: [{ id: 'p1', name: 'Tamil Favorites', songCount: 3 }], total: 1, limit: 50, offset: 0, hasMore: false } })
        });
      }
      if (url.includes('/api/music/song/')) {
        const id = url.split('/api/music/song/')[1]?.split('?')[0];
        const match = mockHomeData.trending.find((s) => s.id === id) || mockHomeData.trending[0];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: match }) });
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
    { name: 'desktop_1366x768', width: 1366, height: 768, isMobile: false, hasTouch: false },
    { name: 'tablet_768x1024', width: 768, height: 1024, isMobile: false, hasTouch: false },
    { name: 'mobile_390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: 'mobile_360x640', width: 360, height: 640, isMobile: true, hasTouch: true }
  ];

  // Capture static viewports
  for (const vp of viewports) {
    const context = await browser.newContext({ serviceWorkers: 'block',
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch
    });
    const page = await context.newPage();
    await setupMockRoutes(page);

    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(screenshotDir, `home_${vp.name}.png`) });
    console.log(`✓ Captured home_${vp.name}.png`);

    await context.close();
  }

  // Interaction tests on Desktop (1366x768)
  {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1366, height: 768 } });
    const page = await context.newPage();
    await setupMockRoutes(page);

    await page.goto(`${baseURL}/search?q=leo`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotDir, 'search_1366x768.png') });
    console.log('✓ Captured search_1366x768.png');

    await page.goto(`${baseURL}/favorites`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'library_favorites_1366x768.png') });
    console.log('✓ Captured library_favorites_1366x768.png');

    await page.goto(`${baseURL}/album/album_leo`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'album_1366x768.png') });
    console.log('✓ Captured album_1366x768.png');

    await page.goto(`${baseURL}/artist/artist_anirudh`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'artist_1366x768.png') });
    console.log('✓ Captured artist_1366x768.png');

    await page.goto(`${baseURL}/playlist/p1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotDir, 'playlist_1366x768.png') });
    console.log('✓ Captured playlist_1366x768.png');

    // Queue drawer from real Home page with YouTube playback
    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.locator('text=Badass (Leo)').first().click();
    await page.waitForTimeout(500);

    await page.click('button[aria-label="Toggle Queue"]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotDir, 'queue_drawer_1366x768.png') });
    console.log('✓ Captured queue_drawer_1366x768.png');

    // YouTube player on Desktop
    await page.screenshot({ path: path.join(screenshotDir, 'youtube_player_1366x768.png') });
    console.log('✓ Captured youtube_player_1366x768.png');

    await context.close();
  }

  // Mobile Viewport Overlap & Touch Tests (390x844 and 360x640)
  const mobileConfigs = [
    { name: '390x844', width: 390, height: 844 },
    { name: '360x640', width: 360, height: 640 }
  ];

  for (const cfg of mobileConfigs) {
    console.log(`\n--- Running Mobile Tests on ${cfg.name} (hasTouch: true, isMobile: true, real Home page) ---`);
    const context = await browser.newContext({ serviceWorkers: 'block',
      viewport: { width: cfg.width, height: cfg.height },
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await setupMockRoutes(page);

    // 1. Load the real Home page (no forced state, backend returns YouTube-sourced songs)
    await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // 2. Tap on the song card directly from real Home page
    const songCard = page.locator('text=Badass (Leo)').first();
    await songCard.tap();
    await page.waitForTimeout(700);

    // 3. Mini-player appears
    const miniPlayer = page.locator('div[role="button"][aria-label="Open now playing full screen"]');
    const isMiniVisible = await miniPlayer.isVisible();
    console.log(`[${cfg.name}] Assertion: MiniPlayer visible ->`, isMiniVisible ? 'PASS' : 'FAIL');
    if (!isMiniVisible) throw new Error(`MiniPlayer not visible on ${cfg.name}`);

    // 4. Tap mini-player using page.tap()
    await miniPlayer.tap();
    await page.waitForTimeout(500);

    const fullScreenHeading = page.locator('[data-testid=marquee-text][aria-label*="Leo"]');
    const isFullVisible = await fullScreenHeading.isVisible();
    console.log(`[${cfg.name}] Assertion: Tapping mini-player opens full-screen ->`, isFullVisible ? 'PASS' : 'FAIL');
    if (!isFullVisible) throw new Error(`FullScreenPlayer failed to open via tap() on ${cfg.name}`);

    // 5. Body scroll lock active
    const bodyLocked = await page.evaluate(() => document.body.style.overflow);
    console.log(`[${cfg.name}] Assertion: Body scroll lock active ("hidden") ->`, bodyLocked === 'hidden' ? 'PASS' : 'FAIL');
    if (bodyLocked !== 'hidden') throw new Error(`Expected body scroll hidden on ${cfg.name}, got ${bodyLocked}`);

    if (cfg.name === '390x844') {
      await page.screenshot({ path: path.join(screenshotDir, 'fullscreen_player_390x844.png') });
      console.log('✓ Captured fullscreen_player_390x844.png');
    }

    // 6. Close full-screen player
    const closeBtn = page.locator('button[aria-label="Close now playing"]');
    await closeBtn.tap();
    await page.waitForTimeout(500);

    const bodyReleased = await page.evaluate(() => document.body.style.overflow);
    console.log(`[${cfg.name}] Assertion: Body scroll lock released ("") ->`, bodyReleased === '' ? 'PASS' : 'FAIL');
    if (bodyReleased !== '') throw new Error(`Expected body scroll released on ${cfg.name}, got ${bodyReleased}`);

    if (cfg.name === '390x844') {
      await page.screenshot({ path: path.join(screenshotDir, 'mini_player_390x844.png') });
      console.log('✓ Captured mini_player_390x844.png');
    }

    // 7. Check YouTube player container & IFrame in DOM
    const ytContainer = page.locator('#yt-player-container');
    const isYtVisible = await ytContainer.isVisible();
    console.log(`[${cfg.name}] Assertion: YouTube player visible ->`, isYtVisible ? 'PASS' : 'FAIL');
    if (!isYtVisible) throw new Error(`YouTube player container not visible on ${cfg.name}`);

    // Verify YouTube iframe presence in DOM
    const iframe = page.locator('#yt-player-container iframe');
    const iframeCount = await iframe.count();
    let iframeSrc = '';
    if (iframeCount > 0) {
      iframeSrc = (await iframe.getAttribute('src')) || '';
    }
    console.log(`[${cfg.name}] YouTube IFrame in DOM: ${iframeCount > 0 ? 'YES' : 'NO'}, src: ${iframeSrc || '(initializing)'}`);

    // 8. Bounding box & >= 12px clearance assertion
    const ytBox = await ytContainer.boundingBox();
    const miniBox = await miniPlayer.boundingBox();
    const navBar = page.locator('nav.fixed.bottom-0');
    const navBox = await navBar.boundingBox();

    console.log(`[${cfg.name}] Bounding Boxes:`);
    console.log('  YouTube player:', ytBox);
    console.log('  Mini-player:   ', miniBox);
    console.log('  Bottom Nav:    ', navBox);

    if (ytBox && miniBox) {
      const clearanceAboveMini = miniBox.y - (ytBox.y + ytBox.height);
      console.log(`[${cfg.name}] Clearance between YouTube Player and MiniPlayer: ${clearanceAboveMini}px (Required >= 12px)`);
      const hasClearance = clearanceAboveMini >= 12;
      console.log(`[${cfg.name}] Assertion: Clearance >= 12px ->`, hasClearance ? 'PASS' : 'FAIL');
      if (!hasClearance) {
        throw new Error(`Clearance between YouTube player and MiniPlayer is only ${clearanceAboveMini}px on ${cfg.name}, required >= 12px!`);
      }
    }

    if (miniBox && navBox) {
      const clearanceAboveNav = navBox.y - (miniBox.y + miniBox.height);
      console.log(`[${cfg.name}] Clearance between MiniPlayer and Bottom Nav: ${clearanceAboveNav}px`);
      if (clearanceAboveNav < 0) {
        throw new Error(`MiniPlayer overlaps Bottom Nav on ${cfg.name}!`);
      }
    }

    await page.screenshot({ path: path.join(screenshotDir, `youtube_player_${cfg.name}.png`) });
    console.log(`✓ Captured youtube_player_${cfg.name}.png`);

    await context.close();
  }

  // =========================================================================
  // Dedicated YouTube Player Autoplay & Video Data Test
  // Launched with --autoplay-policy=no-user-gesture-required for this test only
  // =========================================================================
  console.log('\n--- Running Dedicated YouTube Player Autoplay & Video Data Test (--autoplay-policy=no-user-gesture-required) ---');
  const ytAutoplayBrowser = await chromium.launch({
    headless: true,
    ...chromiumOverride,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  try {
    const ytContext = await ytAutoplayBrowser.newContext({ serviceWorkers: 'block',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true
    });
    const ytPage = await ytContext.newPage();
    await setupMockRoutes(ytPage);

    await ytPage.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
    await ytPage.waitForTimeout(500);

    // Tap first YouTube track: "Badass (Leo)" (videoId: "IqwIOlhfCak")
    const songCard = ytPage.locator('text=Badass (Leo)').first();
    await songCard.tap();
    await ytPage.waitForTimeout(1000);

    // 1. Verify iframe src contains the track's video ID
    const iframeLoc = ytPage.locator('#yt-player-container iframe');
    await iframeLoc.waitFor({ state: 'attached', timeout: 5000 });
    const iframeSrc = (await iframeLoc.getAttribute('src')) || '';
    console.log(`[YouTube Autoplay Test] IFrame src: ${iframeSrc}`);
    const expectedVideoId = 'IqwIOlhfCak';
    if (!iframeSrc.includes(expectedVideoId)) {
      throw new Error(`Expected iframe src to contain videoId "${expectedVideoId}", got: "${iframeSrc}"`);
    }
    console.log(`✓ [YouTube Autoplay Test] Assertion: IFrame src includes video ID "${expectedVideoId}" -> PASS`);

    // 2. Wait for player instance and evaluate getVideoData()
    await ytPage.waitForFunction(() => {
      const p = window.__ytPlayerInstance;
      return p && typeof p.getVideoData === 'function' && p.getVideoData().video_id;
    }, { timeout: 8000 });

    const videoData = await ytPage.evaluate(() => {
      const p = window.__ytPlayerInstance;
      return p.getVideoData();
    });
    console.log(`[YouTube Autoplay Test] getVideoData():`, JSON.stringify(videoData));
    const actualVideoId = videoData?.video_id;
    console.log(`[YouTube Autoplay Test] Assertion: getVideoData().video_id === "${expectedVideoId}" ->`, actualVideoId === expectedVideoId ? 'PASS' : 'FAIL');
    if (actualVideoId !== expectedVideoId) {
      throw new Error(`Expected getVideoData().video_id to be "${expectedVideoId}", got "${actualVideoId}"`);
    }

    // 3. Evaluate player state (polling up to 6s)
    const STATE_NAMES = {
      '-1': 'UNSTARTED (-1)',
      '0': 'ENDED (0)',
      '1': 'PLAYING (1)',
      '2': 'PAUSED (2)',
      '3': 'BUFFERING (3)',
      '5': 'CUED (5)'
    };

    let reachedState = await ytPage.evaluate(() => {
      const p = window.__ytPlayerInstance;
      return typeof p?.getPlayerState === 'function' ? p.getPlayerState() : -1;
    });

    for (let i = 0; i < 12 && reachedState !== 1; i++) {
      await ytPage.waitForTimeout(500);
      reachedState = await ytPage.evaluate(() => {
        const p = window.__ytPlayerInstance;
        return typeof p?.getPlayerState === 'function' ? p.getPlayerState() : -1;
      });
    }

    const stateDesc = STATE_NAMES[reachedState] || `UNKNOWN (${reachedState})`;
    console.log(`[YouTube Autoplay Test] Player state reached: ${stateDesc}`);
    if (reachedState === 1) {
      console.log('✓ [YouTube Autoplay Test] Assertion: Player state became 1 (PLAYING) -> PASS');
    } else {
      console.log(`ℹ [YouTube Autoplay Test] Player state reached: ${stateDesc} (reported per prompt instruction)`);
    }

    await ytContext.close();
  } finally {
    await ytAutoplayBrowser.close();
  }

  // Cleanup
  await browser.close();
  await server.close();
  console.log('\n=== All Playwright UI tests, touch interactions, and clearance assertions PASSED! ===');
}

runAudit().catch((err) => {
  console.error('\n❌ Playwright audit failed:', err);
  process.exit(1);
});
