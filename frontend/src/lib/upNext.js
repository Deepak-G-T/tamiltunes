// Which song plays after the current one? Returns the song, or null when it is not knowable
// (shuffle picks at random, repeat-one replays the same song, or there is nothing after).
export const getUpNext = (queue, queueIndex, { isShuffle = false, repeatMode = 'off' } = {}) => {
  if (!Array.isArray(queue) || queue.length < 2) return null;
  if (queueIndex < 0 || queueIndex >= queue.length) return null;
  if (isShuffle || repeatMode === 'one') return null;
  const next = queueIndex + 1;
  if (next < queue.length) return queue[next] || null;
  return repeatMode === 'all' ? queue[0] || null : null;
};
