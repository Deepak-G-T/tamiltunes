import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 35000, // accommodate Render cold starts
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
    const token = localStorage.getItem('tamiltunes_token');
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

    // If request timed out or network error on cold start, retry automatically once after 2.5s
    if (config && !config._hasColdStartRetried && (error.code === 'ECONNABORTED' || (!error.response && error.message.includes('Network Error')))) {
      config._hasColdStartRetried = true;
      notifySlowStatus(true);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return api(config);
    }

    if (error.response && error.response.status === 401) {
      // Clear token if invalid or expired
      localStorage.removeItem('tamiltunes_token');
      localStorage.removeItem('tamiltunes_user');
    }

    return Promise.reject(error);
  }
);

export default api;
