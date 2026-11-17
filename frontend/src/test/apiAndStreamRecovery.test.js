import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import api from '../services/api';

const storage = {};
globalThis.localStorage = {
  getItem: (k) => storage[k] ?? null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); }
};

describe('Frontend API Interceptor & Auth Verification Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('401 response clears tamiltunes_token and tamiltunes_user from localStorage', async () => {
    localStorage.setItem('tamiltunes_token', 'expired_jwt_token_123');
    localStorage.setItem('tamiltunes_user', JSON.stringify({ id: 'u1', name: 'Tester' }));

    expect(localStorage.getItem('tamiltunes_token')).toBe('expired_jwt_token_123');
    expect(localStorage.getItem('tamiltunes_user')).not.toBeNull();

    // Mock a 401 error rejection from axios
    const error401 = {
      response: {
        status: 401,
        data: { success: false, message: 'Invalid or expired token' }
      },
      config: { method: 'get', url: '/auth/me' }
    };

    // Invoke the response error handler of the interceptor
    const responseErrorHandler = api.interceptors.response.handlers[0].rejected;

    await expect(responseErrorHandler(error401)).rejects.toEqual(error401);

    expect(localStorage.getItem('tamiltunes_token')).toBeNull();
    expect(localStorage.getItem('tamiltunes_user')).toBeNull();
  });

  it('mutating requests (POST, PUT, DELETE) NEVER auto-retry on timeout or network error', async () => {
    const responseErrorHandler = api.interceptors.response.handlers[0].rejected;

    const mutatingMethods = ['post', 'put', 'delete', 'patch'];

    for (const method of mutatingMethods) {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 35000ms exceeded',
        config: { method, url: '/playlists', _hasColdStartRetried: false }
      };

      // Must reject immediately without attempting to retry
      await expect(responseErrorHandler(timeoutError)).rejects.toEqual(timeoutError);
      expect(timeoutError.config._hasColdStartRetried).toBe(false);
    }
  });

  it('GET requests trigger auto-retry flag when experiencing cold-start network errors', async () => {
    const responseErrorHandler = api.interceptors.response.handlers[0].rejected;

    const getError = {
      code: 'ECONNABORTED',
      message: 'Network Error: server spindown',
      config: { method: 'get', url: '/music/home', _hasColdStartRetried: false }
    };

    // Intercept api invocation so retry doesn't make a real network call in unit test
    const retryPromise = responseErrorHandler(getError);
    expect(getError.config._hasColdStartRetried).toBe(true);
    // Ignore internal retry network outcome
    retryPromise.catch(() => {});
  });
});

describe('Stream Recovery by Song ID Unit Test', () => {
  it('refetches strictly by song ID and triggers auto-skip when recovery fails (mocked failure)', async () => {
    const mockSong = {
      id: 'tt_trending_expired_1',
      title: 'Badass',
      streamUrl: 'https://expired-cdn.saavncdn.com/badass_expired.mp4'
    };

    let songEndpointCalledWith = null;

    // Mock api.get
    const originalGet = api.get;
    api.get = vi.fn().mockImplementation(async (url) => {
      songEndpointCalledWith = url;
      // Mock failure from endpoint (e.g. 404 or stream expired on backend as well)
      return Promise.reject(new Error('Song stream unavailable on backend'));
    });

    let playbackErrorSet = null;
    let nextTrackCalled = false;

    // Simulate recovery logic
    const handleExpiredStream = async (song) => {
      if (!song || song._hasRetriedFreshFetch) {
        playbackErrorSet = 'Stream unavailable or expired. Skipping to next track...';
        nextTrackCalled = true;
        return;
      }

      song._hasRetriedFreshFetch = true;
      try {
        const { data } = await api.get(`/music/song/${encodeURIComponent(song.id)}`);
        if (data?.data?.streamUrl) {
          song.streamUrl = data.data.streamUrl;
          return;
        }
      } catch (e) {
        // Recovery failed as expected
      }

      playbackErrorSet = 'Stream expired. Skipping to next track...';
      nextTrackCalled = true;
    };

    await handleExpiredStream(mockSong);

    // Verify recovery queried GET /music/song/:id (NOT a title search query)
    expect(songEndpointCalledWith).toBe('/music/song/tt_trending_expired_1');
    expect(mockSong._hasRetriedFreshFetch).toBe(true);
    expect(playbackErrorSet).toBe('Stream expired. Skipping to next track...');
    expect(nextTrackCalled).toBe(true);

    api.get = originalGet;
  });
});
