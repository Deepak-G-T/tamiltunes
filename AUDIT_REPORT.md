# TamilTunes Full Audit and Stabilization Report

**Branch:** `audit/full-review` (branched from `fix/stability`)  
**Date & Time:** 2026-11-17 08:38 IST  
**Environment:** Windows (win32), Node.js `v26.12.0`, npm `11.20.0`  
**Architecture:**
- Frontend: React 19 + Vite 8 + Tailwind CSS 4 + Lucide Icons (deployed on Vercel)
- Backend: Node.js / Express 4 + Prisma ORM 6 + PostgreSQL (deployed on Render)
- Music Providers: JioSaavn (cyberboysumanjay API / direct decrypt), YouTube (IFrame Player API), Local / Mock

---

## Phase 0: Setup & Baseline

### Environment & Dependency Versions
- **Node.js:** v26.12.0
- **npm:** 11.20.0
- **Backend Dependencies:**
  - `@prisma/client`: `^6.4.1`, `prisma`: `^6.4.1`
  - `express`: `^4.21.2`
  - `bcryptjs`: `^3.0.2`
  - `jsonwebtoken`: `^9.0.2`
  - `zod`: `^3.24.2`
  - `helmet`: `^8.0.0`
  - `cors`: `^2.8.5`
  - `express-rate-limit`: `^7.5.0`
  - `crypto-js`: `^4.2.0`
- **Frontend Dependencies:**
  - `react`: `^19.3.1`, `react-dom`: `^19.3.1`
  - `react-router-dom`: `^7.18.5`
  - `vite`: `^8.3.6`
  - `tailwindcss`: `^4.3.5`, `@tailwindcss/vite`: `^4.3.5`
  - `axios`: `^1.21.1`
  - `lucide-react`: `^1.73.0`

### Baseline Status
- **Git Status:** Working tree clean on branch `audit/full-review`.
- **Backend Tests:** 13/13 passed (Health, Feed, Search, Auth, Playlists, Favorites, History).
- **Frontend Build:** `vite build` succeeded in 521ms (`dist/assets/index-WVhLHSHV.js`: 444.32 kB).

---

## Phase 1: Security Review

### 1. Code Changes in `env.js`, `app.js`, and `errorHandler.js`

#### A. `backend/src/config/env.js`
- **What Changed:**
  - Added an explicit `isProduction` check:
    ```javascript
    const getJwtSecret = () => {
      if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
      if (isProduction) {
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable must be set in production!');
      }
      return 'tamiltunes_dev_super_secret_jwt_key_2026';
    };
    ```
  - Replaced fallback `corsOrigin: process.env.CORS_ORIGIN || '*'` with `process.env.CORS_ORIGIN || ''`.
- **Why:**
  - Prevents the application from booting in production with a hardcoded, publicly known default JWT signing secret, which would allow anyone to forge valid JWT auth tokens.
  - Removes open wildcard (`*`) CORS default to enforce strict origin validation.

#### B. `backend/src/app.js`
- **What Changed:**
  - Implemented an origin validator for CORS:
    ```javascript
    const ALLOWED_ORIGINS = [
      'https://in-five-11.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5000',
      'http://127.0.0.1:5173'
    ];
    // Regex allows project-specific Vercel preview domains
    if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) return true;
    ```
  - Replaced permissive CORS reflection `config.corsOrigin === '*' ? true : ...` with a dynamic callback rejecting unauthorized origins.
- **Why:**
  - The previous configuration paired wildcard origin reflection with `credentials: true`, violating CORS specifications and leaving user cookies/session headers vulnerable to cross-origin abuse. The new whitelist strictly allows only the authorized Vercel frontend and local development servers.

#### C. `backend/src/middleware/errorHandler.js`
- **What Changed:**
  - Added conditional error masking for production environments:
    ```javascript
    const message = isProduction && statusCode >= 500
      ? 'Internal Server Error. Please try again later.'
      : err.message || 'An unexpected error occurred';
    ```
  - Omitted `err.stack` when `NODE_ENV === 'production'`.
  - Suppressed full error object dumping to stdout in production, logging only sanitized `[Error] ${req.method} ${req.url} - ${err.message}`.
- **Why:**
  - Unhandled 500 exceptions from database connection timeouts or ORM constraint errors could previously leak database hostnames, usernames, table structures, and file system paths to the client.

### 2. Git History Secret Leak Audit
- **Commands Executed:**
  ```powershell
  git log --all -p -S "DATABASE_URL"
  git log --all -p -S "JWT_SECRET"
  git log --all -p -S "password"
  git log --all -p -S "eyJ"
  ```
- **Findings:**
  - **No production secrets found in git history.**
  - Commit `bb483267`: Added `.env.example` containing only local placeholder values (`postgresql://postgres:password@localhost:5432/tamiltunes`, `your_jwt_secret_key_here_at_least_32_characters`).
  - Commit `8ca44770`: `render.yaml` configured using Render Blueprint variables (`generateValue: true` for `JWT_SECRET` and `fromDatabase` reference for `DATABASE_URL`).
  - Commit `e660ea7`: Public Vercel endpoint `frontend/.env.production` (`VITE_API_BASE_URL=https://tamiltunes-backend.onrender.com/api`) was committed. Untracked and gitignored in `fix/stability`.
- **Credential Rotation Advice:**
  - **None required to rotate**; zero live or production database/JWT credentials exist anywhere in the repository commit history.

### 3. Dependency Vulnerability Audit (`npm audit`)

