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
- `prisma migrate diff` is untested. The backend suite has run against real PostgreSQL (Neon Postgres 18 branch):
  set `TEST_DATABASE_URL` to a SCRATCH database or Neon branch, run `npm run build --prefix backend`
  (prisma generate) first, then `npm test --prefix backend`. Never point it at production.
- audit/golden_labeled.csv needs hand labels from the owner.
- Mobile full-screen player and YouTube autoplay must be tested on a real phone.
- Stream proxy: keep ENABLE_EXTERNAL_STREAMS off in production.
- Required env: Render needs DATABASE_URL, JWT_SECRET, NODE_ENV=production, CORS_ORIGIN (explicit origins), VERCEL_TEAM_SLUG, MUSIC_PROVIDER. Vercel needs VITE_API_BASE_URL.
- Database: production runs on Neon (Singapore, Postgres 18). `DATABASE_URL` is a Render dashboard value
  (`sync: false` in render.yaml), set to the Neon DIRECT string with `?sslmode=require&connect_timeout=15&connection_limit=5`.
  Setting it through the Render API does NOT redeploy: trigger a deploy afterwards. The backend retries the first
  connection (Neon scales to zero). The old Render Postgres is a legacy rollback copy (free plan, deleted 2026-12-17):
  remove it and the `databases:` block in render.yaml once Neon has been stable for a week.

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
- UNTESTED: `reco.getreco` against live JioSaavn, the Prisma signals queries on real Postgres (run the suite with TEST_DATABASE_URL).

## Speed Dial (feature/speed-dial, stacked on feature/player-radio)
- Home shows the user's most-played songs: ranking, pins, hide, reorder and tuning guide in `docs/SPEED_DIAL.md`; knobs in
  `backend/src/services/speedDial/config.js`. A play counts after 30 s or 50% of the song (server re-checks it).
- Migration `20261120000000_speed_dial` (play_events columns + `speed_dial_overrides`). Needs the radio migration first.
- UNTESTED: the ranking SQL on real Postgres (run the backend suite with TEST_DATABASE_URL: the same tests compare it with the
  JavaScript reference), the 30 s counting with real audio on a phone, long-press on real devices.

## Player queue (feature/player-queue, stacked on feature/speed-dial)
- Engine `frontend/src/lib/radioQueue.js` (tests in `radioQueue.test.js`), notes in `docs/PLAYER_QUEUE.md`. Search returns `playlists` (public only).
- UNTESTED: drawer drag/swipe on real devices, playlist search on real Postgres.

## Play queue v2 (feature/queue-v2, on master)
- Notes, API table and shortcuts: `docs/QUEUE_V2.md`. Migration `20261121000000_queue_state` (additive; run with the UNPOOLED url). Library: `@dnd-kit`.
- Only song ids are saved (`PUT /api/me/queue`); metadata is re-fetched on restore. `POST /api/music/songs/resolve` is public (guests), rate limited.
- `npm run test:queue --prefix frontend` runs the queue Playwright audit (also part of `npm run test:ui`).
- UNTESTED: real-phone drag/swipe, a second real device for "Continue on this device?", Neon (only a scratch local Postgres 16 was used).
