// READ-ONLY check: does the password you type match the one stored for an account? It prints only "matches" or "does not match".
//   DATABASE_URL=<url> npm run verify-password --prefix backend -- someone@example.com
import { initDb, usingPostgres, getPrismaClient } from '../src/prisma/client.js';
import { passwordMatches } from '../src/services/auth/adminReset.js';
import { normalizeEmail } from '../src/services/auth/credentials.js';
import { promptHidden } from './lib/prompt.mjs';

const email = normalizeEmail(process.argv[2]);
if (!email) { console.error('Usage: npm run verify-password --prefix backend -- <email>'); process.exit(1); }
await initDb();
if (!usingPostgres() && process.env.ALLOW_MEMORY_DB !== '1') { console.error('Not connected to a database. Set DATABASE_URL first.'); process.exit(1); }
const password = await promptHidden('Password to check: ');
const r = await passwordMatches(email, password);
console.log(!r.found ? `No account with the email ${email}.` : r.matches ? 'The password MATCHES.' : 'The password does NOT match the stored one.');
if (usingPostgres()) await getPrismaClient().$disconnect();
process.exit(0);
