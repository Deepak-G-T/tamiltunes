// READ-ONLY: accounts whose emails are the same once case and outer spaces are ignored. The email-normalising migration skips itself
// when it finds any, so this lists them for a decision by hand. It never changes anything.
import { initDb, usingPostgres, getPrismaClient } from '../src/prisma/client.js';

await initDb();
if (!usingPostgres()) { console.error('Not connected to a database. Set DATABASE_URL first.'); process.exit(1); }
const prisma = getPrismaClient();
const rows = await prisma.$queryRaw`select lower(btrim(email)) as clean, id, email, "createdAt", username from users where lower(btrim(email)) in (select lower(btrim(email)) from users group by 1 having count(*) > 1) order by 1, "createdAt"`;
console.log(rows.length ? `${rows.length} accounts share ${new Set(rows.map((r) => r.clean)).size} email(s) (nothing was changed):\n` : 'No collisions: every email is unique once case and spaces are ignored.');
for (const r of rows) console.log(`${r.clean}  id=${r.id}  stored as "${r.email}"  created ${new Date(r.createdAt).toISOString()}  username=${r.username}`);
await prisma.$disconnect();
process.exit(0);
