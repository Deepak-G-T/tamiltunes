import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Compass,
  Search,
  Heart,
  ListMusic,
  History,
  PlusCircle,
  Music2,
  ShieldCheck,
  Disc3
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const Sidebar = ({ onOpenCreatePlaylist }) => {
  const { isAuthenticated } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [hasMorePlaylists, setHasMorePlaylists] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      api.get('/playlists')
        .then(({ data }) => {
          if (data.success) {
            setPlaylists(data.items || data.playlists || []);
            setHasMorePlaylists(!!data.hasMore);
          }
        })
        .catch((err) => {
          if (err.response?.status !== 401) {
            console.warn('Failed to fetch sidebar playlists:', err);
          }
        });
    } else {
      setPlaylists([]);
      setHasMorePlaylists(false);
    }
  }, [isAuthenticated]);

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-purple-600/15 text-purple-400 font-semibold border-l-2 border-purple-500'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
    }`;

  return (
    <aside className="w-64 bg-[#111114] border-r border-zinc-800/60 flex flex-col h-full select-none">
      {/* Brand Header */}
      <div className="p-5 flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-violet-400 flex items-center justify-center shadow-lg shadow-purple-600/25 group-hover:scale-105 transition-transform duration-200">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg text-white tracking-tight">TamilTunes</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">தமிழ்</span>
            </div>
            <p className="text-[11px] text-zinc-400">Pure Tamil Streaming</p>
          </div>
        </NavLink>
      </div>

      {/* Main Navigation */}
      <div className="px-3 py-2 space-y-1">
        <NavLink to="/" end className={navLinkClass}>
          <Home className="w-4 h-4" />
          <span>Home</span>
        </NavLink>
        <NavLink to="/explore" className={navLinkClass}>
          <Compass className="w-4 h-4" />
          <span>Explore</span>
        </NavLink>
        <NavLink to="/search" className={navLinkClass}>
          <Search className="w-4 h-4" />
          <span>Search</span>
        </NavLink>
      </div>

      {/* Divider */}
      <div className="px-5 my-3">
        <div className="h-[1px] bg-zinc-800/60" />
      </div>

      {/* Library Section */}
      <div className="px-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Your Library</span>
          {isAuthenticated && (
            <button
              onClick={onOpenCreatePlaylist}
              title="Create Playlist"
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-1">
          <NavLink to="/favorites" className={navLinkClass}>
            <Heart className="w-4 h-4 text-rose-500" />
            <span>Favourites</span>
          </NavLink>
          <NavLink to="/history" className={navLinkClass}>
            <History className="w-4 h-4 text-sky-400" />
            <span>Listening History</span>
          </NavLink>
        </div>

        {/* User Playlists */}
        {isAuthenticated && (
          <div className="mt-4 pt-3 border-t border-zinc-800/40">
            <span className="px-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
              Playlists
            </span>
            {playlists.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-500 italic">No playlists created yet</div>
            ) : (
              <div className="space-y-0.5">
                {playlists.map((pl) => (
                  <NavLink
                    key={pl.id}
                    to={`/playlist/${pl.id}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'text-purple-400 bg-purple-500/10'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/30'
                      }`
                    }
                  >
                    <ListMusic className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="truncate">{pl.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trust & License Footer */}
      <div className="p-3 m-3 bg-[#18181B] rounded-xl border border-zinc-800/80">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 mb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero Ads & Compliant</span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Stream authorized Tamil tracks with licensed metadata and audio previews.
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
