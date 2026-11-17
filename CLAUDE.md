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
- Real Postgres tests and `prisma migrate diff` are untested (need TEST_DATABASE_URL on a scratch DB).
- audit/golden_labeled.csv needs hand labels from the owner.
- Mobile full-screen player and YouTube autoplay must be tested on a real phone.
- Stream proxy: keep ENABLE_EXTERNAL_STREAMS off in production.
- Required env: Render needs DATABASE_URL, JWT_SECRET, NODE_ENV=production, CORS_ORIGIN (explicit origins), VERCEL_TEAM_SLUG, MUSIC_PROVIDER. Vercel needs VITE_API_BASE_URL.

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
