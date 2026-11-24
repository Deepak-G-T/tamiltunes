import assert from 'node:assert/strict';
import { sanitizeText, charLength, parseTimestamp, extractTimestamp } from '../src/community/sanitize.js';
import { checkContent } from '../src/community/contentFilter.js';
import { validateUsername, suggestUsername } from '../src/community/username.js';
import { validateAvatarDataUrl, AVATAR_MAX_BYTES } from '../src/community/avatar.js';
import { profileUpdateSchema } from '../src/community/schemas.js';
import { createPrismaStore } from '../src/community/store/prismaStore.js';

// sanitize
assert.equal(sanitizeText('<script>alert(1)</script>hi <b>there</b>'), 'alert(1)hi there');
assert.equal(sanitizeText('a‮b\u0000c'), 'abc');
assert.equal(sanitizeText('  line1\n\n\n\nline2  '), 'line1\n\nline2');
assert.equal(sanitizeText(42), '');
assert.equal(sanitizeText('இனிய பாடல் 🎶'), 'இனிய பாடல் 🎶');
assert.equal(charLength('தமிழ்'), 3); // grapheme clusters
assert.equal(charLength('👍🏽'), 1);
console.log('✓ sanitize strips markup, controls and bidi overrides; keeps Tamil and emoji');

// timestamps
assert.equal(parseTimestamp('1:23'), 83);
assert.equal(parseTimestamp('1:02:03'), 3723);
assert.equal(parseTimestamp('1:75'), null);
assert.equal(extractTimestamp('that drop at 1:23 is insane'), 83);
assert.equal(extractTimestamp('version 2.0 at 10:5'), null);
console.log('✓ timestamp parsing');

// content filter
assert.equal(checkContent('Superb song, goosebumps! 🔥').ok, true);
assert.equal(checkContent('அருமையான பாடல், இசை சூப்பர்').ok, true);
assert.equal(checkContent('This is shit').reason, 'profanity');
assert.equal(checkContent('f.u.c.k this').reason, 'profanity');
assert.equal(checkContent('fuuuuck').reason, 'profanity');
assert.equal(checkContent('sh1t').reason, 'profanity');
assert.equal(checkContent('ஓத்தா').reason, 'profanity');
assert.equal(checkContent('Scunthorpe classic assassin').ok, true, 'no substring false positives in Latin');
assert.equal(checkContent('visit www.spam.com now').detail, 'links');
assert.equal(checkContent('call 9876543210').detail, 'contact');
assert.equal(checkContent('aaaaaaaaaaaa').detail, 'repeated characters');
assert.equal(checkContent('buy buy buy buy buy buy buy').detail, 'repeated words');
assert.equal(checkContent('THIS SONG IS THE BEST EVER MADE').detail, 'all caps');
console.log('✓ content filter: Tamil + English profanity, spam, no false positives');

// usernames
assert.equal(validateUsername('Deepak_G').value, 'deepak_g');
assert.equal(validateUsername('@tamil_fan').ok, true);
for (const bad of ['ab', '1abc', 'has space', 'a'.repeat(21), 'admin', 'bad-name', 'தமிழ்']) {
  assert.equal(validateUsername(bad).ok, false, bad);
}
assert.match(suggestUsername('Ravi Kumar!', '_a1b2'), /^[a-z][a-z0-9_]{2,19}$/);
assert.match(suggestUsername('தமிழ்'), /^[a-z]/);
console.log('✓ username rules');

// avatars
const tinyPng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const url = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
assert.equal(validateAvatarDataUrl(url('image/png', tinyPng)).ok, true);
assert.equal(validateAvatarDataUrl(url('image/jpeg', tinyPng)).ok, false, 'magic bytes must match type');
assert.equal(validateAvatarDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').ok, false);
assert.equal(validateAvatarDataUrl('https://evil.example/x.png').ok, false);
assert.equal(validateAvatarDataUrl(url('image/png', Buffer.concat([tinyPng, Buffer.alloc(AVATAR_MAX_BYTES)]))).ok, false);
console.log('✓ avatar validation rejects SVG, remote URLs, spoofed and oversized files');

// schemas
assert.equal(profileUpdateSchema.safeParse({ bio: 'x'.repeat(151) }).success, false);
assert.equal(profileUpdateSchema.safeParse({ role: 'admin' }).success, false, 'role cannot be self-assigned');
assert.equal(profileUpdateSchema.safeParse({ email: 'a@b.c' }).success, false);
console.log('✓ schemas: 150-char bio, no privilege fields');

// prismaStore userStats
const calls = [];
const mockPrisma = {
  favorite: { count: async (args) => { calls.push(['favorite', args]); return 2; } },
  playlist: { count: async (args) => { calls.push(['playlist', args]); return 3; } },
  follow: { count: async (args) => { calls.push(['follow', args]); return 4; } },
};
const store = createPrismaStore(mockPrisma);
const stats = await store.userStats('u1');
assert.deepEqual(stats, { favorites: 2, playlists: 3, followers: 4, following: 4 });
assert.deepEqual(calls, [
  ['favorite', { where: { userId: 'u1' } }],
  ['playlist', { where: { userId: 'u1' } }],
  ['follow', { where: { followedId: 'u1' } }],
  ['follow', { where: { followerId: 'u1' } }],
]);
console.log('✓ prismaStore.userStats passes where clauses to count queries');

