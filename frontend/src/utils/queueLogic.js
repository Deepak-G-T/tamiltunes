/**
 * Pure queue and playback navigation algorithms
 */

/**
 * Calculates the next track index given queue parameters
 */
export function getNextTrackIndex(currentIndex, queueLength, { isShuffle = false, repeatMode = 'off', randomFn = Math.random } = {}) {
  if (queueLength <= 0) return -1;
  if (repeatMode === 'one') return currentIndex >= 0 ? currentIndex : 0;

  if (isShuffle) {
    if (queueLength === 1) return 0;
    // Pick another random index different from current if possible
    let nextIdx = Math.floor(randomFn() * queueLength);
    if (nextIdx === currentIndex) {
      nextIdx = (nextIdx + 1) % queueLength;
    }
    return nextIdx;
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= queueLength) {
    if (repeatMode === 'all') {
      return 0;
    }
    return -1; // End of playback
  }
  return nextIndex;
}

/**
 * Calculates previous track action and index
 */
export function getPreviousTrackAction(currentIndex, queueLength, currentTime = 0, { restartThreshold = 3 } = {}) {
  if (queueLength <= 0) return { action: 'none', index: -1 };

  // If track has been playing for more than restartThreshold seconds, restart current track
  if (currentTime > restartThreshold) {
    return { action: 'restart', index: currentIndex };
  }

  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    prevIndex = queueLength - 1;
  }
  return { action: 'prev', index: prevIndex };
}

/**
 * Pure queue reordering
 */
export function reorderQueue(queue, fromIndex, toIndex) {
  if (!Array.isArray(queue)) return [];
  if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
    return [...queue];
  }
  const result = [...queue];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Computes the updated queueIndex after an item at removedIndex is deleted
 */
export function calculateNewQueueIndexAfterRemoval(removedIndex, currentIndex, newQueueLength) {
  if (newQueueLength <= 0) {
    return -1;
  }
  if (removedIndex === currentIndex) {
    return Math.min(currentIndex, newQueueLength - 1);
  }
  if (removedIndex < currentIndex) {
    return currentIndex - 1;
  }
  return currentIndex;
}
