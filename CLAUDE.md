# TamilTunes: project rules

Stack: React + Vite (Vercel) frontend, Node/Express + Prisma + PostgreSQL backend (Render).
Music providers: jiosaavn (unlicensed, personal/portfolio only), youtube (IFrame embed, player must stay visible), local, mock (tests).

## Hard rules
- Never push to master or any remote. Never force-push.
- Work on branches; commit in small steps with clear messages.
- Never run destructive commands: no `prisma db push --accept-data-loss`, no `migrate reset`, no `git reset --hard`.
- Never touch the production database or read/print real secrets. Never commit .env files.
- Report only commands you actually ran. Mark anything else UNTESTED.
- Do not hardcode per-song allow/deny entries in the Tamil filter.

## Commands
- Backend tests: `npm test --prefix backend`
- Frontend tests: `npm test --prefix frontend`
- Frontend build: `npm run build --prefix frontend`
- UI audit: `npm run test:ui --prefix frontend` (Playwright at 360x640 and 390x844, mock backend, stubbed YouTube API)

## Known open items
- Real Postgres: the queue, playlist-search, related and Speed Dial suites passed on a scratch Postgres 16 (run the suites file by file with TEST_DATABASE_URL:
  `community-api.test.js` reads the in-memory store directly and does not run on Postgres). All migrations are applied on Neon production.
  `prisma migrate diff` against the schema shows one older drift (`speed_dial_overrides.updatedAt` default); it is not caused by recent work.
- Render runs `prisma migrate deploy` on every deploy, so a merge applies new migrations: take the Neon backup BEFORE merging a PR that has a migration.
- audit/golden_labeled.csv needs hand labels from the owner.
- Mobile full-screen player and YouTube autoplay must be tested on a real phone.
- Stream proxy: keep ENABLE_EXTERNAL_STREAMS off in production.
- Required env: Render needs DATABASE_URL, JWT_SECRET, NODE_ENV=production, CORS_ORIGIN (explicit origins), VERCEL_TEAM_SLUG, MUSIC_PROVIDER. Vercel needs VITE_API_BASE_URL.
- Database: production runs on Neon (Singapore, Postgres 18). `DATABASE_URL` is a Render dashboard value
  (`sync: false` in render.yaml), set to the Neon DIRECT string with `?sslmode=require&connect_timeout=15&connection_limit=5`.
  Setting it through the Render API does NOT redeploy: trigger a deploy afterwards. The backend retries the first
  connection (Neon scales to zero). The legacy Render Postgres has been retired. Take periodic `pg_dump` backups of Neon (its free plan has only a
  short restore window) and keep them outside the repo.

## Optional env: video lookup (all off by default)
Songs may carry an optional `videoId`. It comes from the curated map `backend/src/services/music/curatedVideos.js`
(no API needed) and, only if configured, from a cached YouTube Data API lookup.
- `YOUTUBE_API_KEY` (optional): enables API lookups. Without it the API is never called.
- `VIDEO_CHANNEL_ALLOWLIST` (optional, comma-separated YouTube channel IDs): official channels whose videos may be
  returned. Fail-closed: empty means every API result is rejected (and the API is not called at all).
  Results must also be `status.embeddable === true` and public.
- `YOUTUBE_DAILY_BUDGET` (optional, default 5000): quota units per UTC day we allow ourselves. One lookup costs
  101 units (search 100 + videos.list 1); the platform default quota is 10,000 units/day.
- `VIDEO_INDEX_MAX_PAGES` (optional, default 10, max 40, 0 = off): how many pages of 50 uploads to index per allow-listed
  channel. The index costs about 1 quota unit per 50 videos (plus 1 per 50 to check embeddability), is refreshed daily,
  and lets songs be matched locally with no per-song search, so most songs from those channels can get a video.
  A song matches when its title appears in an upload title (one-word titles must also match the film name); lyric,
  audio, live and remix uploads are skipped. Channel IDs must look like `UC` + 22 characters.
- `VIDEO_SEARCH_FALLBACK` (optional, default true): after an index miss, spend about 101 quota units on a per-song search
  (within `YOUTUBE_DAILY_BUDGET`). `false` = index only.
