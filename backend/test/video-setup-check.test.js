import assert from 'node:assert/strict';
import { runCheck, explainError, redactKey, estimateDailyUnits, parseChannelList } from '../src/services/videoSetup/check.js';

const KEY = 'AIzaSyFAKE_KEY_FOR_TESTS_0123456789abcdef';
const CH1 = 'UCBnxEdpoZwstJqC1yZpOjRA';
const CH2 = 'UCn4rEMqKtwBQ6-oEwbd4PcA';
const env = (extra = {}) => ({ YOUTUBE_API_KEY: KEY, VIDEO_CHANNEL_ALLOWLIST: `${CH1},${CH2}`, ...extra });
const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const text = (r) => r.lines.join('\n');

// a fake Google: videos.list and channels.list
const google = (calls = []) => async (url) => {
  const u = new URL(url);
  calls.push({ path: u.pathname.split('/').pop(), params: Object.fromEntries(u.searchParams) });
  if (u.pathname.endsWith('/videos')) return { ok: true, status: 200, json: async () => ({ items: [{ id: 'x', status: { embeddable: true } }] }) };
  if (u.pathname.endsWith('/channels')) {
    return { ok: true, status: 200, json: async () => ({ items: [
      { id: CH1, snippet: { title: 'Sun TV' }, statistics: { videoCount: '12000', subscriberCount: '9000000' } },
      { id: CH2, snippet: { title: 'Sony Music South' }, statistics: { videoCount: '3000', hiddenSubscriberCount: true } },
    ] }) };
  }
  throw new Error('unexpected call');
};

// 1. the happy path: key works, channels are named, quota is estimated, the key is never shown
{
  const calls = [];
  const r = await runCheck({ env: env({ VIDEO_INDEX_MAX_PAGES: '10' }), fetchFn: google(calls) });
  assert.equal(r.ok, true);
  const out = text(r);
  assert.ok(out.includes('the key works') && out.includes('embeddable: yes'));
  assert.ok(out.includes(`${CH1} = "Sun TV"`) && out.includes('"Sony Music South"'), 'the real channel names are shown so the owner can confirm they are official');
  assert.ok(out.includes('OFFICIAL'), 'the owner is asked to confirm');
  assert.ok(out.includes('about 40 units'), '2 channels x 10 pages x 2 = 40');
  assert.ok(!out.includes(KEY) && !out.includes('AIzaSyFAKE'), 'the key is never printed');
  assert.equal(r.units, 2);
  assert.equal(calls.length, 2, 'two cheap calls: one video, one batch of channels');
  assert.equal(calls[1].params.id, `${CH1},${CH2}`, 'channels are looked up in one call');
  console.log('✓ video check: key works, real channel names shown, quota estimated, key never printed');
}

// 2. missing key / empty allow-list / bad ids
{
  const noKey = await runCheck({ env: { VIDEO_CHANNEL_ALLOWLIST: CH1 }, fetchFn: google() });
  assert.equal(noKey.ok, false);
  assert.match(text(noKey), /YOUTUBE_API_KEY is not set/);
  const empty = await runCheck({ env: env({ VIDEO_CHANNEL_ALLOWLIST: '' }), fetchFn: google() });
  assert.equal(empty.ok, false);
  assert.match(text(empty), /ALLOWLIST is empty/);
  const bad = await runCheck({ env: env({ VIDEO_CHANNEL_ALLOWLIST: `${CH1},not-a-channel,UCshort` }), fetchFn: google() });
  assert.equal(bad.ok, false);
  assert.match(text(bad), /"not-a-channel" is not a channel id/);
  assert.match(text(bad), /"UCshort" is not a channel id/);
  const missing = await runCheck({ env: env({ VIDEO_CHANNEL_ALLOWLIST: `${CH1},UCaaaaaaaaaaaaaaaaaaaaaa` }), fetchFn: google() });
  assert.equal(missing.ok, false);
  assert.match(text(missing), /UCaaaaaaaaaaaaaaaaaaaaaa: no such channel/);
  console.log('✓ video check: missing key, empty allow-list, malformed and unknown channel ids are reported');
}

// 3. Google's errors are explained in plain words, and the key is never leaked by them
{
  const cases = [
    [400, { error: { errors: [{ reason: 'keyInvalid' }], message: 'API key not valid' } }, 'key-invalid'],
    [403, { error: { errors: [{ reason: 'accessNotConfigured' }], message: 'YouTube Data API v3 has not been used in project 1 before or it is disabled' } }, 'api-not-enabled'],
    [403, { error: { errors: [{ reason: 'quotaExceeded' }] } }, 'quota'],
    [403, { error: { errors: [{ reason: 'ipRefererBlocked' }], message: 'Requests from referer <empty> are blocked.' } }, 'restricted'],
    [403, { error: { status: 'PERMISSION_DENIED', errors: [{ reason: 'forbidden' }], message: 'API_KEY_SERVICE_BLOCKED' } }, 'api-restricted'],
    [429, {}, 'rate'],
    [500, {}, 'other'],
  ];
  for (const [status, body, code] of cases) {
    assert.equal(explainError(status, body).code, code, `${status} ${JSON.stringify(body).slice(0, 40)}`);
    const r = await runCheck({ env: env(), fetchFn: reply(status, body) });
    assert.equal(r.ok, false);
    assert.ok(!text(r).includes(KEY));
  }
  const net = await runCheck({ env: env(), fetchFn: async (url) => { throw new Error(`getaddrinfo failed for ${url}`); } });
  assert.equal(net.ok, false);
  assert.match(text(net), /could not reach Google/);
  assert.ok(!text(net).includes(KEY), 'a network error that contains the URL is redacted');
  console.log('✓ video check: Google errors (bad key, API off, quota, restrictions, network) are explained and never leak the key');
}

// 4. helpers
{
  assert.equal(redactKey(`https://x/y?part=a&key=${KEY}&id=1`, KEY).includes(KEY), false);
  assert.equal(redactKey('https://x/y?key=SOMETHINGELSE&id=1', 'other'), 'https://x/y?key=[key]&id=1');
  assert.equal(estimateDailyUnits({ channels: 4, pages: 40 }), 320);
  assert.deepEqual(parseChannelList(' UCa , ,UCb '), ['UCa', 'UCb']);
  const warn = await runCheck({ env: env({ YOUTUBE_API_KEY: 'not-an-api-key-but-long-enough-0123456789' }), fetchFn: google() });
  assert.match(text(warn), /does not look like a Google API key/);
  const flags = await runCheck({ env: env({ VIDEO_SEARCH_FALLBACK: 'false', VIDEO_INDEX_MAX_PAGES: '0', YOUTUBE_DAILY_BUDGET: '1000' }), fetchFn: google() });
  assert.match(text(flags), /index 0 pages per channel, fallback search off, daily budget 1000/);
  console.log('✓ video check: key redaction, quota estimate, odd-looking key warning, settings are echoed');
}
process.exit(0);
