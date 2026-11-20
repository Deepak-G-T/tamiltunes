-- Google-only sign-in. Additive and idempotent: three new nullable columns on users, "password" becomes optional, a unique index and a plain index.
-- No existing value is changed or deleted. (Dropping NOT NULL and adding nullable columns do not rewrite the table; the two index builds block writes to
-- "users" for a moment, and the users table is small. lock_timeout makes the script give up after 10 s instead of queueing behind a long query; it runs as
-- one transaction, so a timeout rolls back everything and re-running is safe. If it fails: npx prisma migrate resolve --rolled-back 20261127000000_google_signin)
SET lock_timeout = '10s';

ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_sub" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_key" ON "users"("google_sub");
CREATE INDEX IF NOT EXISTS "users_last_seen_at_idx" ON "users"("last_seen_at");

RESET lock_timeout;
