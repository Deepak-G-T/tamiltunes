import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';

let prismaInstance;
let isPostgresAvailable = false;

try {
  prismaInstance = new PrismaClient({
    log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error']
  });
} catch (e) {
  console.warn('Prisma initialization fallback:', e.message);
}

// In-memory persistent data store fallback for local dev when PostgreSQL daemon is not active
class InMemoryDb {
  constructor() {
    this.users = new Map();
    this.songs = new Map();
    this.albums = new Map();
    this.artists = new Map();
    this.playlists = new Map();
    this.playlistSongs = new Map();
    this.favorites = new Map();
    this._historyItems = [];
    this._auditLogs = [];
    this._appSettings = new Map([
      ['require_login', { enabled: true }],
      ['maintenance_banner', { active: false, message: '' }],
      ['announcement_text', { active: false, message: '' }],
      ['home_featured_songs', { songIds: [] }],
      ['home_category_chips', { chips: ['All', 'Romance', 'Mass', 'Melody', '90s Hits', 'Anirudh', 'AR Rahman', 'Yuvan', 'Harris'] }]
    ]);
    this._comments = new Map();
    this._reports = new Map();
    this._playEvents = [];
  }

  user = {
    findUnique: async ({ where }) => {
      for (const u of this.users.values()) {
        if (where.id && u.id === where.id) return { ...u };
        if (where.email && u.email === where.email.toLowerCase()) return { ...u };
        if (where.username && u.username === where.username) return { ...u };
        if (where.googleSub && u.googleSub === where.googleSub) return { ...u };
      }
      return null;
    },
    findMany: async ({ where, orderBy, take, skip, select } = {}) => {
      let list = Array.from(this.users.values());
      if (where) {
        if (where.role) list = list.filter((u) => u.role === where.role);
        if (where.isActive !== undefined) list = list.filter((u) => Boolean(u.isActive) === Boolean(where.isActive));
        if (where.lastSeenAt?.gte) list = list.filter((u) => u.lastSeenAt && new Date(u.lastSeenAt) >= new Date(where.lastSeenAt.gte));
        if (where.OR && Array.isArray(where.OR)) {
          list = list.filter((u) => where.OR.some((cond) => {
            if (cond.email?.contains) return (u.email || '').toLowerCase().includes(cond.email.contains.toLowerCase());
            if (cond.name?.contains) return (u.name || '').toLowerCase().includes(cond.name.contains.toLowerCase());
            return false;
          }));
        }
      }
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      return list.slice(start, end).map((u) => ({ ...u }));
    },
    count: async ({ where } = {}) => {
      let list = Array.from(this.users.values());
      if (where) {
        if (where.role) list = list.filter((u) => u.role === where.role);
        if (where.isActive !== undefined) list = list.filter((u) => Boolean(u.isActive) === Boolean(where.isActive));
        if (where.createdAt?.gte) list = list.filter((u) => new Date(u.createdAt) >= new Date(where.createdAt.gte));
        if (where.lastSeenAt?.gte) list = list.filter((u) => u.lastSeenAt && new Date(u.lastSeenAt) >= new Date(where.lastSeenAt.gte));
      }
      return list.length;
    },
    update: async ({ where, data }) => {
      const u = this.users.get(where.id);
      if (!u) throw new Error('User not found');
      const updated = { ...u, ...data, updatedAt: new Date() };
      this.users.set(where.id, updated);
      return { ...updated };
    },
    create: async ({ data }) => {
      const user = {
        id: 'usr_' + Math.random().toString(36).substring(2, 11),
        role: 'user',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
        ...data,
        email: data.email.toLowerCase(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.users.set(user.id, user);
      return { ...user };
    },
    delete: async ({ where }) => {
      const u = this.users.get(where.id);
      this.users.delete(where.id);
      return u;
    }
  };

  song = {
    findUnique: async ({ where }) => {
      const s = this.songs.get(where.id);
      return s ? { ...s } : null;
    },
    findMany: async ({ where, orderBy, take, skip } = {}) => {
      let list = Array.from(this.songs.values());
      if (where) {
        if (where.isHidden !== undefined) list = list.filter((s) => Boolean(s.isHidden) === Boolean(where.isHidden));
        if (where.deletedAt === null) list = list.filter((s) => !s.deletedAt);
        if (where.canonicalGroupId) list = list.filter((s) => s.canonicalGroupId === where.canonicalGroupId);
        if (where.OR && Array.isArray(where.OR)) {
          list = list.filter((s) => where.OR.some((cond) => {
            if (cond.title?.contains) return (s.title || '').toLowerCase().includes(cond.title.contains.toLowerCase());
            if (cond.artist?.contains) return (s.artist || '').toLowerCase().includes(cond.artist.contains.toLowerCase());
            if (cond.movie?.contains) return (s.movie || '').toLowerCase().includes(cond.movie.contains.toLowerCase());
            return false;
          }));
        }
      }
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      return list.slice(start, end).map((s) => ({ ...s }));
    },
    count: async ({ where } = {}) => {
      let list = Array.from(this.songs.values());
      if (where) {
        if (where.isHidden !== undefined) list = list.filter((s) => Boolean(s.isHidden) === Boolean(where.isHidden));
        if (where.deletedAt === null) list = list.filter((s) => !s.deletedAt);
      }
      return list.length;
    },
    update: async ({ where, data }) => {
      const s = this.songs.get(where.id);
      if (!s) throw new Error('Song not found');
      const updated = { ...s, ...data };
      this.songs.set(where.id, updated);
      return { ...updated };
    },
    upsert: async ({ where, create, update }) => {
      const existing = this.songs.get(where.id);
      if (existing) {
        const updated = { ...existing, ...update };
        this.songs.set(where.id, updated);
        return { ...updated };
      }
      const newSong = { id: where.id, isHidden: false, deletedAt: null, ...create, createdAt: new Date() };
      this.songs.set(where.id, newSong);
      return { ...newSong };
    }
  };

  auditLog = {
    create: async ({ data }) => {
      const log = {
        id: 'aud_' + Math.random().toString(36).substring(2, 11),
        ...data,
        createdAt: new Date()
      };
      this._auditLogs.unshift(log);
      return { ...log };
    },
    findMany: async ({ where, orderBy, take, skip } = {}) => {
      let list = this._auditLogs.slice();
      if (where) {
        if (where.action) list = list.filter((l) => l.action === where.action);
        if (where.actorId) list = list.filter((l) => l.actorId === where.actorId);
      }
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      return list.slice(start, end).map((l) => ({ ...l }));
    },
    count: async ({ where } = {}) => {
      let list = this._auditLogs;
      if (where) {
        if (where.action) list = list.filter((l) => l.action === where.action);
        if (where.actorId) list = list.filter((l) => l.actorId === where.actorId);
      }
      return list.length;
    }
  };

  appSetting = {
    findUnique: async ({ where }) => {
      const val = this._appSettings.get(where.key);
      if (!val) return null;
      return { key: where.key, value: val, updatedAt: new Date() };
    },
    findMany: async () => {
      return Array.from(this._appSettings.entries()).map(([key, value]) => ({
        key,
        value,
        updatedAt: new Date()
      }));
    },
    upsert: async ({ where, create, update }) => {
      const val = update?.value !== undefined ? update.value : create?.value;
      this._appSettings.set(where.key, val);
      return { key: where.key, value: val, updatedAt: new Date() };
    }
  };

  comment = {
    findMany: async ({ where, include, orderBy, take, skip } = {}) => {
      let list = Array.from(this._comments.values());
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      return list.slice(start, end).map((c) => ({
        ...c,
        user: this.users.get(c.userId) || { name: 'User' }
      }));
    },
    findUnique: async ({ where }) => {
      const c = this._comments.get(where.id);
      return c ? { ...c } : null;
    },
    count: async () => this._comments.size,
    update: async ({ where, data }) => {
      const c = this._comments.get(where.id);
      if (!c) throw new Error('Comment not found');
      const updated = { ...c, ...data };
      this._comments.set(where.id, updated);
      return { ...updated };
    },
    delete: async ({ where }) => {
      const c = this._comments.get(where.id);
      this._comments.delete(where.id);
      return c;
    }
  };

  report = {
    findMany: async ({ where, include, take, skip } = {}) => {
      const list = Array.from(this._reports.values());
      return list.map((r) => ({
        ...r,
        comment: this._comments.get(r.commentId),
        reporter: this.users.get(r.reporterId)
      }));
    },
    count: async () => this._reports.size
  };

  playEvent = {
    count: async () => this._playEvents.length,
    findMany: async ({ take } = {}) => this._playEvents.slice(0, take)
  };

  playlist = {
    count: async ({ where } = {}) => {
      if (!where || !where.userId) return this.playlists.size;
      return Array.from(this.playlists.values()).filter(
        (p) => p.userId === where.userId && (where.isPublic === undefined || Boolean(p.isPublic) === where.isPublic)
      ).length;
    },
    findMany: async ({ where, include, orderBy, take, skip }) => {
      let list = Array.from(this.playlists.values()).filter(
        (p) => p.userId === where.userId && (where.isPublic === undefined || Boolean(p.isPublic) === where.isPublic)
      );
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      list = list.slice(start, end);
      if (include?.songs) {
        list = list.map((p) => {
          const songs = Array.from(this.playlistSongs.values())
            .filter((ps) => ps.playlistId === p.id)
            .map((ps) => ({
              ...ps,
              song: this.songs.get(ps.songId) || { id: ps.songId, title: 'Unknown' }
            }));
          return { ...p, songs };
        });
      }
      return list;
    },
    findUnique: async ({ where, include }) => {
      const p = this.playlists.get(where.id);
      if (!p) return null;
      if (include?.songs) {
        const songs = Array.from(this.playlistSongs.values())
          .filter((ps) => ps.playlistId === p.id)
          .map((ps) => ({
            ...ps,
            song: this.songs.get(ps.songId) || { id: ps.songId, title: 'Unknown' }
          }));
        return { ...p, songs, user: this.users.get(p.userId) };
      }
      return { ...p };
    },
    create: async ({ data }) => {
      const playlist = {
        id: 'pl_' + Math.random().toString(36).substring(2, 11),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.playlists.set(playlist.id, playlist);
      return { ...playlist };
    },
    update: async ({ where, data }) => {
      const p = this.playlists.get(where.id);
      if (!p) throw new Error('Playlist not found');
      const updated = { ...p, ...data, updatedAt: new Date() };
      this.playlists.set(where.id, updated);
      return { ...updated };
    },
    delete: async ({ where }) => {
      const p = this.playlists.get(where.id);
      this.playlists.delete(where.id);
      for (const [id, ps] of this.playlistSongs.entries()) {
        if (ps.playlistId === where.id) this.playlistSongs.delete(id);
      }
      return p;
    }
  };

  playlistSong = {
    create: async ({ data }) => {
      const key = `${data.playlistId}_${data.songId}`;
      const ps = {
        id: 'ps_' + Math.random().toString(36).substring(2, 11),
        ...data,
        addedAt: new Date()
      };
      this.playlistSongs.set(key, ps);
      return { ...ps };
    },
    delete: async ({ where }) => {
      const key = `${where.playlistId_songId.playlistId}_${where.playlistId_songId.songId}`;
      const ps = this.playlistSongs.get(key);
      this.playlistSongs.delete(key);
      return ps;
    }
  };

  favorite = {
    count: async ({ where } = {}) => {
      if (!where || !where.userId) return this.favorites.size;
      return Array.from(this.favorites.values()).filter((f) => f.userId === where.userId).length;
    },
    findMany: async ({ where, include, select, orderBy, take, skip }) => {
      let list = Array.from(this.favorites.values()).filter((f) => f.userId === where.userId);
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      list = list.slice(start, end);
      if (select?.songId) {
        return list.map((f) => ({ songId: f.songId }));
      }
      return list.map((f) => ({
        ...f,
        song: this.songs.get(f.songId) || { id: f.songId, title: 'Tamil Song' }
      }));
    },
    findUnique: async ({ where }) => {
      const key = `${where.userId_songId.userId}_${where.userId_songId.songId}`;
      return this.favorites.get(key) || null;
    },
    create: async ({ data }) => {
      const key = `${data.userId}_${data.songId}`;
      const fav = {
        id: 'fav_' + Math.random().toString(36).substring(2, 11),
        ...data,
        createdAt: new Date()
      };
      this.favorites.set(key, fav);
      return { ...fav };
    },
    delete: async ({ where }) => {
      const key = `${where.userId_songId.userId}_${where.userId_songId.songId}`;
      const fav = this.favorites.get(key);
      this.favorites.delete(key);
      return fav;
    }
  };

  listeningHistory = {
    count: async ({ where } = {}) => {
      if (!where || !where.userId) return this._historyItems.length;
      return this._historyItems.filter((h) => h.userId === where.userId).length;
    },
    findMany: async ({ where, include, orderBy, take, skip }) => {
      let list = this._historyItems
        .filter((h) => h.userId === where.userId)
        .slice()
        .reverse();
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      list = list.slice(start, end);
      return list.map((h) => ({
        ...h,
        song: this.songs.get(h.songId) || { id: h.songId, title: 'Tamil Song' }
      }));
    },
    create: async ({ data }) => {
      const item = {
        id: 'hist_' + Math.random().toString(36).substring(2, 11),
        ...data,
        playedAt: new Date()
      };
      this._historyItems.push(item);
      return { ...item };
    },
    deleteMany: async ({ where }) => {
      this._historyItems = this._historyItems.filter((h) => h.userId !== where.userId);
      return { count: 1 };
    }
  };
}

const fallbackDb = new InMemoryDb();

// Verify PostgreSQL connection on boot (migrations are managed externally via render/cli)
export const initDb = async () => {
  const isProduction = (config.nodeEnv === 'production' || process.env.NODE_ENV === 'production');

  if (prismaInstance) {
    try {
      // Neon scales to zero: the first connection after idle can take several seconds or fail once.
      // Retry with backoff in production; fail fast in dev so the in-memory fallback kicks in.
      const attempts = isProduction ? 5 : 1;
      for (let i = 1; ; i++) {
        try {
          await prismaInstance.$connect();
          // Verify database connectivity
          await prismaInstance.user.count();
          break;
        } catch (e) {
          if (i >= attempts) throw e;
          const wait = Math.min(1000 * 2 ** (i - 1), 8000);
          console.warn(`Database not ready (attempt ${i}/${attempts}): ${e.message.split('\n').pop()}. Retrying in ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      isPostgresAvailable = true;
      console.log('Connected to PostgreSQL via Prisma (tables verified)');
      return prismaInstance;
    } catch (err) {
      if (isProduction) {
        console.error('\n================================================================================');
        console.error('FATAL PRODUCTION DATABASE ERROR: Unable to connect to PostgreSQL via Prisma in production environment!');
        console.error(`Reason: ${err.message}`);
        console.error('In-memory database fallback is strictly disabled in production.');
        console.error('================================================================================\n');
        process.exit(1);
      }
      console.warn('\n================================================================================');
      console.warn('⚠️  WARNING: PostgreSQL connection check failed! (NODE_ENV != production)');
      console.warn(`Reason: ${err.message}`);
      console.warn('Falling back to IN-MEMORY LOCAL DATA STORE for development purposes only.');
      console.warn('Data will NOT be persisted across server restarts!');
      console.warn('================================================================================\n');
      isPostgresAvailable = false;
      return fallbackDb;
    }
  }

  if (isProduction) {
    console.error('FATAL PRODUCTION DATABASE ERROR: PrismaClient instance failed to initialize in production environment!');
    process.exit(1);
  }

  console.warn('\n================================================================================');
  console.warn('⚠️  WARNING: No PrismaClient instance available. Using local in-memory store.');
  console.warn('================================================================================\n');
  return fallbackDb;
};

// Export db proxy that forwards to prisma if PostgreSQL is up or fallbackDb otherwise
export const db = new Proxy({}, {
  get(target, prop) {
    if (isPostgresAvailable && prismaInstance) {
      return prismaInstance[prop];
    }
    const isProduction = (config.nodeEnv === 'production' || process.env.NODE_ENV === 'production');
    if (isProduction) {
      throw new Error(`Production database access failure: PostgreSQL unavailable and fallback disabled for "${String(prop)}"`);
    }
    return fallbackDb[prop];
  }
});

export const closeDb = async () => {
  if (prismaInstance && isPostgresAvailable) await prismaInstance.$disconnect();
};

/** True when queries go to real PostgreSQL (false = dev in-memory store). */
export const usingPostgres = () => Boolean(isPostgresAvailable && prismaInstance);
export const getPrismaClient = () => prismaInstance;