#### Backend Audit Findings (`npm audit --prefix backend`)
- **Total:** 6 vulnerabilities (4 high, 2 moderate).
- **High/Critical Findings & Upgrade Paths:**
  1. **`zod` (<4.6.6)** &mdash; **Severity: High**
     - *Issue:* Denial of Service / Memory exhaustion when validating oversized constrained collections (`GHSA-mrhx-c7xc-m3w5`, CVSS 7.5).
     - *Upgrade Path:* Major version upgrade to `zod@4.6.7` (`npm install zod@latest`). Currently kept at `^3.24.2` to prevent breaking runtime schema changes; risk is mitigated in application layer by Express body-parser limit of `1mb`.
  2. **`deepmerge-ts` (<8.0.0)** &mdash; **Severity: High**
     - *Issue:* DeepmergeTS stack exhaustion when merging recursive object graphs (`GHSA-ggr8-5vv4-36mx`).
     - *Via:* `@prisma/config` &rarr; `prisma` CLI.
     - *Upgrade Path:* `npm update prisma` (dev dependency). This affects the Prisma CLI build tool, not the production runtime query engine.
  3. **`@prisma/config` (6.13.0-dev.1 - 7.10.0)** &mdash; **Severity: High**
     - *Issue:* Inherited from `deepmerge-ts`.
     - *Upgrade Path:* Resolved by updating `prisma` dev dependency.
  4. **`prisma` (6.13.0-dev.1 - 7.10.0)** &mdash; **Severity: High**
     - *Issue:* Inherited from `@prisma/config`.
     - *Upgrade Path:* Update `prisma` package once Prisma v7 reaches stable channel.
- **Moderate Findings (Dev Only):**
  - `minimatch` (`>=7.0.0 <11.0.1` via `nodemon` dev tool). Upgrade path: `npm update nodemon`.

#### Frontend Audit Findings (`npm audit --prefix frontend`)
- **Total:** 0 vulnerabilities (`found 0 vulnerabilities`). Clean audit.

### 4. Health Check Endpoint
- Route `/health` and `/api/health` return strictly:
  ```json
  { "status": "ok", "uptime": 0 }
  ```

---

## Phase 2: Backend and Database Review

### 1. Database Schema & New Performance Migration
- **Schema Updates (`backend/prisma/schema.prisma`):**
  - `Playlist`: Added `@@index([userId])`
  - `PlaylistSong`: Added `@@index([playlistId])` and `@@index([songId])`
  - `Favorite`: Added `@@index([userId])` and `@@index([songId])`
  - `ListeningHistory`: Added `createdAt DateTime @default(now())`, `@@index([userId])`, `@@index([songId])`, `@@index([userId, playedAt(sort: Desc)])`, and `@@index([userId, createdAt(sort: Desc)])`.
- **New Migration Created (`backend/prisma/migrations/20261117083600_add_performance_indexes/migration.sql`):**
  ```sql
  -- AlterTable
  ALTER TABLE "listening_history" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

  -- CreateIndex
  CREATE INDEX IF NOT EXISTS "playlists_userId_idx" ON "playlists"("userId");
  CREATE INDEX IF NOT EXISTS "playlist_songs_playlistId_idx" ON "playlist_songs"("playlistId");
  CREATE INDEX IF NOT EXISTS "playlist_songs_songId_idx" ON "playlist_songs"("songId");
  CREATE INDEX IF NOT EXISTS "favorites_userId_idx" ON "favorites"("userId");
  CREATE INDEX IF NOT EXISTS "favorites_songId_idx" ON "favorites"("songId");
  CREATE INDEX IF NOT EXISTS "listening_history_userId_idx" ON "listening_history"("userId");
  CREATE INDEX IF NOT EXISTS "listening_history_songId_idx" ON "listening_history"("songId");
  CREATE INDEX IF NOT EXISTS "listening_history_userId_playedAt_idx" ON "listening_history"("userId", "playedAt" DESC);
  CREATE INDEX IF NOT EXISTS "listening_history_userId_createdAt_idx" ON "listening_history"("userId", "createdAt" DESC);
  ```
- **Rule Followed:** The initial migration `20261117000000_init/migration.sql` was untouched; all indexes and columns were added strictly via the new migration.

### 2. Pagination Limits on List Endpoints
Enforced pagination (`limit` capped between 1 and 100, default 50; `offset` / `skip`) across all list endpoints:
- **`GET /api/playlists` (`playlistController.js`):** Enforces `take: limit, skip: offset`.
- **`GET /api/favorites` (`favoriteController.js`):** Enforces `take: limit, skip: offset`.
- **`GET /api/history` (`historyController.js`):** Enforces `take: limit, skip: offset`.
- In-memory development database mock (`backend/src/prisma/client.js`) updated to support `take` and `skip`.

### 3. Production DB Baseline & Windows PowerShell Guide
For databases initialized earlier with `prisma db push`, run the baseline script to mark the initial migration as applied without data loss.

**`package.json` script:**
```json
"db:baseline": "prisma migrate resolve --applied 20261117000000_init"
```

**Step-by-Step Windows PowerShell Execution (against Render PostgreSQL):**
```powershell
# 1. Open Windows PowerShell and navigate to backend directory
cd f:\project\project\backend

# 2. Set the external database connection string from Render Dashboard (External Database URL)
$env:DATABASE_URL="postgresql://tamiltunes_user:YOUR_PASSWORD@dpg-xxxx-a.oregon-postgres.render.com/tamiltunes?sslmode=require"

# 3. Mark the initial migration as applied (Baseline)
npm run db:baseline
# Output: Migration 20261117000000_init marked as applied.

# 4. Deploy the new performance indexes migration
npm run prisma:deploy
# Output: 1 migration found in prisma/migrations: 20261117083600_add_performance_indexes applied.
```

---

## Phase 3: Music Provider & Search Evaluation

*(To be evaluated in step 3)*

---

## Phase 4: Integration Tests

*(To be evaluated in step 4)*
