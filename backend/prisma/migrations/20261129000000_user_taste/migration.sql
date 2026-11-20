-- Onboarding: what a person likes (artists, music directors, eras). Additive and idempotent. Private to the person.
SET lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS "user_taste" (
  "user_id"    TEXT NOT NULL,
  "artists"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "composers"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "eras"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "skipped"    BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_taste_pkey" PRIMARY KEY ("user_id")
);

DO $$ BEGIN
  ALTER TABLE "user_taste" ADD CONSTRAINT "user_taste_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
