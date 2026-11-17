-- AlterTable
ALTER TABLE "listening_history" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "playlists_userId_idx" ON "playlists"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "playlist_songs_playlistId_idx" ON "playlist_songs"("playlistId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "playlist_songs_songId_idx" ON "playlist_songs"("songId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "favorites_userId_idx" ON "favorites"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "favorites_songId_idx" ON "favorites"("songId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listening_history_userId_idx" ON "listening_history"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listening_history_songId_idx" ON "listening_history"("songId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listening_history_userId_playedAt_idx" ON "listening_history"("userId", "playedAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listening_history_userId_createdAt_idx" ON "listening_history"("userId", "createdAt" DESC);