- Results (including "no video found") are cached 24h; transient errors 10 min. Home/search never call the API
  inline: they use the curated map and cache, and queue background lookups. Only `GET /api/music/song/:id` awaits one
  (that route is limited to 30 requests/min per IP; `?fresh=1` stays open to guests for expired-stream recovery).
- The player falls back to audio with a toast on YouTube errors 101/150 (video not embeddable).
- The curated map serves official *video songs*, not lyric videos. Entries marked `candidate` (older ids, lyric videos)
  are kept in the file but never served (e.g. Badass `IqwIOlhfCak` is titled "LEO - Badass Lyric"). All nine served ids
  were checked by fetching the YouTube watch page and oEmbed endpoint: the uploader is an official channel, the title says
  Video Song / Official Video, and oEmbed returned 200. That is not the Data API's `status.embeddable` flag, so
  embeddability is still only likely. Badass is served from the VEVO upload `ZdMZ40GSVmc` ("Leo - Badass Video").
- Official channels seen so far (ids copied from those pages; confirm before use). A starting point for
  `VIDEO_CHANNEL_ALLOWLIST`:
  `UCBnxEdpoZwstJqC1yZpOjRA` (Sun TV), `UCn4rEMqKtwBQ6-oEwbd4PcA` (Sony Music South),
  `UCIx3RWYwikMlDiJeCEUbfEA` (Wunderbar Films), `UCTNtRdBAiZtHP9w7JinzfUg` (SonyMusicSouthVEVO).
  Big channels upload constantly, so the default index (10 pages, newest ~500 uploads) may not reach older songs:
  raise `VIDEO_INDEX_MAX_PAGES` (up to 40 = 2000 uploads, about 80 quota units per channel per day) and keep
  `VIDEO_SEARCH_FALLBACK` on for songs the index misses.
- The YouTube API lookup (when enabled) prefers titles with "Official Video"/"Video Song" and rejects lyric, audio,
  jukebox, teaser, live and similar uploads.

## Comments and profiles (feature/comments-profile)
- Backend: `backend/src/community/` (sanitiser, Tamil/English filter, username/avatar rules, zod schemas, store layer with Prisma
  and in-memory implementations), controllers `comment|profile|user`, routes `/api/songs/:id/comments`, `/api/comments/:id/*`,
  `/api/profile/me`, `/api/users/:username/*`. Authorization is enforced in the API (there is no RLS on this stack).
- Migration `20261118000000_comments_profile` is additive and idempotent (backfills `users.username`). Run with the
  direct (non-pooler) database URL: `npm run migrate --prefix backend` (Render also applies it on start). Seed demo
  data locally: `npm run seed:community --prefix backend`.
- Roles: `users.role` is `user` | `artist` | `admin`. Set it by hand in the database; it cannot be changed through the API.
  Artists/admins can pin comments; an artist's like shows the "Liked by artist" badge.
- Blocklists live in `backend/src/community/contentFilterWords.js`. The Tamil list is a conservative starter set and needs native review.
- Env: `FRONTEND_URL` (alias of `CORS_ORIGIN`); Vercel optional `BACKEND_URL` for `frontend/api/og.js` (link-preview HTML for bots).
- Comments poll every 8s while the sheet is open (no websockets). New comments show live; likes/edits/deletes by others on refresh.
- Playlists are private by default (`isPublic`); `GET /api/playlists/:id` returns 404 to non-owners of private playlists.
- Verified on real PostgreSQL (Neon): the Prisma store and the migration. UNTESTED: `frontend/api/og.js` + the bot rewrite on Vercel, real-phone crop/gestures.
- `npm run test:ui` runs two suites; the older `runPlaywrightAudit.mjs` needs real network (YouTube iframe) and also rewrites
  tracked files in `audit/screenshots/` (restore them with `git checkout -- audit/screenshots` before committing).

## Radio (feature/player-radio)
- `GET /api/songs/:id/related` ranks related songs; weights and tuning guide: `docs/RADIO.md`, knobs in
  `backend/src/services/related/weights.js`. Migration `20261119000000_radio_foundation` adds song metadata columns and `play_events`.
