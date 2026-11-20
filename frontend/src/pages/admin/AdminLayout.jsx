import React from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Music,
  Home,
  MessageSquare,
  ListMusic,
  Settings,
  ArrowLeft,
  Music2,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { to: '/admin', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/songs', label: 'Songs', icon: Music },
  { to: '/admin/home-content', label: 'Home Content', icon: Home },
  { to: '/admin/moderation', label: 'Moderation', icon: MessageSquare },
  { to: '/admin/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

const AdminLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const navClass = ({ isActive }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-brand-500/15 text-brand-400 font-semibold shadow-sm'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
    }`;

  const mobilePillClass = ({ isActive }) =>
    `flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
      isActive
        ? 'bg-brand-500 text-black shadow-md'
        : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col selection:bg-brand-500/30">
      {/* Top Admin Header */}
      <header className="h-16 border-b border-zinc-800/80 bg-[#09090B]/90 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center">
              <Music2 className="w-4 h-4 text-black" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">TamilTunes</span>
          </Link>
          <span className="px-2 py-0.5 rounded-md bg-brand-500/15 text-brand-400 text-xs font-bold uppercase tracking-wider border border-brand-500/30">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 border-r border-zinc-800 pr-3">
            <span>Signed in as</span>
            <span className="font-semibold text-white">{user?.name || user?.email}</span>
          </div>

          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>To Music App</span>
          </Link>
        </div>
      </header>

      {/* Mobile Horizontal Sub-Navigation */}
      <div className="md:hidden border-b border-zinc-800/80 bg-[#09090B] px-4 py-2.5 overflow-x-auto flex items-center gap-2 no-scrollbar">
        {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={mobilePillClass}>
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 md:px-8 py-6 gap-8">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 space-y-1">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider px-3 mb-2">
            Management
          </div>
          {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </aside>

        {/* Main Workspace Area */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
