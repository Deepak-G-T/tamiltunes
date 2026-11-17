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
  }

  user = {
    findUnique: async ({ where }) => {
      for (const u of this.users.values()) {
        if (where.id && u.id === where.id) return { ...u };
        if (where.email && u.email === where.email.toLowerCase()) return { ...u };
      }
      return null;
    },
    create: async ({ data }) => {
      const user = {
        id: 'usr_' + Math.random().toString(36).substring(2, 11),
        ...data,
        email: data.email.toLowerCase(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.users.set(user.id, user);
      return { ...user };
    }
  };

  song = {
    findUnique: async ({ where }) => {
      const s = this.songs.get(where.id);
      return s ? { ...s } : null;
    },
    upsert: async ({ where, create, update }) => {
      const existing = this.songs.get(where.id);
      if (existing) {
        const updated = { ...existing, ...update };
        this.songs.set(where.id, updated);
        return { ...updated };
      }
      const newSong = { id: where.id, ...create, createdAt: new Date() };
      this.songs.set(where.id, newSong);
      return { ...newSong };
    }
  };

  playlist = {
    findMany: async ({ where, include, orderBy, take, skip }) => {
      let list = Array.from(this.playlists.values()).filter((p) => p.userId === where.userId);
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
    findMany: async ({ where, include, orderBy, take, skip }) => {
      let list = Array.from(this.favorites.values()).filter((f) => f.userId === where.userId);
      const start = skip || 0;
      const end = take !== undefined ? start + take : undefined;
      list = list.slice(start, end);
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
  if (prismaInstance) {
    try {
      await prismaInstance.$connect();
      // Verify database connectivity
      await prismaInstance.user.count();
      isPostgresAvailable = true;
      console.log('Connected to PostgreSQL via Prisma (tables verified)');
      return prismaInstance;
    } catch (err) {
      console.warn('PostgreSQL connection check failed, using local development store:', err.message);
      isPostgresAvailable = false;
      return fallbackDb;
    }
  }
  return fallbackDb;
};

// Export db proxy that forwards to prisma if PostgreSQL is up or fallbackDb otherwise
export const db = new Proxy({}, {
  get(target, prop) {
    if (isPostgresAvailable && prismaInstance) {
      return prismaInstance[prop];
    }
    return fallbackDb[prop];
  }
});
