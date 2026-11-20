-- No-repeat rules. Additive and idempotent: two new columns on queue_state (defaults: empty memory, repeats not allowed) and a new table.
-- No existing value is changed or deleted. (A column with a constant default is added without rewriting the table on PostgreSQL 11+; queue_state has one row per user.)
-- lock_timeout makes the script give up after 10 s instead of queueing behind a long query. It runs as one transaction, so a timeout rolls everything back and
-- re-running is safe. If it fails: npx prisma migrate resolve --rolled-back 20261128000000_no_repeat
SET lock_timeout = '10s';

ALTER TABLE "queue_state" ADD COLUMN IF NOT EXISTS "heard" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "queue_state" ADD COLUMN IF NOT EXISTS "allow_repeats" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "user_song_blocks" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "song_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artist" TEXT,
  "album" TEXT,
  "duration_sec" INTEGER,
  "image" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_song_blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_song_blocks_user_id_key_key" ON "user_song_blocks"("user_id", "key");
CREATE INDEX IF NOT EXISTS "user_song_blocks_user_id_idx" ON "user_song_blocks"("user_id");

DO $$ BEGIN
  ALTER TABLE "user_song_blocks" ADD CONSTRAINT "user_song_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

RESET lock_timeout;
