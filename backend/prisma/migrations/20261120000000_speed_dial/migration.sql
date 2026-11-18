-- Additive only: nothing is dropped or rewritten.

-- play_events: enough detail to tell a real play from a skip
ALTER TABLE "play_events" ADD COLUMN IF NOT EXISTS "playId" TEXT;
ALTER TABLE "play_events" ADD COLUMN IF NOT EXISTS "listenedSec" INTEGER;
ALTER TABLE "play_events" ADD COLUMN IF NOT EXISTS "durationSec" INTEGER;
-- NULL playId is allowed many times; a given (user, playId) is unique so a later "completed" update hits the same row
CREATE UNIQUE INDEX IF NOT EXISTS "play_events_userId_playId_key" ON "play_events"("userId", "playId");
CREATE INDEX IF NOT EXISTS "play_events_userId_songId_playedAt_idx" ON "play_events"("userId", "songId", "playedAt");

-- Speed Dial pins and hidden songs
CREATE TABLE IF NOT EXISTS "speed_dial_overrides" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "songId" TEXT NOT NULL,
  "slotPosition" INTEGER,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "speed_dial_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "speed_dial_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "speed_dial_overrides_userId_songId_key" ON "speed_dial_overrides"("userId", "songId");
CREATE INDEX IF NOT EXISTS "speed_dial_overrides_userId_idx" ON "speed_dial_overrides"("userId");
