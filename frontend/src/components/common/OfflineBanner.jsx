import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

/** A slim bar at the top while the device is offline. */
const OfflineBanner = () => {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" aria-live="polite" data-testid="offline-banner" className="flex-shrink-0 relative z-30 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-zinc-800 text-zinc-100 border-b border-white/10">
      <WifiOff className="w-4 h-4 flex-shrink-0 text-amber-300" aria-hidden="true" />
      <span>You are offline. Songs and new pages need the internet.</span>
    </div>
  );
};

export default OfflineBanner;
