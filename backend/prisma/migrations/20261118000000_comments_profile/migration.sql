-- Additive only: no existing column, table or row is dropped or rewritten
-- (except filling the new nullable "username" for users that have none).

-- Users: profile + privacy fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "favoriteArtists" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isPublicProfile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "showHistory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';

-- Backfill usernames: slug of the name + first 6 chars of the id (unique because ids are unique).
-- Idempotent: only touches rows where username IS NULL.
UPDATE "users"
SET "username" = LOWER(
      COALESCE(NULLIF(SUBSTRING(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '', 'g') FROM 1 FOR 14), ''), 'user')
      || '_' || SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 6)
    )
WHERE "username" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");

-- Playlists: private by default
ALTER TABLE "playlists" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- Comments
CREATE TABLE IF NOT EXISTS "comments" (
  "id" TEXT NOT NULL,
  "songId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "parentId" TEXT,
  "body" TEXT NOT NULL,
  "timestampSec" INTEGER,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "likedByArtist" BOOLEAN NOT NULL DEFAULT false,
  "editedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "comments_songId_createdAt_idx" ON "comments"("songId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "comments_songId_likeCount_idx" ON "comments"("songId", "likeCount" DESC);
CREATE INDEX IF NOT EXISTS "comments_parentId_idx" ON "comments"("parentId");
CREATE INDEX IF NOT EXISTS "comments_userId_createdAt_idx" ON "comments"("userId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "comment_likes" (
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("commentId", "userId"),
  CONSTRAINT "comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "comment_likes_userId_idx" ON "comment_likes"("userId");

CREATE TABLE IF NOT EXISTS "follows" (
  "followerId" TEXT NOT NULL,
  "followedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "follows_pkey" PRIMARY KEY ("followerId", "followedId"),
  CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "follows_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "follows_followedId_createdAt_idx" ON "follows"("followedId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "reports" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reports_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "reports_commentId_reporterId_key" ON "reports"("commentId", "reporterId");
