/**
 * Speed Dial storage: play events, per-user ranking and pin / hide overrides.
 * One contract, two implementations: Prisma/PostgreSQL (production, parameterised SQL) and in-memory (dev + tests).
 * The ranking SQL mirrors ranking.js; running the backend suite with TEST_DATABASE_URL checks they agree.
 */
import { usingPostgres, getPrismaClient } from '../../prisma/client.js';
import { memoryEvents } from '../related/signalsStore.js';
import { scoreEvents, isCountedPlay } from './ranking.js';
import { SPEED_DIAL } from './config.js';

const memoryOverrides = new Map(); // userId -> Map(songId -> override)

export function createMemoryStore() {
  const forUser = (userId) => {
    if (!memoryOverrides.has(userId)) memoryOverrides.set(userId, new Map());
    return memoryOverrides.get(userId);
  };
  return {
    kind: 'memory',

    /** Insert, or update the row with the same (user, playId): completion arrives after the 30 s mark. */
    async upsertPlayEvent(userId, e) {
      const existing = e.playId ? memoryEvents.find((x) => x.userId === userId && x.playId === e.playId) : null;
      if (existing) {
        existing.completed = existing.completed || Boolean(e.completed);
        existing.listenedSec = Math.max(existing.listenedSec ?? 0, e.listenedSec ?? 0);
        existing.durationSec = e.durationSec ?? existing.durationSec;
        if (e.skippedAtSec != null) existing.skippedAtSec = e.skippedAtSec;
        else if (isCountedPlay(existing)) existing.skippedAtSec = null;
        return existing;
      }
      const row = { userId, songId: e.songId, playedAt: e.playedAt ?? new Date(), completed: Boolean(e.completed), skippedAtSec: e.skippedAtSec ?? null, source: e.source ?? null, playId: e.playId ?? null, listenedSec: e.listenedSec ?? 0, durationSec: e.durationSec ?? 0 };
      memoryEvents.push(row);
      return row;
    },

    async scoreSongs(userId, now = Date.now(), cfg = SPEED_DIAL) {
      return scoreEvents(memoryEvents.filter((e) => e.userId === userId), now, cfg);
    },

    async listOverrides(userId) {
      return [...forUser(userId).values()].map((o) => ({ ...o }));
    },
    async upsertOverride(userId, songId, patch) {
      const map = forUser(userId);
      const next = { songId, slotPosition: null, isPinned: false, isHidden: false, ...(map.get(songId) || {}), ...patch, updatedAt: new Date() };
      map.set(songId, next);
      return { ...next };
    },
    async upsertOverrides(userId, list) {
      for (const { songId, patch } of list) await this.upsertOverride(userId, songId, patch);
    },
    async clearOverrides(userId) {
      memoryOverrides.delete(userId);
    },
  };
}

export function createPrismaStore(prisma) {
  return {
    kind: 'prisma',

    async upsertPlayEvent(userId, e) {
      const data = {
        songId: e.songId,
        completed: Boolean(e.completed),
        skippedAtSec: e.skippedAtSec ?? null,
        source: e.source ?? null,
        listenedSec: e.listenedSec ?? null,
        durationSec: e.durationSec ?? null,
        ...(e.playedAt ? { playedAt: new Date(e.playedAt) } : {}),
      };
      if (!e.playId) return prisma.playEvent.create({ data: { userId, ...data } });
      return prisma.playEvent.upsert({
        where: { userId_playId: { userId, playId: e.playId } },
        create: { userId, playId: e.playId, ...data },
        update: {
          // the same play reporting again: keep the furthest listening point, never lose a completion
          ...(e.completed ? { completed: true } : {}),
          ...(e.listenedSec != null ? { listenedSec: e.listenedSec } : {}),
          ...(e.durationSec != null ? { durationSec: e.durationSec } : {}),
          ...(e.skippedAtSec != null ? { skippedAtSec: e.skippedAtSec } : {}),
        },
      });
    },

    /** Same maths as ranking.scoreEvents, done in one grouped query that uses play_events(userId, songId, playedAt). */
    async scoreSongs(userId, now = Date.now(), cfg = SPEED_DIAL) {
      const rows = await prisma.$queryRaw`
        WITH ev AS (
          SELECT "songId", "playedAt", "completed", "skippedAtSec",
                 ("completed"
                  OR COALESCE("listenedSec", 0) >= ${cfg.countedAfterSeconds}::int
                  OR (COALESCE("durationSec", 0) > 0 AND COALESCE("listenedSec", 0) >= ${cfg.countedAfterFraction}::float8 * "durationSec")) AS counted
          FROM play_events
          WHERE "userId" = ${userId}
            AND "playedAt" >= ${new Date(now - cfg.windowDays * 86400e3)}
            AND "playedAt" <= ${new Date(now + 60e3)}
        )
        SELECT "songId",
               SUM(
                 CASE WHEN counted THEN ${cfg.playWeight}::float8 + CASE WHEN "completed" THEN ${cfg.completionBonus}::float8 ELSE 0 END
                      WHEN "skippedAtSec" IS NOT NULL THEN -${cfg.skipPenalty}::float8
                      ELSE 0 END
                 * POWER(0.5, GREATEST(EXTRACT(EPOCH FROM (${new Date(now)}::timestamp - "playedAt")), 0) / 86400.0 / ${cfg.halfLifeDays}::float8)
               ) AS score,
               (COUNT(*) FILTER (WHERE counted))::int AS plays,
               MAX("playedAt") FILTER (WHERE counted) AS "lastPlayedAt"
        FROM ev
        GROUP BY "songId"
        HAVING COUNT(*) FILTER (WHERE counted) > 0
        ORDER BY score DESC, "lastPlayedAt" DESC, "songId" ASC
        LIMIT ${cfg.maxCandidates}`;
      return rows.map((r) => ({ songId: r.songId, score: Math.round(Number(r.score) * 1e6) / 1e6, plays: Number(r.plays), lastPlayedAt: new Date(r.lastPlayedAt) }));
    },

    listOverrides: (userId) => prisma.speedDialOverride.findMany({ where: { userId } }),
    upsertOverride: (userId, songId, patch) =>
      prisma.speedDialOverride.upsert({ where: { userId_songId: { userId, songId } }, create: { userId, songId, ...patch }, update: patch }),
    async upsertOverrides(userId, list) {
      await prisma.$transaction(list.map(({ songId, patch }) =>
        prisma.speedDialOverride.upsert({ where: { userId_songId: { userId, songId } }, create: { userId, songId, ...patch }, update: patch })));
    },
    async clearOverrides(userId) {
      await prisma.speedDialOverride.deleteMany({ where: { userId } });
    },
  };
}

let prismaStore;
let memoryStore;
export const getSpeedDialStore = () =>
  usingPostgres() ? (prismaStore ??= createPrismaStore(getPrismaClient())) : (memoryStore ??= createMemoryStore());

/** Test helper: forget in-memory overrides. */
export const resetMemoryOverrides = () => memoryOverrides.clear();
