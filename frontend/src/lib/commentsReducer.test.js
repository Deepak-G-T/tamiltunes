import { describe, it, expect } from 'vitest';
import { commentsReducer as r, initialState, findComment, makeOptimistic, isTemp } from './commentsReducer';

const c = (id, extra = {}) => ({ id, parentId: null, body: id, likeCount: 0, likedByMe: false, replyCount: 0, isPinned: false, ...extra });
const seed = (items, extra = {}) => r(initialState, { type: 'reset', items, ...extra });

describe('commentsReducer', () => {
  it('adds new top-level comments first and ignores duplicates', () => {
    let s = seed([c('a')]);
    s = r(s, { type: 'add', comment: c('b') });
    s = r(s, { type: 'add', comment: c('b') });
    expect(s.items.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('optimistic post is swapped for the server comment, or dropped if polling got there first', () => {
    const tmp = makeOptimistic({ songId: 's', body: 'hi', author: { id: 'u' } });
    expect(isTemp(tmp.id)).toBe(true);
    let s = r(seed([c('a')]), { type: 'add', comment: tmp });
    s = r(s, { type: 'confirm', tempId: tmp.id, comment: c('real') });
    expect(s.items.map((x) => x.id)).toEqual(['real', 'a']);

    let s2 = r(seed([c('a')]), { type: 'add', comment: tmp });
    s2 = r(s2, { type: 'add', comment: c('real') }); // arrived via polling
    s2 = r(s2, { type: 'confirm', tempId: tmp.id, comment: c('real') });
    expect(s2.items.filter((x) => x.id === 'real')).toHaveLength(1);
    expect(s2.items.some((x) => x.id === tmp.id)).toBe(false);
  });

  it('replies attach to their parent and bump replyCount; removing reverts it', () => {
    let s = seed([c('p')]);
    s = r(s, { type: 'add', comment: c('r1', { parentId: 'p' }) });
    expect(findComment(s, 'p').replyCount).toBe(1);
    expect(s.replies.p.items.map((x) => x.id)).toEqual(['r1']);
    s = r(s, { type: 'remove', id: 'r1' });
    expect(findComment(s, 'p').replyCount).toBe(0);
    expect(s.replies.p.items).toEqual([]);
  });

  it('removing a parent removes its replies', () => {
    let s = seed([c('p')]);
    s = r(s, { type: 'add', comment: c('r1', { parentId: 'p' }) });
    s = r(s, { type: 'remove', id: 'p' });
    expect(s.items).toEqual([]);
    expect(s.replies.p).toBeUndefined();
  });

  it('like updates apply everywhere the comment appears', () => {
    let s = seed([c('p', { isPinned: true })], {});
    s = { ...s, pinned: c('pin') };
    s = r(s, { type: 'update', id: 'pin', patch: { likedByMe: true, likeCount: 1 } });
    expect(s.pinned.likedByMe).toBe(true);
    s = r(s, { type: 'replace', comment: { ...c('p'), likeCount: 5, replyCount: 0 } });
    expect(findComment(s, 'p').likeCount).toBe(5);
  });

  it('only one comment is pinned; unpin returns it to the list', () => {
    let s = seed([c('a'), c('b')]);
    s = r(s, { type: 'pin', comment: c('a') });
    expect(s.pinned.id).toBe('a');
    expect(s.items.map((x) => x.id)).toEqual(['b']);
    s = r(s, { type: 'pin', comment: c('b') });
    expect(s.pinned.id).toBe('b');
    expect(s.items.map((x) => x.id)).toEqual(['a']);
    expect(s.items[0].isPinned).toBe(false);
    s = r(s, { type: 'unpin' });
    expect(s.pinned).toBeNull();
    expect(s.items).toHaveLength(2);
  });

  it('poll merges only unseen comments and counts replies', () => {
    let s = seed([c('a'), c('p')]);
    s = r(s, { type: 'poll', items: [c('a'), c('n'), c('r', { parentId: 'p' }), c('r', { parentId: 'p' })] });
    expect(s.items.map((x) => x.id)).toEqual(['n', 'a', 'p']);
    expect(findComment(s, 'p').replyCount).toBe(1);
  });

  it('pagination appends without duplicates; loaded replies can append', () => {
    let s = seed([c('a'), c('b')]);
    s = r(s, { type: 'appendPage', items: [c('b'), c('c')] });
    expect(s.items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    s = r(s, { type: 'repliesLoaded', parentId: 'a', items: [c('x', { parentId: 'a' })], nextCursor: 'n', hasMore: true });
    s = r(s, { type: 'repliesLoaded', parentId: 'a', items: [c('y', { parentId: 'a' })], nextCursor: null, hasMore: false, append: true });
    expect(s.replies.a.items.map((x) => x.id)).toEqual(['x', 'y']);
    expect(s.replies.a.hasMore).toBe(false);
  });
});
