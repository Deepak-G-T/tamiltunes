import assert from 'node:assert/strict';
import { parseTrustProxy, parseVideoConfig } from '../src/config/env.js';

// --- trust proxy: needed so rate limiting keys on the real client IP behind Render/Vercel ---
assert.equal(parseTrustProxy({ NODE_ENV: 'production' }), 1);
assert.equal(parseTrustProxy({ NODE_ENV: 'development' }), false);
assert.equal(parseTrustProxy({}), false);
assert.equal(parseTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '2' }), 2);
assert.equal(parseTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: 'junk' }), 1);
console.log('✓ trust proxy parsing');

// --- optional video config: everything off by default ---
const off = parseVideoConfig({});
assert.equal(off.youtubeApiKey, '');
assert.deepEqual(off.videoChannelAllowlist, []);
assert.equal(off.youtubeDailyBudget, 5000);

const on = parseVideoConfig({
  YOUTUBE_API_KEY: 'k',
  VIDEO_CHANNEL_ALLOWLIST: ' UCaaa , UCbbb,, ',
  YOUTUBE_DAILY_BUDGET: '1000'
});
assert.equal(on.youtubeApiKey, 'k');
assert.deepEqual(on.videoChannelAllowlist, ['UCaaa', 'UCbbb']);
assert.equal(on.youtubeDailyBudget, 1000);
assert.equal(parseVideoConfig({ YOUTUBE_DAILY_BUDGET: '0' }).youtubeDailyBudget, 0);
assert.equal(parseVideoConfig({ YOUTUBE_DAILY_BUDGET: 'abc' }).youtubeDailyBudget, 5000);
assert.equal(parseVideoConfig({ YOUTUBE_DAILY_BUDGET: '-5' }).youtubeDailyBudget, 0);
console.log('✓ optional video config defaults and parsing (fail-closed allow-list)');

// --- channel index settings ---
const idxDefault = parseVideoConfig({});
assert.equal(idxDefault.videoIndexMaxPages, 10);
assert.equal(idxDefault.videoSearchFallback, true);
assert.equal(parseVideoConfig({ VIDEO_INDEX_MAX_PAGES: '0' }).videoIndexMaxPages, 0);
assert.equal(parseVideoConfig({ VIDEO_INDEX_MAX_PAGES: '999' }).videoIndexMaxPages, 40);
assert.equal(parseVideoConfig({ VIDEO_INDEX_MAX_PAGES: '-3' }).videoIndexMaxPages, 0);
assert.equal(parseVideoConfig({ VIDEO_INDEX_MAX_PAGES: 'x' }).videoIndexMaxPages, 10);
assert.equal(parseVideoConfig({ VIDEO_SEARCH_FALLBACK: 'false' }).videoSearchFallback, false);
assert.equal(parseVideoConfig({ VIDEO_SEARCH_FALLBACK: 'FALSE' }).videoSearchFallback, false);
assert.equal(parseVideoConfig({ VIDEO_SEARCH_FALLBACK: 'true' }).videoSearchFallback, true);
console.log('✓ channel index settings (VIDEO_INDEX_MAX_PAGES, VIDEO_SEARCH_FALLBACK)');
