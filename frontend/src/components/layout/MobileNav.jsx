import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Search, Library } from 'lucide-react';

const MobileNav = () => {
  const linkClass = ({ isActive }) =>
    `flex flex-col items-center justify-center flex-1 py-1 transition-colors ${
      isActive ? 'text-brand-400 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
    }`;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-1/95 backdrop-blur-lg border-t border-zinc-800/80 z-40 flex items-center justify-around px-2 pb-safe">
      <NavLink to="/" end className={linkClass}>
        <Home className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Home</span>
      </NavLink>

      <NavLink to="/explore" className={linkClass}>
        <Compass className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Explore</span>
      </NavLink>

      <NavLink to="/search" className={linkClass}>
        <Search className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Search</span>
      </NavLink>

      <NavLink to="/favorites" className={linkClass}>
        <Library className="w-5 h-5 mb-0.5" />
        <span className="text-[10px]">Library</span>
      </NavLink>
    </nav>
  );
};

export default MobileNav;
