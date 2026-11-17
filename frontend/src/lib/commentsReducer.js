/**
 * Pure state transitions for the comments list (top-level comments, one pinned comment,
 * and replies grouped by parent). Optimistic updates and polling merges live here so they
 * can be tested without React.
 *
 * state = { items: Comment[], pinned: Comment|null, replies: { [parentId]: { items, nextCursor, hasMore, loaded } } }
 */

export const initialState = { items: [], pinned: null, replies: {} };

const has = (list, id) => list.some((c) => c.id === id);
const dedupe = (list) => {
  const seen = new Set();
  return list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
};

/** Apply fn to every comment wherever it is stored. */
function mapAll(state, fn) {
  const replies = {};
  for (const [k, v] of Object.entries(state.replies)) replies[k] = { ...v, items: v.items.map(fn) };
  return { ...state, items: state.items.map(fn), pinned: state.pinned ? fn(state.pinned) : null, replies };
}

const bumpReplyCount = (state, parentId, delta) =>
  mapAll(state, (c) => (c.id === parentId ? { ...c, replyCount: Math.max(0, c.replyCount + delta) } : c));

export function commentsReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return { items: action.items, pinned: action.pinned ?? null, replies: {} };

    case 'appendPage':
      return { ...state, items: dedupe([...state.items, ...action.items]) };

    case 'add': {
      const c = action.comment;
      if (c.parentId) {
        const group = state.replies[c.parentId] ?? { items: [], nextCursor: null, hasMore: false, loaded: false };
        if (has(group.items, c.id)) return state;
        const next = { ...state, replies: { ...state.replies, [c.parentId]: { ...group, items: [...group.items, c] } } };
        return bumpReplyCount(next, c.parentId, 1);
      }
      if (has(state.items, c.id) || state.pinned?.id === c.id) return state;
      return { ...state, items: [c, ...state.items] };
    }

    // Swap an optimistic placeholder for the server's comment (or drop it if polling already delivered it)
    case 'confirm': {
      const { tempId, comment } = action;
      const swap = (list) => {
        if (!has(list, tempId)) return list;
        return has(list, comment.id) ? list.filter((c) => c.id !== tempId) : list.map((c) => (c.id === tempId ? comment : c));
      };
      const replies = {};
      for (const [k, v] of Object.entries(state.replies)) replies[k] = { ...v, items: swap(v.items) };
      return { ...state, items: swap(state.items), replies };
    }

    case 'update':
      return mapAll(state, (c) => (c.id === action.id ? { ...c, ...action.patch } : c));

    // Server returned the canonical comment (after like, pin, edit)
    case 'replace':
      return mapAll(state, (c) => (c.id === action.comment.id ? { ...c, ...action.comment, replyCount: c.replyCount } : c));

    case 'remove': {
      const target = findComment(state, action.id);
      if (!target) return state;
      let next;
      if (target.parentId) {
        const replies = {};
        for (const [k, v] of Object.entries(state.replies)) replies[k] = { ...v, items: v.items.filter((c) => c.id !== action.id) };
        next = bumpReplyCount({ ...state, replies }, target.parentId, -1);
      } else {
        const replies = { ...state.replies };
        delete replies[action.id];
        next = { ...state, items: state.items.filter((c) => c.id !== action.id), pinned: state.pinned?.id === action.id ? null : state.pinned, replies };
      }
      return next;
    }

    // Only one pinned comment per song: move it out of / back into the list
    case 'pin': {
      const c = action.comment;
      const rest = state.items.filter((x) => x.id !== c.id);
      const unpinned = state.pinned && state.pinned.id !== c.id ? [{ ...state.pinned, isPinned: false }] : [];
      return { ...state, pinned: { ...c, isPinned: true }, items: dedupe([...unpinned, ...rest]) };
    }
    case 'unpin': {
      if (!state.pinned) return state;
      return { ...state, pinned: null, items: dedupe([{ ...state.pinned, isPinned: false }, ...state.items]) };
    }

    case 'repliesLoaded': {
      const group = state.replies[action.parentId] ?? { items: [], nextCursor: null, hasMore: false, loaded: false };
      const items = action.append ? dedupe([...group.items, ...action.items]) : action.items;
      return { ...state, replies: { ...state.replies, [action.parentId]: { items, nextCursor: action.nextCursor, hasMore: action.hasMore, loaded: true } } };
    }

    // Comments created by other people while the panel was open
    case 'poll': {
      let next = state;
      for (const c of action.items) {
        if (c.parentId ? has(next.replies[c.parentId]?.items ?? [], c.id) : has(next.items, c.id) || next.pinned?.id === c.id) continue;
        next = commentsReducer(next, { type: 'add', comment: c });
      }
      return next;
    }

    default:
      return state;
  }
}

export function findComment(state, id) {
  if (state.pinned?.id === id) return state.pinned;
  const top = state.items.find((c) => c.id === id);
  if (top) return top;
  for (const v of Object.values(state.replies)) {
    const r = v.items.find((c) => c.id === id);
    if (r) return r;
  }
  return null;
}

/** Placeholder shown immediately while a post is in flight. */
export function makeOptimistic({ songId, body, parentId, timestampSec, author }) {
  return {
    id: `tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    songId, parentId: parentId ?? null, body, timestampSec: timestampSec ?? null,
    isPinned: false, likeCount: 0, likedByMe: false, likedByArtist: false, replyCount: 0,
    editedAt: null, createdAt: new Date().toISOString(), author, pending: true,
  };
}

export const isTemp = (id) => String(id).startsWith('tmp_');