- UNTESTED: `reco.getreco` against live JioSaavn. (The Prisma signals queries passed on a scratch Postgres 16.)

## Speed Dial (feature/speed-dial, stacked on feature/player-radio)
- Home shows the user's most-played songs: ranking, pins, hide, reorder and tuning guide in `docs/SPEED_DIAL.md`; knobs in
  `backend/src/services/speedDial/config.js`. A play counts after 30 s or 50% of the song (server re-checks it).
- Migration `20261120000000_speed_dial` (play_events columns + `speed_dial_overrides`). Needs the radio migration first.
- UNTESTED: the 30 s counting with real audio on a phone, long-press on real devices. (The ranking SQL matched the JavaScript reference on a
  scratch Postgres 16.)

## Player queue (feature/player-queue, stacked on feature/speed-dial)
- Engine `frontend/src/lib/radioQueue.js` (tests in `radioQueue.test.js`), notes in `docs/PLAYER_QUEUE.md`. Search returns `playlists` (public only).
- UNTESTED: drawer drag/swipe on real devices. (Playlist search passed on a scratch Postgres 16.)

## Play queue v2 (feature/queue-v2, on master)
- Notes, API table and shortcuts: `docs/QUEUE_V2.md`. Migration `20261121000000_queue_state` (additive; run with the UNPOOLED url). Library: `@dnd-kit`.
- Only song ids are saved (`PUT /api/me/queue`); metadata is re-fetched on restore. `POST /api/music/songs/resolve` is public (guests), rate limited.
- `npm run test:queue --prefix frontend` runs the queue Playwright audit (also part of `npm run test:ui`).
- UNTESTED: real-phone drag/swipe, a second real device for "Continue on this device?". The `queue_state` migration is applied on Neon; the API passed on a scratch Postgres 16.
- A song that cannot be played is skipped with the toast `Couldn't play "<title>", skipped.`

## Home feed (feature/home-variety-queue-feel)
- `GET /api/home` assembles all shelves together (no repeats, Speed Dial songs left out via `?exclude=`); notes in `docs/HOME_FEED.md`.
  Migration `20261122000000_play_events_played_at_index` (additive index). `npm run test:home --prefix frontend` runs the home page audit.
- UNTESTED: the live JioSaavn pools; how full each shelf is with real data (thin shelves are hidden).
- Queue feel: Undo messages for every queue change, row motion (`hooks/useFlip.js`), `useQueue` context (panel is not redrawn on the song clock),
  autoplay variety and "Added N similar songs" (notes in `docs/QUEUE_V2.md`). UNTESTED: real-phone haptics, swipe reveal and drag feel.

## Auth (fix/auth-login)
- Emails are trimmed + lower-cased everywhere (`backend/src/services/auth/credentials.js` is the only place that hashes or checks passwords). Password reset by email
  (Brevo or Resend over HTTPS; env `EMAIL_PROVIDER`, `RESET_EMAIL_FROM`, `BREVO_API_KEY` / `RESEND_API_KEY`, `FRONTEND_URL`). Notes and the owner scripts
  (`reset-password`, `verify-password`, `report:email-collisions`): `docs/AUTH.md`. Migrations `20261123000000_password_reset`, `20261123000100_email_lower_unique`
  (take the Neon backup BEFORE merging; the second one skips itself if two emails would collide). `npm run test:auth --prefix frontend` is the sign in / sign up browser audit.
- UNTESTED: a real reset email from the provider; the migrations on Neon (they passed on a scratch Postgres 16).
## No repeats in autoplay (fix/queue-duplicates)
- Song identity (fingerprint, variant key) in `frontend/src/lib/songIdentity.js` and a copy in `backend/src/services/related/identity.js`: keep the two in sync (both have tests with the same examples).
  Rules and limits in `docs/RADIO.md`. `npm run report:duplicate-songs --prefix backend` is report-only.

## Duplicates v2 (fix/queue-duplicates-v2)
- Fuzzy `isSameSong` + canonical groups (spelling variants, compilation copies): rules and where they are used are in `docs/RADIO.md` (last section). Migration
  `20261124000000_songs_canonical_id` (additive; take the Neon backup BEFORE merging, as always). Report first: `npm run report:duplicate-songs --prefix backend`, then
  `npm run backfill:canonical-ids --prefix backend` (dry run by default, `-- --apply` writes; nothing is ever deleted).
