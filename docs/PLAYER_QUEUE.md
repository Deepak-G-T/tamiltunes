# Player queue (Part C, phase 3)

One global player store (`frontend/src/context/AudioContext.jsx`) driven by the pure engine `frontend/src/lib/radioQueue.js`.

## Queue model
- Sections: **Now playing**, **Next in queue** (songs you added; always play first), **Next from radio** (or "Next in this list" when you started a playlist/album).
- Starting a song from search/Speed Dial starts radio (`/api/songs/:id/related`); starting from a list plays that list in order. At the end of a list the player offers to continue with radio.
- Radio refills when fewer than 5 songs remain and asks for 50; failures back off 1s..30s; the same song never appears twice in the queue (docs/NO_REPEAT.md).
- Actions: Play next, Add to queue (song "..." menu or long-press), drag reorder (desktop) / move up-down menu (mobile), swipe left to remove, Clear queue.
- Autoplay toggle: queue drawer footer and Settings (`tamiltunes_autoplay` in localStorage).
- Shuffle, repeat off/all/one; soft fade in (0.6s) / out (1.2s) (iOS ignores element volume); next track is preloaded; stream errors skip with a toast.
- Search has a Playlists group (public playlists of public profiles only): `backend/src/services/playlistSearch.js`.

## Not built / UNTESTED
- No true overlapping crossfade or gapless playback; no search suggestions endpoint (recent searches remain).
- UNTESTED: queue drawer gestures (drag, swipe) on a real phone, Playlists search on real Postgres (Prisma `contains` query).
- No migration in this phase.
