import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, Search, Library, User } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { isNativeApp } from '../../lib/platform';
import { compareVersionCode } from '../../lib/appUpdate';
import { useUpdateState } from '../../lib/updateState';

const ITEMS = [
  { to: '/', end: true, label: 'Home', Icon: Home },
  { to: '/explore', label: 'Explore', Icon: Compass },
  { to: '/search', label: 'Search', Icon: Search },
  { to: '/favorites', label: 'Library', Icon: Library },
  { to: '/profile', label: 'Profile', Icon: User }
];

const MobileNav = () => {
  const update = useUpdateState();
  const updateDot = isNativeApp() && update.latest && compareVersionCode(update.installedCode, update.latest.versionCode) === 1;
  // Active = white with a green bar above the icon; inactive = grey
  const linkClass = ({ isActive }) =>
    `relative press flex flex-col items-center justify-center flex-1 py-1 gap-0.5 transition-colors ${
      isActive ? 'text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
    }`;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[var(--nav-h)] pb-[var(--safe-bottom)] bg-gradient-to-t from-black via-black/95 to-black/80 backdrop-blur-lg z-40 flex items-center justify-around px-2">
      {ITEMS.map(({ to, end, label, Icon }) => (
        <NavLink key={to} to={to} end={end} className={linkClass} onClick={() => haptic(8)}>
          {({ isActive }) => (
            <>
              {isActive && (
                <span aria-hidden="true" className="nav-pop absolute -top-0.5 h-[3px] w-8 rounded-full bg-brand-400" />
              )}
              <span className="relative">
                <Icon className={`w-6 h-6 ${isActive ? 'nav-pop' : ''}`} />
                {to === '/profile' && updateDot && <span data-testid="update-dot" role="img" aria-label="Update available" className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-brand-400 ring-2 ring-black" />}
              </span>
              <span className="text-[10px]">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
};

export default MobileNav;
