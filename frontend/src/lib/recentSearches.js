// Recent searches: only searches the person really made are kept, never half-typed words.
// Pure functions (no React, no browser): tested in recentSearches.test.js.
import { charLength } from './format';

export const RECENT_KEY = 'tamiltunes_recent_searches_v2'; // v2: saved only on a committed search
export const LEGACY_RECENT_KEY = 'tamiltunes_recent_searches'; // v1 saved while typing and holds half-typed words
export const MAX_RECENT = 10;
export const MIN_QUERY_LENGTH = 2; // in perceived characters (a Tamil letter with its vowel sign counts once)

/** Trim, collapse repeated spaces, and use one Unicode form (so the same Tamil text always compares equal). */
export const normalizeQuery = (q) => String(q ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** Comparison key: normalised and lower-cased (Unicode-safe; Tamil has no case so it is unchanged). */
export const queryKey = (q) => normalizeQuery(q).toLowerCase();

export const isSavable = (q) => charLength(normalizeQuery(q)) >= MIN_QUERY_LENGTH;

/**
 * Add a committed search. Returns a new list, newest first, at most MAX_RECENT long.
 * - too short: ignored
 * - same search again: moved to the top
 * - an older entry that the new search extends ("ambala" then "ambala song"): replaced, so no stack of fragments
 */
export function addRecent(list, query) {
  const q = normalizeQuery(query);
  if (!isSavable(q)) return list;
  const key = q.toLowerCase();
  const kept = list.filter((e) => {
    const k = queryKey(e);
    return k !== key && !key.startsWith(k);
  });
  return [q, ...kept].slice(0, MAX_RECENT);
}

export const removeRecent = (list, query) => list.filter((e) => queryKey(e) !== queryKey(query));

/**
 * Clean an existing list once: drop entries that are too short, drop repeats (keeping the newest),
 * and drop entries that are only the beginning of a longer saved entry ("am", "amba" next to "ambala").
 */
export function migrateRecent(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const unique = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const q = normalizeQuery(raw);
    const k = q.toLowerCase();
    if (!isSavable(q) || seen.has(k)) continue;
    seen.add(k);
    unique.push(q);
  }
  const keys = unique.map((q) => q.toLowerCase());
  return unique.filter((_, i) => !keys.some((other, j) => j !== i && other.length > keys[i].length && other.startsWith(keys[i]))).slice(0, MAX_RECENT);
}

/** Load the list. The first time (no v2 key yet) the old list is cleaned, saved under the new key and the old key is removed. */
export function loadRecent(storage) {
  try {
    const current = storage?.getItem(RECENT_KEY);
    if (current !== null && current !== undefined) return migrateRecent(JSON.parse(current)); // already v2 (cheap to re-check)
    const legacy = storage?.getItem(LEGACY_RECENT_KEY);
    const cleaned = legacy ? migrateRecent(JSON.parse(legacy)) : [];
    storage?.setItem(RECENT_KEY, JSON.stringify(cleaned));
    storage?.removeItem(LEGACY_RECENT_KEY);
    return cleaned;
  } catch {
    return [];
  }
}

export function saveRecent(storage, list) {
  try { storage?.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch { /* storage full or blocked: the list just will not survive a refresh */ }
}
