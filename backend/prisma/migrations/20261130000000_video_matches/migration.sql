-- Additive and idempotent: one new table, no existing table or value is touched. Safe to run again.
CREATE TABLE IF NOT EXISTS "video_matches" (
    "song_key" TEXT NOT NULL,
    "video_id" TEXT,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_matches_pkey" PRIMARY KEY ("song_key")
);
CREATE INDEX IF NOT EXISTS "video_matches_checked_at_idx" ON "video_matches"("checked_at");
