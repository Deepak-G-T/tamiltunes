-- AlterTable
ALTER TABLE "listening_history" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: Playlist User Lookup
CREATE INDEX IF NOT EXISTS "playlists_userId_idx" ON "playlists"("userId");

-- CreateIndex: Foreign key songId lookup on playlist_songs
-- Note: playlistId is already covered as the leading column in the unique index (playlistId, songId)
CREATE INDEX IF NOT EXISTS "playlist_songs_songId_idx" ON "playlist_songs"("songId");

-- CreateIndex: Foreign key songId lookup on favorites
-- Note: userId is already covered as the leading column in the unique index (userId, songId)
CREATE INDEX IF NOT EXISTS "favorites_songId_idx" ON "favorites"("songId");

-- CreateIndex: Foreign key songId lookup on listening_history
CREATE INDEX IF NOT EXISTS "listening_history_songId_idx" ON "listening_history"("songId");

-- CreateIndex: Composite timelines with descending sort
-- Note: Standalone userId index is redundant as userId is the leading column in these composite indexes
CREATE INDEX IF NOT EXISTS "listening_history_userId_playedAt_idx" ON "listening_history"("userId", "playedAt" DESC);
CREATE INDEX IF NOT EXISTS "listening_history_userId_createdAt_idx" ON "listening_history"("userId", "createdAt" DESC);
