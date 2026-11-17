import { getStore } from '../community/store/index.js';
import { checkContent, FILTER_MESSAGES } from '../community/contentFilter.js';
import { extractTimestamp } from '../community/sanitize.js';
import { commentListQuery } from '../community/schemas.js';
import { encodeCursor, decodeCursor, presentComment } from '../community/presenters.js';

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const canModerate = (user) => user && ['admin', 'artist'].includes(user.role);

/** Attach like state + reply counts to a batch of comments with 2 queries. */
async function present(store, comments, viewerId) {
  const ids = comments.map((c) => c.id);
  const topIds = comments.filter((c) => !c.parentId).map((c) => c.id);
  const [liked, replyCounts] = await Promise.all([store.likedSet(viewerId, ids), store.countReplies(topIds)]);
  return comments.map((c) => presentComment(c, { liked, replyCounts }));
}

export const listComments = async (req, res, next) => {
  try {
    const q = commentListQuery.safeParse(req.query);
    if (!q.success) return fail(res, 400, 'Invalid query');
    const cursor = decodeCursor(q.data.cursor);
    if (cursor === undefined) return fail(res, 400, 'Invalid cursor');

    const store = getStore();
    const { songId } = req.params;
    const page = await store.listComments({ songId, sort: q.data.sort, limit: q.data.limit, cursor });
    const pinned = !cursor ? await store.getPinned(songId) : null;
    const items = await present(store, pinned ? [pinned, ...page.items] : page.items, req.user?.id);

    res.json({
      success: true,
      pinned: pinned ? items[0] : null,
      items: pinned ? items.slice(1) : items,
      nextCursor: encodeCursor(page.nextKey),
      hasMore: Boolean(page.nextKey),
      serverTime: new Date().toISOString(),
    });
  } catch (err) { next(err); }
};

/** Polling fallback for "live" updates: everything created since the client's last serverTime. */
export const pollComments = async (req, res, next) => {
  try {
    const since = new Date(String(req.query.since || ''));
    if (Number.isNaN(since.getTime())) return fail(res, 400, '`since` must be an ISO date');
    const store = getStore();
    const rows = await store.listSince({ songId: req.params.songId, since, limit: 50 });
    res.json({ success: true, items: await present(store, rows, req.user?.id), serverTime: new Date().toISOString() });
  } catch (err) { next(err); }
};

export const listReplies = async (req, res, next) => {
  try {
    const q = commentListQuery.safeParse(req.query);
    if (!q.success) return fail(res, 400, 'Invalid query');
    const cursor = decodeCursor(q.data.cursor);
    if (cursor === undefined) return fail(res, 400, 'Invalid cursor');
    const store = getStore();
    const parent = await store.getComment(req.params.id);
    if (!parent || parent.parentId) return fail(res, 404, 'Comment not found');
    const page = await store.listComments({ songId: parent.songId, parentId: parent.id, limit: q.data.limit, cursor });
    res.json({
      success: true,
      items: await present(store, page.items, req.user?.id),
      nextCursor: encodeCursor(page.nextKey),
      hasMore: Boolean(page.nextKey),
    });
  } catch (err) { next(err); }
};

export const createComment = async (req, res, next) => {
  try {
    const store = getStore();
    const { body, parentId, timestampSec } = req.body;
    const songId = req.params.songId;
    if (songId.length > 100) return fail(res, 400, 'Invalid song id');

    const verdict = checkContent(body);
    if (!verdict.ok) return fail(res, 422, FILTER_MESSAGES[verdict.reason], { reason: verdict.reason });

    if (parentId) {
      const parent = await store.getComment(parentId);
      if (!parent || parent.songId !== songId) return fail(res, 404, 'Comment to reply to not found');
      if (parent.parentId) return fail(res, 400, 'Replies can only be one level deep');
    }

    const created = await store.createComment({
      songId, userId: req.user.id, parentId: parentId || null, body,
      timestampSec: timestampSec ?? extractTimestamp(body),
    });
    const [out] = await present(store, [created], req.user.id);
    res.status(201).json({ success: true, comment: out });
  } catch (err) { next(err); }
};

export const editComment = async (req, res, next) => {
  try {
    const store = getStore();
    const c = await store.getComment(req.params.id);
    if (!c) return fail(res, 404, 'Comment not found');
    if (c.userId !== req.user.id) return fail(res, 403, 'You can only edit your own comments');

    const verdict = checkContent(req.body.body);
    if (!verdict.ok) return fail(res, 422, FILTER_MESSAGES[verdict.reason], { reason: verdict.reason });

    const updated = await store.updateComment(c.id, {
      body: req.body.body, editedAt: new Date(), timestampSec: extractTimestamp(req.body.body),
    });
    const [out] = await present(store, [updated], req.user.id);
    res.json({ success: true, comment: out });
  } catch (err) { next(err); }
};

export const deleteComment = async (req, res, next) => {
  try {
    const store = getStore();
    const c = await store.getComment(req.params.id);
    if (!c) return fail(res, 404, 'Comment not found');
    if (c.userId !== req.user.id && req.user.role !== 'admin') return fail(res, 403, 'You can only delete your own comments');
    await store.deleteComment(c.id);
    res.json({ success: true });
  } catch (err) { next(err); }
};

const setLike = (liking) => async (req, res, next) => {
  try {
    const store = getStore();
    const c = await store.getComment(req.params.id);
    if (!c) return fail(res, 404, 'Comment not found');
    if (liking) await store.addLike(c.id, req.user.id); else await store.removeLike(c.id, req.user.id);
    if (req.user.role === 'artist') {
      await store.updateComment(c.id, { likedByArtist: await store.hasArtistLike(c.id) });
    }
    const fresh = await store.getComment(c.id);
    const [out] = await present(store, [fresh], req.user.id);
    res.json({ success: true, comment: out });
  } catch (err) { next(err); }
};
export const likeComment = setLike(true);
export const unlikeComment = setLike(false);

const setPin = (pinning) => async (req, res, next) => {
  try {
    if (!canModerate(req.user)) return fail(res, 403, 'Only artists and admins can pin comments');
    const store = getStore();
    const c = await store.getComment(req.params.id);
    if (!c) return fail(res, 404, 'Comment not found');
    if (c.parentId) return fail(res, 400, 'Only top-level comments can be pinned');
    await store.setPinned(c.songId, pinning ? c.id : null);
    const [out] = await present(store, [await store.getComment(c.id)], req.user.id);
    res.json({ success: true, comment: out });
  } catch (err) { next(err); }
};
export const pinComment = setPin(true);
export const unpinComment = setPin(false);

export const reportComment = async (req, res, next) => {
  try {
    const store = getStore();
    const c = await store.getComment(req.params.id);
    if (!c) return fail(res, 404, 'Comment not found');
    if (c.userId === req.user.id) return fail(res, 400, 'You cannot report your own comment');
    const created = await store.addReport(c.id, req.user.id, req.body.reason);
    res.status(created ? 201 : 200).json({ success: true, alreadyReported: !created });
  } catch (err) { next(err); }
};
