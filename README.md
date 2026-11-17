# 🎵 TamilTunes – Professional Tamil Music Streaming Web Application

TamilTunes is a Spotify-inspired, production-grade Tamil music streaming web application built with a modern React 18+ frontend and a secure Express/PostgreSQL/Prisma backend. Users can discover, search, organize, and listen to authentic Tamil music across eras (90s golden hits, 2000s Kollywood nostalgia, contemporary chartbusters, soulful melodies, and folk beats) with **zero advertisement interruptions**.

---

## 🌟 Key Features

- **Spotify-Inspired Premium Dark Theme**: Handcrafted with `#09090B` deep background, `#111114` sidebar, `#18181B` cards, and vibrant violet accent (`#8B5CF6`).
- **Shared Audio Player Singleton**: Global audio engine that keeps playback uninterrupted while navigating between pages.
- **Full Player Controls**:
  - Play / Pause / Seek / Buffering states
  - Previous / Next Track
  - Volume control with mute toggle
  - Shuffle & Repeat (off, all, one)
  - Play Queue Drawer with live reordering & removal
  - Immersive Full-Screen Now Playing interface (desktop & mobile)
  - Mobile Mini-Player & Bottom Navigation
- **Rich Tamil Music Discovery**:
  - 🔥 Trending Tamil Tracks
  - 📀 Popular Tamil Albums (*Leo, Jailer, Master, Ponniyin Selvan, Roja*)
  - 🌟 Iconic Composers & Singers (*A.R. Rahman, Ilaiyaraaja, Anirudh, Yuvan Shankar Raja, Harris Jayaraj, Sid Sriram*)
  - 📻 90s Golden Era Classics
  - 🎧 2000s Kollywood Nostalgia
  - 💖 Soulful Melodies & Romantic Hits
  - 🥁 Tamil Folk & Kuthu Beats
- **Instant Debounced Search**: Search by song name, movie/album, composer, or singer with live query filtering and search history.
- **User Account & Security**:
  - Secure signup & login with bcrypt password hashing
  - JWT session tokens
  - Zod input validation
  - Rate limiting with `express-rate-limit`
  - Helmet security headers and CORS protection
- **Personalized Library**:
  - Create, rename, delete custom playlists
  - Add & remove songs from playlists
  - Heart/favourite tracks
  - Automated listening history tracking (records after 5s of playback)
- **Ethical Music Provider Architecture**:
  - Clear separation between metadata availability and streaming authorization.
  - Multi-provider adapter pattern: Live JioSaavn community metadata + authorized sample audio streams.
  - Never bypasses DRM, advertisements, or third-party provider terms.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 18+ with Vite
- **Styling**: Tailwind CSS v4 & custom CSS range controls
- **Routing**: React Router DOM (v7)
- **Icons**: Lucide React
- **Animations**: Framer Motion & CSS transitions
- **HTTP Client**: Axios with JWT request interceptors

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Authentication**: JSON Web Tokens (JWT) & bcryptjs
- **Validation**: Zod schema validation
- **Security**: Helmet, CORS, Express Rate Limit

---

## 📁 Project Architecture

