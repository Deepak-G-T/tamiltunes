-- Additive and idempotent. canonical_id points at the best copy of a song that exists under several ids. Nothing is deleted or rewritten.
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "canonical_id" TEXT;
CREATE INDEX IF NOT EXISTS "songs_canonical_id_idx" ON "songs"("canonical_id");