- `songIdentity.js` and `backend/src/services/related/identity.js` are copies: change both. No Tamil script in source files (the English-only test): the transliteration table uses `\u` escapes.
- Queue rows are 72px high (two-line title, one-line artists with the full list in the tooltip and at the top of the "..." menu); `useFlip` uses `ROW_HEIGHT`.
- UNTESTED: the fuzzy rules against the live JioSaavn catalogue (tuned on the three reported pairs and fixtures; review the cluster report before trusting `--apply`), real-phone feel of the new rows.

## Home fresh mixes (feature/home-fresh-mixes, on top of fix/queue-duplicates-v2)
- New mix on every app open and on pull to refresh / the refresh button (`visit` token), last-shown songs sink (`avoid`), Daily Mix 1-3 from plays and likes
  (guests: `artists` from the browser). No migration. Notes: `docs/HOME_FEED.md` (last section). Browser audit: `npm run test:home --prefix frontend` (24 checks).
- UNTESTED: live JioSaavn pools for the mixes, real-phone pull to refresh.

## App (feature/android-app): PWA now, Android APK later
- Direct APK + installable web app only (no Play Store: unlicensed JioSaavn source). Notes, the Lighthouse numbers and the real-phone checklist: `docs/ANDROID_APP.md`.
- The service worker (`frontend/src/sw.js`, rules `lib/swRules.js`) NEVER caches audio, auth or personal endpoints; only the public `/api/music/home|search|albums|artists` GETs. Do not widen that list.
- Icons are generated from the login-page logo: `node scripts/make-icons.mjs` (needs CHROMIUM_PATH if Playwright's browser is missing). `npm run test:pwa --prefix frontend` needs port 5000 free.
- Phase 2 (Capacitor, `frontend/android/`): details, the Render CORS setting (`CORS_ORIGIN` must list `https://localhost,capacitor://localhost`), build commands and the phone checklist are in `docs/ANDROID_APP.md`. The Gradle build can only run in CI or on a computer with the Android SDK; `npm run test:native --prefix frontend` checks our own native code paths in a browser. Confirmed on a real phone (Infinix X6871, Android 16, APK from PR #35): the media notification shows the song (cover, title, artist, previous / play-pause / next). Still UNTESTED on a phone: lock-screen seek bar, headset and Bluetooth buttons, notification after a long screen lock on aggressive battery managers, everything else in `docs/ANDROID_APP.md`.
- Never commit a keystore, `keystore.properties` or `local.properties` (they are git-ignored); the login token lives in `lib/tokenStore.js` (private storage in the app), never read `localStorage` for it directly.
- Never resolve a promise with a Capacitor plugin object (async return or then-chain): the proxy answers .then() as a native method and rejects. Keep plugins in refs; native mocks in scripts/native-mocks mimic this.

## Video songs (feature/video-songs-v2, on top of feature/android-app)
- Admin routes are fail-closed: owner admin role AND `ADMIN_VIDEO_USER_IDS` (env, comma-separated user ids) or 403 for everyone. No media is cached or stored (guard tests in `no-media-storage.test.js` and `noMediaStorage.test.js`). See `docs/VIDEO_SONGS.md` "Safety notes".
- Android media notification: fixed and confirmed on a phone (the cause was resolving a promise with a Capacitor plugin object; see the rule in the App section).
- YouTube embed only: never download, cache, re-host or hide the player; the API key and lookups stay in `backend/src/services/music/videoLookup.js`. Rules, API,
  settings, the migration steps and the phone checklist: `docs/VIDEO_SONGS.md`. No batch auto-match job yet (later phase).
- Migration `20261126000000_song_videos` (additive; songs.video_id / video_available / video_flagged_at + video_reports). Neon dev branch first, backup branch BEFORE merging.
- A video is hidden for everyone only after 2 signed-in people report it (served video only); one failed embed hides it for that person (7 days, browser only).
- UNTESTED: everything on a real phone (rotation/full screen, screen lock, Back from full screen, Bluetooth/headset, Wi-Fi only on mobile data).