```
tamiltunes/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── env.js                 # Centralized environment configuration
│   │   ├── controllers/
│   │   │   ├── authController.js      # Register, login, profile
│   │   │   ├── musicController.js     # Home feed, search, album, artist
│   │   │   ├── playlistController.js  # Playlist CRUD & track management
│   │   │   ├── favoriteController.js  # Favorites management
│   │   │   └── historyController.js   # Listening history tracking
│   │   ├── middleware/
│   │   │   ├── auth.js                # JWT token verification
│   │   │   ├── validate.js            # Zod validation middleware
│   │   │   ├── rateLimiter.js         # API & Auth rate limiting
│   │   │   └── errorHandler.js        # Centralized error handler
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # PostgreSQL models & relations
│   │   │   └── client.js              # Database client with dev store fallback
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── musicRoutes.js
│   │   │   ├── playlistRoutes.js
│   │   │   ├── favoriteRoutes.js
│   │   │   └── historyRoutes.js
│   │   ├── services/
│   │   │   └── music/
│   │   │       ├── musicProvider.js       # Abstract base provider
│   │   │       ├── jiosaavnProvider.js    # Live metadata provider
│   │   │       ├── localAudioProvider.js  # Authorized audio streams
│   │   │       └── providerManager.js     # Multi-provider manager
│   │   ├── app.js                     # Express app setup
│   │   └── index.js                   # Server entry point
│   ├── test/
│   │   └── api.test.js                # Integration test suite (100% pass)
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── cards/                 # SongCard, AlbumCard, ArtistCard
│   │   │   ├── layout/                # Sidebar, TopNav, MobileNav, MainLayout
│   │   │   ├── modals/                # CreatePlaylistModal, AddToPlaylistModal
│   │   │   └── player/                # MusicPlayer, MiniPlayer, FullScreenPlayer, QueueDrawer
│   │   ├── context/
│   │   │   ├── AudioContext.jsx       # Global HTML5 Audio singleton
│   │   │   └── AuthContext.jsx        # User state & authentication
│   │   ├── pages/
│   │   │   ├── Home.jsx               # Curated categories & hero banner
│   │   │   ├── Explore.jsx            # Genre & composer discovery
│   │   │   ├── Search.jsx             # Debounced search & history
│   │   │   ├── AlbumDetail.jsx        # Album view with tracklist
│   │   │   ├── ArtistDetail.jsx       # Artist view with discography
│   │   │   ├── PlaylistDetail.jsx     # User playlist management
│   │   │   ├── Favorites.jsx          # Saved songs collection
│   │   │   ├── History.jsx            # Listening history
│   │   │   ├── Login.jsx & Signup.jsx # Auth pages
│   │   │   └── Profile.jsx            # User profile & stats
│   │   ├── services/
│   │   │   └── api.js                 # Axios instance with interceptors
│   │   ├── App.jsx & main.jsx
│   │   └── index.css                  # Spotify dark styling
│   ├── vite.config.js
│   ├── .env.example
│   └── package.json
│
└── README.md
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18 or higher (tested on Node.js v26)
- **NPM**: v9 or higher
- **PostgreSQL**: Optional for local testing (an automated in-memory development store activates if PostgreSQL is not active; required for production).

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
```

Configure your `.env`:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters
JWT_EXPIRES_IN=7d
DATABASE_URL=postgresql://postgres:password@localhost:5432/tamiltunes?schema=public
JIOSAAVN_API_URL=https://www.jiosaavn.com/api.php
CORS_ORIGIN=   # extra allowed origins, comma-separated ("*" is NOT a wildcard here)

# Optional: video lookup (see CLAUDE.md). Everything below is off unless set.
# YOUTUBE_API_KEY=
# VIDEO_CHANNEL_ALLOWLIST=UCxxxxxxxx,UCyyyyyyyy   # official channel IDs, fail-closed when empty
# YOUTUBE_DAILY_BUDGET=5000                        # quota units/day (a lookup costs 101)
```

Generate Prisma Client:
```bash
npm run prisma:generate
```

Run Backend Tests:
```bash
npm test
```

Start the Backend Server:
```bash
npm run dev
# Running on http://localhost:5000
```

### 3. Frontend Setup
In a new terminal:
```bash
cd frontend
npm install
npm run dev
# Running on http://localhost:3000
```

Open `http://localhost:3000` in your web browser.

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new user | No |
| `POST` | `/api/auth/login` | Sign in with credentials | No |
| `GET` | `/api/auth/me` | Get current user profile | Yes (Bearer) |

### Music
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/music/home` | Curated Tamil sections | No |
| `GET` | `/api/music/search?query=...` | Search songs, albums, artists | No |
| `GET` | `/api/music/song/:id` | Single song, with optional `videoId` (`?fresh=1` bypasses the cache; rate-limited to 30/min) | No |
| `GET` | `/api/music/albums/:id` | Get album and tracklist | No |
| `GET` | `/api/music/artists/:id` | Get artist details and top songs | No |
| `GET` | `/api/music/health` | Music provider health check | No |

### Playlists
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/playlists` | List user playlists | Yes (Bearer) |
| `POST` | `/api/playlists` | Create new playlist | Yes (Bearer) |
| `GET` | `/api/playlists/:id` | Get playlist details & songs | Optional |
| `PUT` | `/api/playlists/:id` | Rename / update playlist | Yes (Owner) |
| `DELETE` | `/api/playlists/:id` | Delete playlist | Yes (Owner) |
| `POST` | `/api/playlists/:id/songs` | Add song to playlist | Yes (Owner) |
| `DELETE` | `/api/playlists/:id/songs/:songId`| Remove song from playlist | Yes (Owner) |

### Favourites
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/favorites` | List favorite songs | Yes (Bearer) |
| `POST` | `/api/favorites` | Add song to favorites | Yes (Bearer) |
| `DELETE` | `/api/favorites/:songId` | Remove from favorites | Yes (Bearer) |

### History
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/history` | List listening history | Yes (Bearer) |
| `POST` | `/api/history` | Record played track | Yes (Bearer) |
| `DELETE` | `/api/history` | Clear listening history | Yes (Bearer) |

