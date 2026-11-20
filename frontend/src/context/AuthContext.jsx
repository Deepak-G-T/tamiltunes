import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { migrateGuestPlays } from '../lib/guestPlays';
import { speedDialApi } from '../lib/speedDialApi';
import { getToken, setToken as saveToken, clearToken } from '../lib/tokenStore';
import { nativeGoogleSignOut } from '../lib/googleAuth';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => getToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMe = async () => {
      const storedToken = getToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await api.get('/auth/me');
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem('tamiltunes_user', JSON.stringify(data.user));
        }
      } catch (err) {
        console.warn('Auth check failed:', err.message);
        clearToken();
        localStorage.removeItem('tamiltunes_user');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, []);

  // Signing in starts a session
  const startSession = (data) => {
    saveToken(data.token); // website: localStorage, Android app: private storage (lib/tokenStore.js)
    localStorage.setItem('tamiltunes_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    migrateGuestPlays(window.localStorage, speedDialApi.importPlays); // songs played while signed out join the account
  };
  const failure = (err, fallback) => ({
    success: false,
    error: err.response?.data?.message || err.message || fallback,
    code: err.response?.data?.code
  });

  // Google is the only way to sign in: the browser button or the Android app gives an ID token, the server checks it and answers with our session
  const loginWithGoogle = async (idToken) => {
    try {
      const { data } = await api.post('/auth/google', { idToken });
      if (data.success && data.token) {
        startSession(data);
        return { success: true, user: data.user };
      }
      return { success: false, error: data.message || 'Google sign-in failed' };
    } catch (err) {
      return failure(err, 'Google sign-in failed');
    }
  };

  const logout = () => {
    nativeGoogleSignOut(); // the Android app forgets the Google account so the next sign-in asks which one
    clearToken();
    localStorage.removeItem('tamiltunes_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        loginWithGoogle,
        logout,
        setUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
