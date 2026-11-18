-- Additive only: nothing is dropped or rewritten.

-- Song metadata for related-songs ranking (all nullable / defaulted)
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "composer" TEXT;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "singers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "movie" TEXT;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "year" INTEGER;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "language" TEXT;
CREATE INDEX IF NOT EXISTS "songs_composer_idx" ON "songs"("composer");
CREATE INDEX IF NOT EXISTS "songs_language_year_idx" ON "songs"("language", "year");

-- Play events: completions and skips per user
CREATE TABLE IF NOT EXISTS "play_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "songId" TEXT NOT NULL,
  "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "skippedAtSec" INTEGER,
  "source" TEXT,
  CONSTRAINT "play_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "play_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "play_events_userId_playedAt_idx" ON "play_events"("userId", "playedAt" DESC);
CREATE INDEX IF NOT EXISTS "play_events_songId_playedAt_idx" ON "play_events"("songId", "playedAt" DESC);
