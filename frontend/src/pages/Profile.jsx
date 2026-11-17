import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, ShieldCheck, ListMusic, Heart, History, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Profile = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ playlists: 0, favorites: 0, history: 0 });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    Promise.all([
      api.get('/playlists').catch((err) => ({ data: { items: [], playlists: [], total: 0 } })),
      api.get('/favorites').catch((err) => ({ data: { items: [], favorites: [], total: 0 } })),
      api.get('/history').catch((err) => ({ data: { items: [], history: [], total: 0 } })),
    ]).then(([plRes, favRes, histRes]) => {
      const getCount = (res, legacyKey) => {
        if (!res?.data) return 0;
        if (typeof res.data.total === 'number') return res.data.total;
        if (Array.isArray(res.data.items)) return res.data.items.length;
        if (Array.isArray(res.data[legacyKey])) return res.data[legacyKey].length;
        return 0;
      };

      setStats({
        playlists: getCount(plRes, 'playlists'),
        favorites: getCount(favRes, 'favorites'),
        history: getCount(histRes, 'history'),
      });
    });
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Profile Card */}
      <div className="bg-[#18181B] rounded-2xl border border-zinc-800 p-6 md:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-3xl font-black text-white shadow-xl shadow-purple-600/30">
            {user?.name ? user.name[0].toUpperCase() : 'U'}
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ad-Free Member</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{user?.name}</h1>
            <p className="text-xs text-zinc-400 flex items-center justify-center sm:justify-start gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              <span>{user?.email}</span>
            </p>
          </div>

          <button
            onClick={() => {
              logout();
              navigate('/');
            }}
            className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-zinc-800/80">
          <div
            onClick={() => navigate('/favorites')}
            className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center cursor-pointer hover:border-zinc-700 transition-colors"
          >
            <Heart className="w-5 h-5 text-rose-400 mx-auto mb-1.5" />
            <div className="text-xl font-bold text-white">{stats.favorites}</div>
            <div className="text-[11px] text-zinc-400 font-medium">Favourites</div>
          </div>

          <div
            onClick={() => navigate('/')}
            className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center cursor-pointer hover:border-zinc-700 transition-colors"
          >
            <ListMusic className="w-5 h-5 text-purple-400 mx-auto mb-1.5" />
            <div className="text-xl font-bold text-white">{stats.playlists}</div>
            <div className="text-[11px] text-zinc-400 font-medium">Playlists</div>
          </div>

          <div
            onClick={() => navigate('/history')}
            className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center cursor-pointer hover:border-zinc-700 transition-colors"
          >
            <History className="w-5 h-5 text-sky-400 mx-auto mb-1.5" />
            <div className="text-xl font-bold text-white">{stats.history}</div>
            <div className="text-[11px] text-zinc-400 font-medium">Tracks Played</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
