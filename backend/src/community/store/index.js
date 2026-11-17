/**
 * Community store: one contract, two implementations (Prisma/PostgreSQL and in-memory for dev/tests).
 * Controllers call getStore() per request so the choice follows the live DB connection state.
 */
import { usingPostgres, getPrismaClient } from '../../prisma/client.js';
import { createPrismaStore } from './prismaStore.js';
import { createMemoryStore } from './memoryStore.js';

let prismaStore;
let memoryStore;

export const getStore = () => {
  if (usingPostgres()) return (prismaStore ??= createPrismaStore(getPrismaClient()));
  return (memoryStore ??= createMemoryStore());
};
