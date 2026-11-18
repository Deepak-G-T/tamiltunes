/**
 * Password reset tokens. Only the SHA-256 hash of a token is stored (the token itself is only in the email), so a database
 * leak does not give anyone a working link. Two implementations: Prisma/PostgreSQL and in-memory (dev + tests).
 */
import crypto from 'node:crypto';
import { usingPostgres, getPrismaClient } from '../../prisma/client.js';

export const newToken = () => crypto.randomBytes(32).toString('base64url'); // 32 random bytes
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const memory = new Map(); // tokenHash -> row

const memoryStore = {
  kind: 'memory',
  async create({ userId, tokenHash, expiresAt }) {
    const row = { id: crypto.randomUUID(), userId, tokenHash, expiresAt, usedAt: null, createdAt: new Date() };
    memory.set(tokenHash, row);
    return { ...row };
  },
  /** A newer link replaces older ones: every unused token of this user is closed. */
  async invalidateOpen(userId, now = new Date()) {
    for (const row of memory.values()) if (row.userId === userId && !row.usedAt) row.usedAt = now;
  },
  async findByHash(tokenHash) { const r = memory.get(tokenHash); return r ? { ...r } : null; },
  /** Close a token exactly once: true for the first caller, false for anyone after. */
  async markUsed(id, now = new Date()) {
    for (const row of memory.values()) if (row.id === id && !row.usedAt) { row.usedAt = now; return true; }
    return false;
  },
  async expireForTest(tokenHash, expiresAt) { const r = memory.get(tokenHash); if (r) r.expiresAt = expiresAt; },
  async countForUser(userId) { return [...memory.values()].filter((r) => r.userId === userId).length; },
  reset() { memory.clear(); },
};

const createPrismaStore = (prisma) => ({
  kind: 'prisma',
  create: ({ userId, tokenHash, expiresAt }) => prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } }),
  invalidateOpen: (userId, now = new Date()) => prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
  findByHash: (tokenHash) => prisma.passwordResetToken.findUnique({ where: { tokenHash } }),
  async markUsed(id, now = new Date()) {
    const r = await prisma.passwordResetToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: now } }); // the "usedAt is null" condition makes it single-use even with two requests at once
    return r.count === 1;
  },
  expireForTest: (tokenHash, expiresAt) => prisma.passwordResetToken.update({ where: { tokenHash }, data: { expiresAt } }),
  countForUser: (userId) => prisma.passwordResetToken.count({ where: { userId } }),
  reset: async () => {},
});

let prismaStore;
export const getResetStore = () => (usingPostgres() ? (prismaStore ??= createPrismaStore(getPrismaClient())) : memoryStore);
