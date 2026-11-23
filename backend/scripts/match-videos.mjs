// Batch video matcher: finds the official video for the songs people play most and remembers it (table video_matches), so the app does not
// pay a YouTube search for the same song again. DRY RUN by default: it writes nothing (add --apply). A dry run STILL uses YouTube quota
// (the channel index and the searches), so keep --max-units small until you trust the report.
// Run on YOUR computer (never paste the key or the database url in a chat):
//   PowerShell: $env:YOUTUBE_API_KEY="..."; $env:VIDEO_CHANNEL_ALLOWLIST="UC...,UC..."; $env:DATABASE_URL="<unpooled url>"; npm run video:batch --prefix backend -- --limit=300 --max-units=1500
// Recent mode: --recent=N starts from each channel's newest N official uploads (max 300), finds the matching song in the music catalogue and
//   remembers the pair (needs internet access to the music provider; it does NOT look at play counts). Combine with --apply to save.
// Options: --limit=N songs to look at (default 300, max 5000), --max-units=N quota this run may use (default 1500, max 8000),
//          --apply write the results, --no-search index only (no per-song search), --retry-none look again at songs recorded as "no video".
// It never prints the key, never changes the songs table, never deletes anything. Admin choices and curated songs are left alone.
import { initDb, usingPostgres, getPrismaClient } from '../src/prisma/client.js';
import { config } from '../src/config/env.js';
import { createVideoLookup } from '../src/services/music/videoLookup.js';
import { createPrismaStore } from '../src/services/videoMatches/store.js';
import { runBatch } from '../src/services/videoBatch/run.js';
import { runRecent } from '../src/services/videoBatch/recent.js';

const arg = (name, dflt) => { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? Number(a.split('=')[1]) : dflt; };
const flag = (name) => process.argv.includes(`--${name}`);
const limit = Math.min(5000, Math.max(1, Math.floor(arg('limit', 300)) || 300));
const maxUnits = Math.min(8000, Math.max(10, Math.floor(arg('max-units', 1500)) || 1500));
const apply = flag('apply');
const recent = Math.min(300, Math.max(0, Math.floor(arg('recent', 0)) || 0));

if (!config.youtubeApiKey || (config.videoChannelAllowlist || []).length === 0) {
  console.error('FAIL  set YOUTUBE_API_KEY and VIDEO_CHANNEL_ALLOWLIST in this shell first (see docs/VIDEO_SONGS.md). Run npm run video:check to test them.');
  process.exit(1);
}
await initDb();
if (!usingPostgres()) { console.error('FAIL  no database connection: set DATABASE_URL (the UNPOOLED url) in this shell first.'); process.exit(1); }
const prisma = getPrismaClient();

// Most played first, then the newest saved songs to fill the list.
const played = await prisma.playEvent.groupBy({ by: ['songId'], _count: { songId: true }, orderBy: { _count: { songId: 'desc' } }, take: limit });
const sel = { id: true, title: true, artist: true, album: true, singers: true, videoId: true, videoAvailable: true, isHidden: true, deletedAt: true };
const byId = new Map((await prisma.song.findMany({ where: { id: { in: played.map((p) => p.songId) } }, select: sel })).map((s) => [s.id, s]));
let songs = played.map((p) => byId.get(p.songId)).filter(Boolean);
if (songs.length < limit) {
  const have = new Set(songs.map((s) => s.id));
  const more = await prisma.song.findMany({ where: { id: { notIn: [...have] } }, select: sel, orderBy: { createdAt: 'desc' }, take: limit - songs.length });
  songs = songs.concat(more);
}
songs = songs.filter((s) => !s.isHidden && !s.deletedAt).map((s) => ({ ...s, singers: (s.singers || []).join(', ') }));

// Admin choices and flagged videos (songs table) always win: the matcher reports them as "admin" / "hidden" and writes nothing for them.
const overrides = new Map(songs.filter((s) => s.videoId || s.videoAvailable === false).map((s) => [s.id, s.videoAvailable === false ? { hidden: true } : { videoId: s.videoId }]));
const store = createPrismaStore(prisma);
const existing = new Map((await store.list()).map((r) => [r.songKey, r]));
const lookup = createVideoLookup({ cfg: { ...config, youtubeDailyBudget: maxUnits }, getOverride: (s) => overrides.get(s.id) || null });

if (recent > 0) {
  // Recent mode: newest uploads of the allow-listed channels -> catalogue songs.
  const { musicService } = await import('../src/services/music/providerManager.js');
  const uploads = await lookup.recentUploads(recent);
  const idx0 = lookup.indexState();
  console.log(`Channel index: ${idx0.ok ? `${idx0.entries} embeddable official uploads` : 'NOT LOADED (check the key and quota)'}; looking at the newest ${recent} per channel = ${uploads.length} uploads. ${apply ? 'APPLY: results will be saved.' : 'Dry run: nothing is saved (add --apply).'}`);
  const rr = await runRecent({
    uploads, store, existing, apply, delayMs: 150,
    search: async (q) => (await musicService.searchTracks(q, { type: 'songs' })).songs || [],
    log: (l) => console.log('  ' + l)
  });
  const k = rr.counts;
  console.log(`\nUploads looked at: ${k.uploads}`);
  console.log(`  matched to a catalogue song: ${k.matched} (already saved earlier: ${k.alreadyKnown})`);
  console.log(`  not found in the catalogue: ${k.notInCatalogue}, title not understood: ${k.unparsed}, catalogue search errors: ${k.searchErrors}`);
  if (rr.missing.length) console.log(`\nSample of uploads whose song was not found in the catalogue (first ${rr.missing.length}):\n  ${rr.missing.join('\n  ')}`);
  console.log(apply ? `Saved ${rr.written} rows to video_matches.` : 'Dry run: nothing saved. Run again with --apply to save these results.');
  console.log(`Quota used by this run: about ${lookup._budget.used} units.`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Looking at ${songs.length} songs (most played first). Quota cap for this run: ${maxUnits} units. ${apply ? 'APPLY: results will be saved.' : 'Dry run: nothing is saved (add --apply).'}`);
const res = await runBatch({ songs, lookup, store, existing, apply, retryNone: flag('retry-none'), allowSearch: !flag('no-search'), log: (l) => console.log('  ' + l) });
const c = res.counts;
const idx = lookup.indexState();
console.log(`\nChannel index: ${idx.ok ? `${idx.entries} embeddable official uploads` : 'NOT LOADED (see the warning above; check the key and quota)'}`);
console.log(`Songs: ${c.songs} (${c.duplicates} duplicates skipped)`);
console.log(`  already known from an earlier run: ${c.alreadyFound} with video, ${c.alreadyNone} recorded as none`);
console.log(`  admin choice ${c.admin}, curated ${c.curated}, hidden ${c.hidden}`);
console.log(`  NEW from the index: ${c.index}, from a search: ${c.search}, searched and none: ${c.none}`);
console.log(`  not looked up (search budget or search off): ${c.deferred}, errors: ${c.errors}`);
if (res.unmatched.length) console.log(`\nSample of songs with no official video found (first ${res.unmatched.length}):\n  ${res.unmatched.join('\n  ')}`);
console.log(`\nCoverage of the songs looked at: ${res.found} of ${c.songs - c.duplicates} have a video (${Math.round((res.found / Math.max(1, c.songs - c.duplicates)) * 100)}%).`);
console.log(apply ? `Saved ${res.written} rows to video_matches.` : 'Dry run: nothing saved. Run again with --apply to save these results.');
console.log(`Quota used by this run: about ${lookup._budget.used} units.`);
await prisma.$disconnect();
process.exit(0);
