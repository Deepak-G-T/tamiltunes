// Fills songs.canonical_id: the id of the best copy of each song (same song under another id, spelling, album or compilation).
// DRY RUN by default: it prints what it would do. Add --apply to write. It only ever sets the canonical_id column: no song is deleted,
// merged or renamed, and it is safe to run again.
// Usage: DATABASE_URL=<unpooled url> npm run backfill:canonical-ids --prefix backend [-- --apply]
import { initDb, usingPostgres, getPrismaClient } from '../src/prisma/client.js';
import { clusterSongs } from '../src/services/related/identity.js';

const apply = process.argv.includes('--apply');
await initDb();
if (!usingPostgres()) {
  console.error('No database connection: set DATABASE_URL first.');
  process.exit(1);
}
const prisma = getPrismaClient();
const rows = await prisma.song.findMany({ select: { id: true, title: true, artist: true, album: true, singers: true, composer: true, duration: true, canonicalId: true } });
const songs = rows.map((r) => ({ ...r, singers: (r.singers || []).join(', ') || r.artist, duration: r.duration || 0 }));
const { groups, canonicalOf } = clusterSongs(songs);
const changes = rows.filter((r) => (canonicalOf.get(r.id) || r.id) !== r.canonicalId);
console.log(`${rows.length} songs, ${groups.filter((g) => g.songs.length > 1).length} duplicate clusters, ${changes.length} rows would change${apply ? '' : ' (dry run: nothing written, add --apply)'}.`);
if (apply) {
  const byCanon = new Map();
  for (const r of changes) { const c = canonicalOf.get(r.id) || r.id; if (!byCanon.has(c)) byCanon.set(c, []); byCanon.get(c).push(r.id); }
  let n = 0;
  for (const [canon, ids] of byCanon) { n += (await prisma.song.updateMany({ where: { id: { in: ids } }, data: { canonicalId: canon } })).count; }
  console.log(`Updated canonical_id on ${n} rows.`);
}
await prisma.$disconnect();
process.exit(0);
