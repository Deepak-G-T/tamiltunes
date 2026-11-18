import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { migrateGuestPlays } from '../lib/guestPlays';
import { speedDialApi } from '../lib/speedDialApi';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('tamiltunes_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMe = async () => {
      const storedToken = localStorage.getItem('tamiltunes_token');
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
        localStorage.removeItem('tamiltunes_token');
        localStorage.removeItem('tamiltunes_user');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (data.success && data.token) {
        localStorage.setItem('tamiltunes_token', data.token);
        localStorage.setItem('tamiltunes_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        migrateGuestPlays(window.localStorage, speedDialApi.importPlays); // songs played while signed out join the account
        return { success: true, user: data.user };
      }
      return { success: false, error: data.message || 'Login failed' };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Invalid credentials'
      };
    }
  };

  const signup = async (name, email, password) => {
    try {
      const { data } = await api.post('/auth/register', { name, email, password });
      if (data.success && data.token) {
        localStorage.setItem('tamiltunes_token', data.token);
        localStorage.setItem('tamiltunes_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        migrateGuestPlays(window.localStorage, speedDialApi.importPlays);
        return { success: true, user: data.user };
      }
      return { success: false, error: data.message || 'Signup failed' };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.message || err.message || 'Registration failed'
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('tamiltunes_token');
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
        login,
        signup,
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
