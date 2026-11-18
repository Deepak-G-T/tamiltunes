// Lists groups of duplicate songs in the songs table. REPORT ONLY: it reads and prints, it never changes or deletes anything.
// Usage: DATABASE_URL=<unpooled or pooled url> npm run report:duplicate-songs --prefix backend
import { initDb, usingPostgres, getPrismaClient } from '../src/prisma/client.js';
import { findDuplicateGroups } from '../src/services/related/duplicates.js';

await initDb();
if (!usingPostgres()) {
  console.error('No database connection: set DATABASE_URL first (this script only reads the songs table).');
  process.exit(1);
}
const prisma = getPrismaClient();
const rows = await prisma.song.findMany({ select: { id: true, title: true, artist: true, album: true, singers: true, movie: true } });
const groups = findDuplicateGroups(rows);
console.log(`${rows.length} songs checked, ${groups.length} duplicate groups (nothing was changed).\n`);
for (const g of groups) {
  console.log(`[${g.kind}] ${g.key}`);
  for (const s of g.songs) console.log(`   ${s.id}  "${s.title}"  ${s.album ?? s.movie ?? '-'}  ${s.artist ?? '-'}`);
}
await prisma.$disconnect();
process.exit(0);
