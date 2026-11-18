import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const AccessDenied = () => (
  <main className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
    <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-6">
      <ShieldAlert className="w-8 h-8 text-rose-400" />
    </div>
    <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
    <p className="text-zinc-400 text-sm max-w-md mb-8">
      You do not have administrator privileges to view this section. Role verification is enforced on the server.
    </p>
    <Link
      to="/"
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      <span>Back to TamilTunes</span>
    </Link>
  </main>
);

const AdminRoute = ({ children }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (user?.role !== 'admin') {
    return <AccessDenied />;
  }

  return children;
};

export default AdminRoute;
