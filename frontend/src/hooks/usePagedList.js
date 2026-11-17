import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Offset-paginated list with loading / error / load-more states.
 * `fetchPage(offset)` must resolve to `{ items, total, hasMore }`.
 * Re-runs from the start when `deps` change.
 */
export function usePagedList(fetchPage, deps = []) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchRef = useRef(fetchPage);
  const gen = useRef(0);
  useEffect(() => { fetchRef.current = fetchPage; });

  const load = useCallback(async () => {
    const g = ++gen.current;
    setStatus('loading');
    setError('');
    try {
      const page = await fetchRef.current(0);
      if (g !== gen.current) return;
      setItems(page.items);
      setTotal(page.total ?? page.items.length);
      setHasMore(Boolean(page.hasMore));
      setStatus('ready');
    } catch (e) {
      if (g !== gen.current) return;
      setError(e.message);
      setStatus('error');
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, ...deps]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const g = gen.current;
    setLoadingMore(true);
    try {
      const page = await fetchRef.current(items.length);
      if (g !== gen.current) return;
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total ?? total);
      setHasMore(Boolean(page.hasMore));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, items.length, total]);

  return { items, setItems, total, setTotal, hasMore, status, error, loadingMore, reload: load, loadMore };
}
