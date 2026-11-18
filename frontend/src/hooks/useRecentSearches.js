import { useCallback, useRef, useState } from 'react';
import { loadRecent, saveRecent, addRecent, removeRecent } from '../lib/recentSearches';

/**
 * The recent-searches list. `save(query)` is the ONLY way something gets added, and it is meant to be called when a
 * search is committed (Enter, a chosen suggestion or chip, or an action on a result), never while typing.
 */
export function useRecentSearches() {
  const [recent, setRecent] = useState(() => loadRecent(typeof window !== 'undefined' ? window.localStorage : null));
  const ref = useRef(recent);

  const commit = useCallback((next) => {
    if (next === ref.current) return;
    ref.current = next;
    setRecent(next);
    saveRecent(window.localStorage, next);
  }, []);

  const save = useCallback((query) => commit(addRecent(ref.current, query)), [commit]);
  const remove = useCallback((query) => commit(removeRecent(ref.current, query)), [commit]);
  const clear = useCallback(() => commit([]), [commit]);
  return { recent, save, remove, clear };
}
