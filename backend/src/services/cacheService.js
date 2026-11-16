/**
 * LRU In-memory TTL Cache Service for TamilTunes API
 * Capped at 500 entries with Least Recently Used (LRU) eviction and a 10-minute default TTL.
 */
class LruCacheService {
  constructor(maxEntries = 500, defaultTtlSeconds = 600) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlSeconds * 1000; // 10 minutes
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // LRU refresh: delete and re-insert to move key to most recently used position
    this.cache.delete(key);
    this.cache.set(key, item);

    this.hits++;
    return item.data;
  }

  set(key, data, ttlSeconds = null) {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs;

    // If key already exists, delete it so re-insertion refreshes order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict least recently used (first key in map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      savedAt: Date.now()
    });
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    // Purge expired keys
    const now = Date.now();
    for (const [key, val] of this.cache.entries()) {
      if (now > val.expiresAt) {
        this.cache.delete(key);
      }
    }

    return {
      keys: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      ttlMinutes: Math.round(this.defaultTtlMs / 60000)
    };
  }
}

export const musicCache = new LruCacheService(500, 600);
