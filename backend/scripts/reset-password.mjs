// Sets a new password for ONE account. Nothing else is changed: the account, playlists, favourites and history stay.
// The new password is typed at a hidden prompt (never on the command line, so it is not in the shell history).
//   DATABASE_URL=<unpooled url> npm run reset-password --prefix backend -- someone@example.com
import { initDb, usingPostgres, getPrismaClient } from '../src/prisma/client.js';
import { setPasswordForEmail } from '../src/services/auth/adminReset.js';
import { normalizeEmail } from '../src/services/auth/credentials.js';
import { promptHidden } from './lib/prompt.mjs';

const email = normalizeEmail(process.argv[2]);
if (!email) {
  console.error('Usage: npm run reset-password --prefix backend -- <email>');
  process.exit(1);
}

await initDb();
if (!usingPostgres() && process.env.ALLOW_MEMORY_DB !== '1') {
  console.error('Not connected to a database. Set DATABASE_URL first (this would otherwise change nothing real).');
  process.exit(1);
}

const password = await promptHidden('New password (at least 8 characters): ');
const again = await promptHidden('Type it again: ');
if (password !== again) {
  console.error('The two passwords are different. Nothing was changed.');
  process.exit(1);
}
const result = await setPasswordForEmail(email, password);
if (!result.ok) {
  const why = { 'not-found': `No account with the email ${email}. Nothing was changed.`, 'too-short': 'That password is too short (8 characters or more). Nothing was changed.', 'too-long': 'That password is too long. Nothing was changed.' }[result.reason];
  console.error(why);
  process.exit(1);
}
console.log(`Password updated for ${result.email}. Other sessions were signed out. Nothing else was changed.`);
if (usingPostgres()) await getPrismaClient().$disconnect();
process.exit(0);
