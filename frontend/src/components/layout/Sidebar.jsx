import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Compass,
  Search,
  Heart,
  ListMusic,
  History,
  Plus,
  Library,
  Music2,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

// Square cover tile used in the Library rows
const Tile = ({ className = '', children }) => (
  <div className={`w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 ${className}`}>
    {children}
  </div>
);

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

  // Primary nav rows: grey by default, white + bold when active (no coloured side bars)
  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-4 px-3 py-2 rounded-md text-sm font-bold transition-colors duration-200 ${
      isActive ? 'text-white' : 'text-zinc-400 hover:text-white'
    }`;

  const libraryRowClass = ({ isActive }) =>
    `group flex items-center gap-3 p-2 rounded-md transition-colors duration-200 ${
      isActive ? 'bg-surface-4' : 'hover:bg-surface-3'
    }`;

  return (
    <aside className="w-full h-full flex flex-col gap-2 select-none">
      {/* Panel 1: brand + primary navigation */}
      <div className="bg-surface-1 rounded-panel px-3 pt-4 pb-3 flex-shrink-0">
        <NavLink to="/" className="flex items-center gap-2.5 px-3 pb-4 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
            <Music2 className="w-5 h-5 text-black" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg text-white tracking-tight">TamilTunes</span>
            </div>
          </div>
        </NavLink>

        <nav className="space-y-0.5">
          <NavLink to="/" end className={navLinkClass}>
            <Home className="w-6 h-6" />
            <span>Home</span>
          </NavLink>
          <NavLink to="/explore" className={navLinkClass}>
            <Compass className="w-6 h-6" />
            <span>Explore</span>
          </NavLink>
          <NavLink to="/search" className={navLinkClass}>
            <Search className="w-6 h-6" />
            <span>Search</span>
          </NavLink>
        </nav>
      </div>

      {/* Panel 2: your library */}
      <div className="bg-surface-1 rounded-panel flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-3 text-zinc-400">
            <Library className="w-6 h-6" />
            <span className="text-sm font-bold">Your Library</span>
          </div>
          {isAuthenticated && (
            <button
              onClick={onOpenCreatePlaylist}
              title="Create Playlist"
              aria-label="Create playlist"
              className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-surface-3 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-2 pb-2 flex-1 overflow-y-auto">
          <NavLink to="/favorites" className={libraryRowClass}>
            <Tile className="bg-gradient-to-br from-brand-700 to-brand-300">
              <Heart className="w-5 h-5 fill-white text-white" />
            </Tile>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Favourites</p>
              <p className="text-xs text-zinc-400 truncate">Playlist</p>
            </div>
          </NavLink>
          <NavLink to="/history" className={libraryRowClass}>
            <Tile className="bg-surface-4">
              <History className="w-5 h-5 text-zinc-300" />
            </Tile>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Listening History</p>
              <p className="text-xs text-zinc-400 truncate">Recently played</p>
            </div>
          </NavLink>

          {isAuthenticated &&
            playlists.map((pl) => (
              <NavLink key={pl.id} to={`/playlist/${pl.id}`} className={libraryRowClass}>
                <Tile className="bg-surface-4">
                  <ListMusic className="w-5 h-5 text-zinc-400" />
                </Tile>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{pl.name}</p>
                  <p className="text-xs text-zinc-400 truncate">Playlist</p>
                </div>
              </NavLink>
            ))}

          {isAuthenticated && playlists.length === 0 && (
            <p className="px-3 py-3 text-xs text-zinc-500">Create your first playlist with the + button.</p>
          )}
          {!isAuthenticated && (
            <div className="m-2 mt-4 p-4 rounded-lg bg-surface-3">
              <p className="text-sm font-bold text-white">Save your favourite songs</p>
              <p className="text-xs text-zinc-400 mt-1">Log in to build playlists and keep your history.</p>
              <button
                onClick={() => navigate('/login')}
                className="mt-3 px-4 py-1.5 rounded-full bg-white text-black text-xs font-bold hover:scale-105 transition-transform"
              >
                Log in
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-3 flex items-center gap-2 text-[11px] text-zinc-500 border-t border-white/5">
          <ShieldCheck className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
          <span>Ad-free. Authorized Tamil tracks with licensed metadata.</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
