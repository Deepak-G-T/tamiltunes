# Video songs (Audio | Video, YouTube embed only)

## Rules (do not change without a decision)
- Video comes ONLY from YouTube's official IFrame Player API (embed). No downloading, no stream extraction, no re-hosting, no caching anywhere
  (service worker: no route touches YouTube or streams; native app: no download feature; backend: stores video ids, never video).
  YouTube's controls and branding stay visible; nothing is drawn over the player. The player is never hidden while it plays.
- The YouTube API key and every YouTube lookup stay on the backend (`backend/src/services/music/videoLookup.js`). The frontend only knows video ids.
- The batch auto-match job (match every song to a video) is NOT built: a later phase.

## Data
- `songs.video_id` (admin-chosen YouTube id), `songs.video_available` (false = hidden for everyone), `songs.video_flagged_at`, table `video_reports`
  (one row per person, song and video). Migration `20261126000000_song_videos` (additive and idempotent).
- Which video a song gets (`videoLookup.peek / lookup / attach`, with `getOverride` from `services/songVideos/service.js`):
  admin-chosen id, then the curated map, then the 24 h cache / optional Data API. A flagged song (`video_available = false`) gets no video,
  even if it carried one (YouTube-only songs keep theirs: they have nothing else to play). The database values are kept in memory and
  refreshed every 5 minutes and right after every change.

## Failed embeds (YouTube errors 2, 100, 101, 150: bad id, removed or private, embedding off, region block)
1. The player switches to audio at the same position and says "Video isn't available for this song".
2. The video is hidden for THIS person for 7 days, in this browser only (`lib/videoHides.js`).
3. Signed in: `POST /api/songs/:id/video-report { videoId, code }` (rate limited 20/hour per account). Only counts for the video the server
   actually offers for that song, once per person. After 2 different people the video is hidden for everyone until an admin restores it.

## API (admin = `users.role` "admin"; the admin screens come with the admin panel, PR #31)
| Method | Path | What |
|---|---|---|
| POST | `/api/songs/:id/video-report` | report a failed embed (signed in) |
| GET | `/api/admin/videos/songs?missing=1&limit&offset` | saved songs, their served video and its source (admin / automatic / hidden / none) |
| GET | `/api/admin/videos/flagged` | hidden videos with report counts and YouTube error codes |
| GET | `/api/admin/videos/check/:videoId` | can it be embedded? (oEmbed; also the Data API, 1 unit, when configured) |
| PUT | `/api/admin/videos/:songId` `{ videoId }` | choose the video (clears flag and reports) |
| DELETE | `/api/admin/videos/:songId` | remove the choice (automatic lookup again) |
| POST | `/api/admin/videos/:songId/restore` | show the video again, forget the reports |
When PR #31 merges, put `/api/admin/videos` behind its admin check (2FA included).

