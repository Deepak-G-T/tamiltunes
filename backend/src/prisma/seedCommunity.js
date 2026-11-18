/**
 * Local-testing seed: demo users (one artist), a few comments with a reply and a like, and a follow.
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
  const songId = 'tt_trending_1';
  const existing = await prisma.comment.count({ where: { songId, userId: users.demo_listener.id } });
  if (!existing) {
    const parent = await prisma.comment.create({ data: { songId, userId: users.demo_listener.id, body: 'That drop at 1:23 is unreal 🔥 அருமை', timestampSec: 83 } });
    await prisma.comment.create({ data: { songId, userId: users.demo_artist.id, parentId: parent.id, body: 'Thank you all for the love! 💚' } });
    await prisma.commentLike.create({ data: { commentId: parent.id, userId: users.demo_artist.id } });
    await prisma.comment.update({ where: { id: parent.id }, data: { likeCount: 1, likedByArtist: true } });
  }
  await prisma.follow.createMany({ data: [{ followerId: users.demo_listener.id, followedId: users.demo_artist.id }], skipDuplicates: true });
  console.log(`Seeded demo users (password: ${PASSWORD}): ${USERS.map((u) => u.email).join(', ')}`);
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
