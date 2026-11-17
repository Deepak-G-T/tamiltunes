import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { commentsApi } from '../lib/communityApi';
import { commentsReducer, initialState, findComment, makeOptimistic } from '../lib/commentsReducer';

const POLL_MS = 8000;
const MAX_POLL_MS = 60000;

/**
 * Comments for one song: pagination, sorting, optimistic mutations and live updates.
 * Live updates poll every 8s (with backoff on errors) only while the panel is open and the tab is visible.
 *
 * @param {string|undefined} songId
 * @param {{ active: boolean, user: { id: string, name: string, username?: string, avatarUrl?: string|null, role?: string } | null }} opts
 */
export function useComments(songId, { active, user }) {
  const [state, dispatch] = useReducer(commentsReducer, initialState);
  const [sort, setSort] = useState('newest');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState({});
  const serverTime = useRef(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!songId) return;
    const id = ++requestId.current;
    setStatus('loading');
    setError('');
    try {
      const data = await commentsApi.list(songId, { sort });
      if (id !== requestId.current) return; // a newer request superseded this one
      dispatch({ type: 'reset', items: data.items, pinned: data.pinned });
      setCursor(data.nextCursor);
      serverTime.current = data.serverTime;
      setStatus('ready');
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e.message);
      setStatus('error');
    }
  }, [songId, sort]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await commentsApi.list(songId, { sort, cursor });
      dispatch({ type: 'appendPage', items: data.items });
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, songId, sort]);

  // ---- live updates (polling fallback) ----
  useEffect(() => {
    if (!active || !songId || status !== 'ready') return undefined;
    let timer;
    let delay = POLL_MS;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible' && serverTime.current) {
        try {
          const data = await commentsApi.poll(songId, serverTime.current);
          if (cancelled) return;
          // Skip comments the user is mid-posting; dedupe handles the rest
          dispatch({ type: 'poll', items: data.items });
          serverTime.current = data.serverTime;
          delay = POLL_MS;
        } catch {
          delay = Math.min(delay * 2, MAX_POLL_MS);
        }
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, songId, status]);

  // ---- mutations (optimistic, reverted on failure) ----
  const post = useCallback(async (body, { parentId, timestampSec } = {}) => {
    const author = { id: user.id, username: user.username ?? null, name: user.name, role: user.role ?? 'user', avatarUrl: user.avatarUrl ?? null };
    const temp = makeOptimistic({ songId, body, parentId, timestampSec, author });
    dispatch({ type: 'add', comment: temp });
    try {
      const { comment } = await commentsApi.create(songId, body, { parentId, timestampSec });
      dispatch({ type: 'confirm', tempId: temp.id, comment });
      return { ok: true, comment };
    } catch (e) {
      dispatch({ type: 'remove', id: temp.id });
      return { ok: false, error: e.message, reason: e.reason, status: e.status };
    }
  }, [songId, user]);

  const edit = useCallback(async (id, body) => {
    const before = findComment(stateRef.current, id);
    if (!before) return { ok: false, error: 'Comment not found' };
    dispatch({ type: 'update', id, patch: { body, editedAt: new Date().toISOString() } });
    try {
      const { comment } = await commentsApi.edit(id, body);
      dispatch({ type: 'replace', comment });
      return { ok: true };
    } catch (e) {
      dispatch({ type: 'update', id, patch: { body: before.body, editedAt: before.editedAt } });
      return { ok: false, error: e.message, reason: e.reason };
    }
  }, []);

  const remove = useCallback(async (id) => {
    const snapshot = stateRef.current;
    dispatch({ type: 'remove', id });
    try {
      await commentsApi.remove(id);
      return { ok: true };
    } catch (e) {
      dispatch({ type: 'reset', items: snapshot.items, pinned: snapshot.pinned });
      for (const [parentId, g] of Object.entries(snapshot.replies)) {
        dispatch({ type: 'repliesLoaded', parentId, items: g.items, nextCursor: g.nextCursor, hasMore: g.hasMore });
      }
      return { ok: false, error: e.message };
    }
  }, []);

  const toggleLike = useCallback(async (id) => {
    const c = findComment(stateRef.current, id);
    if (!c) return;
    const liking = !c.likedByMe;
    dispatch({ type: 'update', id, patch: { likedByMe: liking, likeCount: Math.max(0, c.likeCount + (liking ? 1 : -1)) } });
    try {
      const { comment } = await (liking ? commentsApi.like(id) : commentsApi.unlike(id));
      dispatch({ type: 'replace', comment });
    } catch (e) {
      dispatch({ type: 'update', id, patch: { likedByMe: c.likedByMe, likeCount: c.likeCount } });
      return { ok: false, error: e.message };
    }
    return { ok: true };
  }, []);

  const togglePin = useCallback(async (id) => {
    const c = findComment(stateRef.current, id);
    if (!c) return { ok: false };
    try {
      const { comment } = await (c.isPinned ? commentsApi.unpin(id) : commentsApi.pin(id));
      dispatch(comment.isPinned ? { type: 'pin', comment } : { type: 'unpin' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const report = useCallback(async (id, reason) => {
    try {
      const out = await commentsApi.report(id, reason);
      return { ok: true, already: out.alreadyReported };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  const loadReplies = useCallback(async (parentId, { more = false } = {}) => {
    const group = stateRef.current.replies[parentId];
    if (more && !group?.hasMore) return;
    setRepliesLoading((m) => ({ ...m, [parentId]: true }));
    try {
      const data = await commentsApi.replies(parentId, { cursor: more ? group.nextCursor : undefined });
      dispatch({ type: 'repliesLoaded', parentId, items: data.items, nextCursor: data.nextCursor, hasMore: data.hasMore, append: more });
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      setRepliesLoading((m) => ({ ...m, [parentId]: false }));
    }
    return { ok: true };
  }, []);

  return {
    state, status, error, sort, setSort, hasMore: Boolean(cursor), loadingMore, repliesLoading,
    reload: load, loadMore, loadReplies, post, edit, remove, toggleLike, togglePin, report,
  };
}
