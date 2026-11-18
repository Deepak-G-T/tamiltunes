-- Additive only. Speeds up "most played songs across everyone in the last days" on the home page. Safe to run twice.
CREATE INDEX IF NOT EXISTS "play_events_playedAt_idx" ON "play_events"("playedAt");
