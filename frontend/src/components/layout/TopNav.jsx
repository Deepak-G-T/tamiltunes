import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
  Settings,
  Music,
  Menu,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const TopNav = ({ onToggleMobileSidebar }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-transparent sticky top-0 z-30 px-4 md:px-6 flex items-center justify-between">
      {/* Left controls: Back / Forward & Mobile menu */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMobileSidebar}
          aria-label="Open menu"
          className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-1.5">
          <button
            onClick={() => navigate(-1)}
            title="Go back"
            className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate(1)}
            title="Go forward"
            className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-zinc-300 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right controls: User Profile or Auth */}
      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 p-1 pr-3 rounded-full bg-black/60 hover:bg-surface-3 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-brand-600 to-brand-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                {user?.name ? user.name[0].toUpperCase() : 'U'}
              </div>
              <span className="text-xs font-medium text-zinc-200 max-w-[120px] truncate hidden sm:inline">
                {user?.name || 'User'}
              </span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-surface-2 rounded-xl shadow-2xl border border-zinc-800/80 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-2 border-b border-zinc-800/60">
                  <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                  <p className="text-[11px] text-zinc-400 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate('/profile');
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/60 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Profile</span>
                </button>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate('/favorites');
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-zinc-300 hover:text-white hover:bg-zinc-800/60 flex items-center gap-2"
                >
                  <Music className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Favourites</span>
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate('/admin');
                    }}
                    className="w-full px-4 py-2 text-left text-xs text-brand-400 font-semibold hover:bg-brand-500/10 flex items-center gap-2"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-brand-400" />
                    <span>Admin Panel</span>
                  </button>
                )}
                <div className="my-1 border-t border-zinc-800/60" />
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                    navigate('/');
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-bold text-zinc-300 hover:text-white hover:scale-105 transition-all"
            >
              Log In
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="px-6 py-2 text-sm font-bold text-black bg-white hover:bg-zinc-100 rounded-full transition-all hover:scale-105"
            >
              Sign Up
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TopNav;
