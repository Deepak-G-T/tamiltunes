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

## API (admin = `users.role` "admin")
| Method | Path | What |
|---|---|---|
| POST | `/api/songs/:id/video-report` | report a failed embed (signed in) |
| GET | `/api/admin/videos/songs?missing=1&limit&offset` | saved songs, their served video and its source (admin / automatic / hidden / none) |
| GET | `/api/admin/videos/flagged` | hidden videos with report counts and YouTube error codes |
| GET | `/api/admin/videos/:songId` | one song's video now: chosen / hidden / automatic / none, and the id it plays |
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

## Adding a video to one song by hand (Admin > Songs)
Admin panel > **Songs** > the **Video** button on a song (a camera icon in the table on a computer, a "Video" button on a phone):
1. Paste a YouTube link (watch, youtu.be, shorts, embed, live, music.youtube.com) or the 11-character id. Playlist, channel and other-website links are refused (`lib/youtubeLink.js`).
2. **Check**: shows the video's title and channel and whether it can be played inside the app (oEmbed; the Data API too when a key is set). A video that cannot be embedded cannot be saved.
   A title that looks like a lyric, audio, live or jukebox upload gets a gentle warning (the app prefers the official video song); open it on YouTube to be sure.
3. **Save video**. Your choice always wins over the automatic lookup. **Remove my choice** goes back to the automatic lookup; **Show the video again** undoes a hidden video (2 people could not play it).
Your account needs the admin role AND its user id in the Render setting `ADMIN_VIDEO_USER_IDS` (otherwise the screen says so). Nothing is downloaded or stored: only the video id is saved.
Browser audit: `npm run test:admin-video --prefix frontend` (27 checks).

## Turning on automatic videos (YouTube Data API key)
Without a key only the curated map (`curatedVideos.js`, nine songs) and your admin choices give videos. With a key, official channels' uploads are indexed daily and most songs from them get a video.
The website and the Android app use the same code, so both get videos at the same time; the app needs no new build for this (the lookup is on the server).
1. Google Cloud Console > APIs & Services > Library: enable **YouTube Data API v3**. Credentials: create an API key. Restrict it: **API restrictions = YouTube Data API v3**; **Application restrictions = None**
   (Render has no fixed address). Never paste the key in chat or commit it.
2. Check it on YOUR computer (about 2 quota units; prints each channel's real name so you can confirm it is the official one; never prints the key):
   `YOUTUBE_API_KEY=... VIDEO_CHANNEL_ALLOWLIST=UC...,UC... npm run video:check --prefix backend`
   (PowerShell: `$env:YOUTUBE_API_KEY="..."; $env:VIDEO_CHANNEL_ALLOWLIST="UC...,UC..."; npm run video:check --prefix backend`, then close the window.) It explains bad keys, a disabled API, quota and key restrictions in plain words.
3. Render > Environment: `YOUTUBE_API_KEY`, `VIDEO_CHANNEL_ALLOWLIST` (required; empty = nothing is served), optionally `YOUTUBE_DAILY_BUDGET` (5000), `VIDEO_INDEX_MAX_PAGES` (10; up to 40 for older songs), `VIDEO_SEARCH_FALLBACK` (true). Redeploy (a change made through the Render API does not redeploy by itself).
4. Give it a day: the first index run, then Home shows a "Video songs" shelf (4+ songs) and songs show the Audio | Video toggle in Now Playing. A wrong or missing video for one song: pick it by hand with the admin routes above.
Quota: the index costs about channels x pages x 2 units a day (4 channels x 10 pages = 80); each per-song search about 101; Google's default is 10,000 a day.

## Batch matcher (more songs get a video, without paying twice)
`npm run video:batch --prefix backend` looks at the songs people play most, finds each one's official video (curated map, then the channel index, then a budgeted per-song search) and
remembers the result in the table `video_matches`. The app reads that table (refreshed every 10 minutes), so a song that was searched once is never searched again, even after Render restarts.
- **Dry run by default.** It saves nothing until you add `--apply`. A dry run still spends YouTube quota (the index and the searches), so start small.
- Run it on YOUR computer with the same three values as the check, plus the UNPOOLED database url (never paste them in a chat):
  `$env:YOUTUBE_API_KEY="..."; $env:VIDEO_CHANNEL_ALLOWLIST="UC...,UC..."; $env:DATABASE_URL="<unpooled url>"; npm run video:batch --prefix backend -- --limit=300 --max-units=1500`
- Options: `--limit=N` songs (default 300, max 5000, most played first), `--max-units=N` quota for this run (default 1500, max 8000), `--apply`, `--no-search` (index only, costs a few units),
  `--retry-none` (look again at songs recorded as "no video"; they are retried after 14 days anyway).
- The report shows: index size, songs looked at, how many were already known, new matches from the index and from a search, songs with no official video (a sample, to see which channel to add), how many were not looked up
  because the quota ran out, and the coverage. Run it again the next day to continue; known songs are skipped.
- Safety: only `video_matches` rows are written (id, title, artist, source). An admin choice or a flagged video always beats a stored match; curated songs, admin choices and failed lookups are never stored; "no video found"
  is trusted for 14 days. Stored matches are served only while `YOUTUBE_API_KEY` and `VIDEO_CHANNEL_ALLOWLIST` are set (remove either and videos switch off). Nothing is downloaded or stored but ids.
- Quota: the script and the server count their own use, but Google's 10,000 units a day are shared. A search costs about 101 units, so 1500 units is about 14 searches after the index. More coverage per unit comes from a
  deeper index (`VIDEO_INDEX_MAX_PAGES` up to 40) and from adding the official label channels (`npm run video:check` first).
- **Recent videos (`--recent=N`).** Instead of looking at play counts, it starts from each allow-listed channel's newest N uploads (default off, max 300): it reads "Song - Video Song | Film" from the upload title, searches the music catalogue for that song (title and film must match; if the upload names no film there must be exactly one catalogue song with that title), and saves "this catalogue song -> this official video". It uses the channel index (about 1 unit per 50 uploads) and no per-song searches. Dry run first:
  `$env:YOUTUBE_API_KEY=...; $env:VIDEO_CHANNEL_ALLOWLIST=...; $env:DATABASE_URL=...; $env:VIDEO_INDEX_MAX_PAGES="40"; npm run video:batch --prefix backend -- --recent=150`
  Shorts, visualizers, highlights, speeches, previews and glimpses are skipped (they are not the video song). The film named in the upload title must match the catalogue album: a one-word name (often an actor) must equal the album exactly, a longer one may sit inside it.
  The report lists uploads whose song was not found in the catalogue (a sample). A video that is already saved for a song is never replaced. It needs internet access to the music provider (JioSaavn), so run it on your computer. UNTESTED against the live catalogue: spot-check the matches before `--apply`.
- Migration `20261130000000_video_matches` (additive, one new table; take the Neon backup BEFORE merging, as always). Tests: `node test/video-batch.test.js` (fake YouTube); the Prisma store and the played-songs query passed on a scratch Postgres 16.
- UNTESTED: a run against real YouTube and the real catalogue (how many songs match, whether the matched videos are the right ones: read the report and spot-check some links before `--apply`).

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
`npm test --prefix backend` (song-videos.test.js: memory and, with TEST_DATABASE_URL, Postgres; video-setup-check.test.js: the owner check with a fake Google), `npm test --prefix frontend`,
`npm run test:ui --prefix frontend` (admin-video-audit.mjs: the admin screen above; ui-audit: toggle, position both ways, close-to-audio, errors, reports, settings, lists; native-audit: Back order;
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