## Player
- Toggle only in Now Playing; the mini player stays audio. Closing Now Playing during a video switches to audio at the same spot.
- 16:9 area (on narrow phones exactly 200 px tall: YouTube's minimum), Full screen button (landscape where allowed), screen kept awake
  only while a video plays, Android Back leaves full screen first. Embed: `youtube-nocookie.com`; the YouTube script loads only on first video.
- Screen lock / background: YouTube pauses (no workaround). Back in the app: "Video pauses when the screen locks. Switch to Audio for background play."
- Settings (per device, `lib/videoPrefs.js`): Prefer video (off; only in Now Playing; a song switched to audio by hand stays audio),
  Wi-Fi only video (on; mobile data is detected only by Chrome on Android and the Android app). No quality picker: YouTube ignores quality requests.
- Lists: video icon on song cards and queue rows, Home "Video songs" shelf (4+ songs, canonical dedupe) and Videos chip, Search videos chip,
  Videos sections on artist and album pages; thumbnails `i.ytimg.com/vi/<id>/mqdefault.jpg` (lazy, cover as fallback); the embed loads on tap.

## Migration: Neon dev branch first, then production
Run these on YOUR computer. Never paste a connection string into a chat.
1. Create a Neon dev branch from production and get its UNPOOLED url:
   `npx neonctl branches create --project-id rapid-poetry-01926455 --name video-songs-test`
   `npx neonctl cs video-songs-test --project-id rapid-poetry-01926455 --database-name tamiltunes_live` (copy into the shell only)
2. On the dev branch: `DATABASE_URL=<dev url> npx prisma migrate deploy --schema backend/prisma/schema.prisma` and check that row counts of `songs`,
   `users`, `favorites` are unchanged and the new columns read `video_id = null`, `video_available = true`.
3. Production: **create a Neon backup branch first** (`npx neonctl branches create --project-id rapid-poetry-01926455 --name backup-before-video-songs`),
   then merge the PR: Render runs `prisma migrate deploy` itself. (Manual equivalent, only if you are not merging: `DATABASE_URL=<prod UNPOOLED url> npm run migrate --prefix backend`.)
4. Delete the dev branch when done: `npx neonctl branches delete video-songs-test --project-id rapid-poetry-01926455`.

## Tests
`npm test --prefix backend` (song-videos.test.js: memory and, with TEST_DATABASE_URL, Postgres), `npm test --prefix frontend`,
`npm run test:ui --prefix frontend` (ui-audit: toggle, position both ways, close-to-audio, errors, reports, settings, lists; native-audit: Back order;
pwa-audit: privacy page, nothing cached). `UI_AUDIT_ONLY=viewports|report|settings|lists` runs one part of the UI audit.

## Real-phone checklist (all UNTESTED until reported)
1. Rotation and the Full screen button: the video fills the screen in landscape; leaving full screen returns to portrait. [UNTESTED]
2. Screen lock during a video: the video pauses; back in the app the "Switch to audio" message appears and works. [UNTESTED]
3. The screen stays on while a video plays and can turn off again once it is paused or on audio. [UNTESTED]
4. Android Back during full screen video: leaves full screen first, then closes Now Playing. [UNTESTED]
5. Bluetooth / headset buttons and the lock-screen controls while a video plays (play / pause / next / previous). [UNTESTED]
6. Wi-Fi only video on mobile data (turn Wi-Fi off): Video does not start; a playing video switches to audio. [UNTESTED]
7. A video that will not embed: the message shows, audio continues, the toggle is gone for that song. [UNTESTED]
8. Video songs shelf and thumbnails on a slow connection: thumbnails appear, the page does not jump, a tap plays the video. [UNTESTED]

## Safety notes (before merging)
- **Admin routes** (`/api/admin/videos/*`) use `requireOwnerAdmin('ADMIN_VIDEO_USER_IDS')`: the account must have `users.role = 'admin'` AND its id must be in the
  env list `ADMIN_VIDEO_USER_IDS` (comma-separated, read on every request). Empty or unset = 403 for everyone (fail closed). Logged out = 401, normal user = 403.
  Test: `backend/test/admin-video-access.test.js`. When the login-gate/admin work (PR #31) is in, move these routes onto its admin check (with 2FA) and drop the list.
- **No media is stored**: the stream proxy sends `Cache-Control: no-store` and forwards no upstream cache headers; the service worker never touches YouTube
  hosts, audio hosts (other than cover pictures), Range or audio/video requests; the Android app has no file or download permission or plugin.
  Guards: `backend/test/no-media-storage.test.js`, `frontend/src/lib/noMediaStorage.test.js`, `swRules.test.js`, `stream.test.js`.
- **Migration** `20261126000000_song_videos` starts with `SET lock_timeout = '10s'` (a lock wait longer than that aborts and rolls back the whole script).
  If it ever fails on Neon: `npx prisma migrate resolve --rolled-back 20261126000000_song_videos`, then redeploy. Statements are only ADD COLUMN (constant default,
  no table rewrite), one plain CREATE INDEX on songs (blocks writes for a moment; CONCURRENTLY cannot run inside Prisma's transaction) and a new table.
