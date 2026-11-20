import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Music2, Loader2 } from 'lucide-react';

export const SplashLoader = () => (
  <div
    data-testid="gate-splash-loader"
    className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#09090B] text-white pt-[var(--safe-top)] pb-[var(--safe-bottom)]"
  >
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-xl shadow-brand-600/30 mb-4 animate-pulse">
      <Music2 className="w-7 h-7 text-white" />
    </div>
    <p className="text-base font-bold tracking-tight text-white">TamilTunes</p>
    <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
      <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
      <span>Checking session...</span>
    </div>
  </div>
);

export const isLoginRequired = () => {
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('tamiltunes_require_login');
    if (override !== null) return override === 'true';
  }
  return import.meta.env.VITE_REQUIRE_LOGIN !== 'false';
};

export const LoginGate = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  const requireLogin = isLoginRequired();

  if (isLoading) {
    return <SplashLoader />;
  }

  if (requireLogin && !isAuthenticated) {
    const fullPath = location.pathname + location.search;
    const redirect = fullPath && fullPath !== '/' ? `?redirect=${encodeURIComponent(fullPath)}` : '';
    return <Navigate to={`/login${redirect}`} replace />;
  }

  return children;
};

export default LoginGate;
