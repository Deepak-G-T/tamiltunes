/**
 * In-memory TTL Cache Service for TamilTunes API
 * Caches home feed, search results, and song details with a 10-minute default TTL
 * to avoid hammering upstream APIs and maximize response speed.
 */
class CacheService {
  constructor(defaultTtlSeconds = 600) {
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

    this.hits++;
    return item.data;
  }

  set(key, data, ttlSeconds = null) {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtlMs;
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
    // Purge expired keys before reporting stats
    const now = Date.now();
    for (const [key, val] of this.cache.entries()) {
      if (now > val.expiresAt) {
        this.cache.delete(key);
      }
    }

    return {
      keys: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      ttlMinutes: Math.round(this.defaultTtlMs / 60000)
    };
  }
}

export const musicCache = new CacheService(600); // 10-minute TTL
