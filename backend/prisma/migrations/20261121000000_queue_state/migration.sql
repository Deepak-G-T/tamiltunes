-- Additive only: nothing is dropped or rewritten. Safe to run twice.
CREATE TABLE IF NOT EXISTS "queue_state" (
  "user_id" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "current_index" INTEGER NOT NULL DEFAULT -1,
  "position_sec" INTEGER NOT NULL DEFAULT 0,
  "shuffle" BOOLEAN NOT NULL DEFAULT false,
  "repeat" TEXT NOT NULL DEFAULT 'off',
  "autoplay" BOOLEAN NOT NULL DEFAULT true,
  "mode" TEXT NOT NULL DEFAULT 'radio',
  "source_label" TEXT,
  "device_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "queue_state_pkey" PRIMARY KEY ("user_id")
);

DO $$ BEGIN
  ALTER TABLE "queue_state" ADD CONSTRAINT "queue_state_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
