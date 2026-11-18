// A free Render server sleeps after about 15 minutes and takes 30 to 60 seconds to wake up.
// These rules decide when a failed request is "the server is still waking" (retry quietly) and when it is a real error.
export const API_TIMEOUT_MS = 60000; // long enough for a cold start
export const COLD_START_RETRY_DELAYS_MS = [2500, 5000]; // wait before the 1st and 2nd retry
const WAKING_STATUS = new Set([502, 503, 504]); // what a proxy answers while the server boots

/** Did this request fail only because the server was not reachable yet? */
export function looksLikeWaking(error) {
  if (error?.response) return WAKING_STATUS.has(error.response.status);
  return error?.code === 'ECONNABORTED' || Boolean(error?.message && error.message.includes('Network Error'));
}

/**
 * Should this failed request be tried again?
 * Only reads (GET) are retried: saving something twice could do harm. At most two retries.
 * @returns {number | null} milliseconds to wait before the retry, or null for "do not retry"
 */
export function coldStartRetryDelay(config, error) {
  if (!config || (config.method || 'get').toLowerCase() !== 'get') return null;
  const done = config._coldStartRetries || 0;
  if (done >= COLD_START_RETRY_DELAYS_MS.length) return null;
  return looksLikeWaking(error) ? COLD_START_RETRY_DELAYS_MS[done] : null;
}
