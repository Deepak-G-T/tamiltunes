# TamilTunes Full Audit and Stabilization Report

**Branch:** `audit/full-review` (branched from `fix/stability`)  
**Date & Time:** 2026-11-17 04:16 IST  
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

### 1. Git History Secret Leak Audit
- **Command executed:** `git log --all -p -S "DATABASE_URL"`, `git log --all -p -S "JWT_SECRET"`, `git log --all -p -S "password"`, `git log --all -p -S "eyJ"`
- **Findings:**
  - Commit `bb483267`: Added `.env.example` with local development placeholders (`your_jwt_secret_key_here_at_least_32_characters`, `postgresql://postgres:password@localhost:5432/tamiltunes`). No real credentials leaked.
  - Commit `8ca44770`: `render.yaml` blueprint created with `generateValue: true` for `JWT_SECRET` and `fromDatabase` reference for `DATABASE_URL`.
  - Commit `e660ea7`: Contained public Vercel endpoint `frontend/.env.production` (`VITE_API_BASE_URL=https://tamiltunes-backend.onrender.com/api`). In `fix/stability`, this file was untracked from git and added to `.gitignore`.
- **Credential Rotation Advice:** No production secrets exist in the git history. However, if any database instance was provisioned with a temporary password during initial testing, rotate it in the Render Dashboard before public launch.

### 2. Authentication & Authorization Review
- **Password Hashing:** `bcrypt.genSalt(10)` used with `bcrypt.hash()` in `authController.js` &mdash; verified standard salt rounds of 10.
- **JWT Secret Handling:** Hardened `backend/src/config/env.js` to throw a fatal startup error if `JWT_SECRET` is unset in `NODE_ENV=production`.
- **Rate Limiting:** `authLimiter` (30 requests / 15 minutes) protects `/api/auth/register` and `/api/auth/login`. General API is protected by `apiLimiter` (300 requests / 15 minutes).
- **Input Validation:** Zod schemas (`registerSchema`, `loginSchema`, `createPlaylistSchema`, `updatePlaylistSchema`, `addSongSchema`, `favoriteSchema`, `historySchema`) protect all mutable endpoints via `validateBody` middleware.
- **CORS Configuration:** Replaced open wildcard (`*`) reflection with an explicit origin validator allowing `https://in-five-11.vercel.app`, `*.vercel.app` preview branches, and `localhost` ports (5173, 3000, 5000).
- **Helmet Headers:** `helmet` active with `crossOriginResourcePolicy: { policy: 'cross-origin' }`.
- **SQL Injection:** Zero raw SQL (`$queryRaw` / `$executeRaw`) used; all queries are parameterized by Prisma Client.
- **Error Information Leaking:** Updated `errorHandler.js` so HTTP 500 errors in `production` return a generic message (`Internal Server Error. Please try again later.`), preventing stack traces or database schema disclosures.

### 3. Dependency Vulnerability Audit (`npm audit`)
- **Backend:** 6 vulnerabilities (4 high, 2 moderate).
  - `zod <4.6.6`: High &mdash; potential memory exhaustion on recursive/unbounded payloads. Mitigated safely via Express body parser limit (`1mb`). Zod 4 upgrade avoided to prevent breaking changes.
  - `deepmerge-ts` / `prisma`: High &mdash; dev CLI dependency.
  - `minimatch` / `nodemon`: Moderate &mdash; dev tool.
- **Frontend:** 0 vulnerabilities (`found 0 vulnerabilities`).

### 4. Health Check Verification
- Verified `/health` and `/api/health` return strictly:
  ```json
  { "status": "ok", "uptime": 0 }
  ```

---