---

## 🚢 Production Deployment

### 1. Database (PostgreSQL) & Migrations
Use any managed PostgreSQL provider (e.g., [Render PostgreSQL](https://render.com), [Neon](https://neon.tech), or [Supabase](https://supabase.com)):
1. Create a PostgreSQL database instance (e.g. `tamiltunes-db`).
2. Copy the connection string (`postgresql://user:password@host/database?sslmode=require`).
3. **For new databases**: Run migrations:
   ```bash
   npm run prisma:deploy --prefix backend
   # or: npx prisma migrate deploy
   ```
4. **For existing databases previously created with `db push` (Baseline)**:
   Run the one-time baseline step to record the initial migration as applied without data loss.

   **Windows PowerShell steps (against Render external database URL):**
   ```powershell
   # 1. Navigate to backend directory
   cd f:\project\project\backend

   # 2. Set the external database connection string from Render Dashboard (External Database URL)
   $env:DATABASE_URL="postgresql://tamiltunes_user:YOUR_PASSWORD@dpg-xxxx-a.oregon-postgres.render.com/tamiltunes?sslmode=require"

   # 3. Mark the initial migration as applied
   npm run db:baseline
   # Under the hood: npx prisma migrate resolve --applied 20261117000000_init

   # 4. Deploy any subsequent migrations (e.g. indexes)
   npm run prisma:deploy
   # Under the hood: npx prisma migrate deploy
   ```
5. **Optional Catalog Seeding**:
   Seeding is completely idempotent (`upsert`) and executed on-demand:
   ```bash
   npm run seed --prefix backend
   ```

### 2. Backend (Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Deepak-G-T/tamiltunes)

#### Option A: One-Click Blueprint (Recommended)
1. Open **[Render Blueprints](https://dashboard.render.com/blueprints/new)**.
2. Connect your GitHub repository: `Deepak-G-T/tamiltunes`.
3. Render automatically discovers `render.yaml` and provisions:
   - `tamiltunes-backend` (Node.js Web Service)
   - `tamiltunes-db` (Free PostgreSQL Database)
4. Migrations are executed at startup: `npx prisma migrate deploy && npm start`. If a migration fails, the deployment halts visibly.
5. Click **Apply** to deploy.

#### Option B: Manual Web Service Setup
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Select your repository `Deepak-G-T/tamiltunes`.
3. Configure settings:
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Region**: `Singapore` or `Ohio`
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npx prisma migrate deploy && npm start`
   - **Plan**: `Free`
4. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `JWT_SECRET`: *(auto-generated or random 32 characters)*
   - `CORS_ORIGIN`: *(your exact Vercel origin; `*` is not treated as a wildcard)*
   - `DATABASE_URL`: *(PostgreSQL connection string)*
   - `MUSIC_PROVIDER`: `jiosaavn` *(or `youtube` for YouTube IFrame engine, `local`)*

### 3. Frontend (Vercel)
1. Link repository to Vercel.
2. **Root Directory**: `frontend`
3. **Framework Preset**: `Vite`
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. **Environment Variables**:
   - `VITE_API_BASE_URL=https://your-backend-domain.onrender.com/api`

---

## 🎬 Optional: Video mode

Songs can carry an optional `videoId`. When present (and the song also has an audio stream), the player shows an
**Audio / Video** toggle. Video plays through the YouTube IFrame player, kept visible at 200×200 or larger; switching
keeps the position and waits for a tap to play. If YouTube refuses to embed (errors 101/150) the player falls back to
audio with a toast.

`videoId` comes from a curated map (`backend/src/services/music/curatedVideos.js`) and, **only if you opt in**, from a
cached YouTube Data API lookup limited to an allow-list of official channels. `YOUTUBE_API_KEY`,
`VIDEO_CHANNEL_ALLOWLIST` and `YOUTUBE_DAILY_BUDGET` are all optional; without a key the API is never called. See
`CLAUDE.md` for details.

## ⚖️ Legal & Compliance Notice

TamilTunes strictly complies with all content rights:
- Does not strip, modify, or insert commercial advertisements.
- Distinguishes metadata discovery from streaming permissions.
- Employs an adapter architecture that defaults to authorized, royalty-free audio streams and promotional preview tracks.
- Third-party trademarks and album artworks belong to their respective copyright holders.
