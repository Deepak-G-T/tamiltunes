/**
 * Interim "tap a song, get a radio": play the song, then load related songs into the existing queue.
 * It is replaced by the real queue engine (radioQueue.js) when Part C's UI is wired into the player.
 *
 * @param {object} song the song to start
 * @param {{
 *   playSong: (song: object, queue?: object[]) => void, addToQueue: (song: object) => void,
 *   fetchRelated: (req: { seedId: string, exclude: string[], limit: number }) => Promise<object[]>,
 *   isStillPlaying?: () => boolean,   // false when the user already moved on to another song
 *   queuedIds?: () => Set<string>, limit?: number,
 *   fallback?: object[]               // queued instead when the radio returns nothing (e.g. the other Speed Dial tiles)
 * }} io
 * @returns {Promise<number>} how many related songs were queued
 */
export async function startRadio(song, { playSong, addToQueue, fetchRelated, isStillPlaying = () => true, queuedIds = () => new Set(), limit = 20, fallback = [] }) {
  playSong(song, [song]);
  let items = [];
  try {
    items = (await fetchRelated({ seedId: song.id, exclude: [song.id], limit })) || [];
  } catch {
    items = []; // offline or the radio is down: the song still plays
  }
  if (!isStillPlaying()) return 0; // the user picked something else meanwhile: do not pile this onto it
  const known = new Set([song.id, ...queuedIds()]);
  let added = 0;
  const queue = (list) => {
    for (const s of list) {
      if (!s?.id || known.has(s.id)) continue;
      known.add(s.id);
      addToQueue(s);
      added++;
    }
  };
  queue(items);
  if (!added) queue(fallback); // radio gave nothing: at least play on through the rest of the grid
  return added;
}
