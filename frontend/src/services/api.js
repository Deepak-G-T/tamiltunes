import axios from 'axios';
import { API_BASE_URL } from '../config/app';
import { API_TIMEOUT_MS, coldStartRetryDelay } from '../lib/coldStart';
import { getToken, clearToken } from '../lib/tokenStore';


const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS, // a sleeping Render server needs 30 to 60 seconds to wake up
  headers: {
    'Content-Type': 'application/json',
  },
});

let activeSlowRequestsCount = 0;

const notifySlowStatus = (isSlow) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tamiltunes:server-coldstart', { detail: { isWaking: isSlow } }));
  }
};

// Request interceptor to attach JWT token & track 5s cold starts
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Set a timer for 5s to indicate Render server wake-up state
    config._slowTimer = setTimeout(() => {
      activeSlowRequestsCount += 1;
      notifySlowStatus(true);
    }, 5000);

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle completion, retries, and auth errors
api.interceptors.response.use(
  (response) => {
    if (response.config?._slowTimer) {
      clearTimeout(response.config._slowTimer);
      if (activeSlowRequestsCount > 0) {
        activeSlowRequestsCount -= 1;
        if (activeSlowRequestsCount === 0) {
          notifySlowStatus(false);
        }
      }
    }
    return response;
  },
  async (error) => {
    const config = error.config;
    if (config?._slowTimer) {
      clearTimeout(config._slowTimer);
      if (activeSlowRequestsCount > 0) {
        activeSlowRequestsCount -= 1;
        if (activeSlowRequestsCount === 0) {
          notifySlowStatus(false);
        }
      }
    }

    // The server may still be waking up (free Render sleeps when idle). Reads are retried quietly, up to twice; writes never are.
    const retryDelay = coldStartRetryDelay(config, error);
    if (retryDelay !== null) {
      config._coldStartRetries = (config._coldStartRetries || 0) + 1;
      config._hasColdStartRetried = true; // kept for older callers: "this request was retried at least once"
      notifySlowStatus(true); // shows the "server is waking up" notice
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return api(config);
    }

    if (error.response && error.response.status === 401) {
      // Clear token if invalid or expired
      clearToken();
      localStorage.removeItem('tamiltunes_user');
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/signup')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
