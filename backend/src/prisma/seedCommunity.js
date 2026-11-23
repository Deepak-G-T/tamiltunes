/**
 * Local-testing seed: demo users (one artist), and a follow.
 * Safe to re-run (upserts). Refuses to run in production. Never use real passwords here.
 *   DATABASE_URL=... npm run seed:community --prefix backend
 */
import { hashPassword } from '../services/auth/credentials.js';
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const prisma = new PrismaClient();
const PASSWORD = 'demo-password-123'; // local demo accounts only

const USERS = [
  { username: 'demo_listener', name: 'Demo Listener', email: 'listener@demo.local', role: 'user', bio: 'Melody lover 🎶' },
  { username: 'demo_artist', name: 'Demo Artist', email: 'artist@demo.local', role: 'artist', bio: 'Making music in Chennai' },
];

const main = async () => {
  const hash = await hashPassword(PASSWORD);
  const users = {};
  for (const u of USERS) {
    users[u.username] = await prisma.user.upsert({
      where: { username: u.username },
      create: { ...u, password: hash },
      update: { name: u.name, bio: u.bio, role: u.role },
    });
  }
  await prisma.follow.createMany({ data: [{ followerId: users.demo_listener.id, followedId: users.demo_artist.id }], skipDuplicates: true });
  console.log(`Seeded demo users (password: ${PASSWORD}): ${USERS.map((u) => u.email).join(', ')}`);
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
