-- Additive and idempotent: three new nullable / defaulted columns on songs and a new table. No existing value is changed or deleted.
-- (PostgreSQL 11+ adds a column with a constant default without rewriting the table: existing rows simply read the default, true.)
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "video_id" TEXT;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "video_available" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "video_flagged_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "songs_video_available_idx" ON "songs"("video_available");

CREATE TABLE IF NOT EXISTS "video_reports" (
    "id" TEXT NOT NULL,
    "song_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_reports_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_reports_song_id_user_id_video_id_key" ON "video_reports"("song_id", "user_id", "video_id");
CREATE INDEX IF NOT EXISTS "video_reports_song_id_idx" ON "video_reports"("song_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_reports_song_id_fkey') THEN
    ALTER TABLE "video_reports" ADD CONSTRAINT "video_reports_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_reports_user_id_fkey') THEN
    ALTER TABLE "video_reports" ADD CONSTRAINT "video_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
