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
- Required env: Render needs DATABASE_URL, JWT_SECRET, NODE_ENV=production, CORS_ORIGIN (explicit origins, never `*`), VERCEL_TEAM_SLUG, MUSIC_PROVIDER. Vercel needs VITE_API_BASE_URL.

## Optional env: video lookup (all off by default)
Songs may carry an optional `videoId`. It comes from the curated map `backend/src/services/music/curatedVideos.js`
(no API needed) and, only if configured, from a cached YouTube Data API lookup.
- `YOUTUBE_API_KEY` (optional): enables API lookups. Without it the API is never called.
- `VIDEO_CHANNEL_ALLOWLIST` (optional, comma-separated YouTube channel IDs): official channels whose videos may be
  returned. Fail-closed: empty means every API result is rejected (and the API is not called at all).
  Results must also be `status.embeddable === true` and public.
- `YOUTUBE_DAILY_BUDGET` (optional, default 5000): quota units per UTC day we allow ourselves. One lookup costs
  101 units (search 100 + videos.list 1); the platform default quota is 10,000 units/day.
- Results (including "no video found") are cached 24h; transient errors 10 min. Home/search never call the API
  inline: they use the curated map and cache, and queue background lookups. Only `GET /api/music/song/:id` awaits one.
- Curated entries are "oEmbed-verified by a previous agent, embeddability unverified"; the player falls back to audio
  with a toast on YouTube errors 101/150.
- Hukum has two conflicting ids (`1F3HM635S0k` in the repo, `1F3hm6MfR1k` supplied by the owner). Only the first is
  served; the second is kept as an unserved `candidate` until the owner confirms it manually.
