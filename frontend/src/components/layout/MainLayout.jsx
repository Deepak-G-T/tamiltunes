import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import MobileNav from './MobileNav';
import PwaBar from '../common/PwaBar';
import MusicPlayer from '../player/MusicPlayer';
import MiniPlayer from '../player/MiniPlayer';
import CreatePlaylistModal from '../modals/CreatePlaylistModal';
import AddToPlaylistModal from '../modals/AddToPlaylistModal';

const MainLayout = () => {
  const location = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState(null);
  const [isServerWaking, setIsServerWaking] = useState(false);

  useEffect(() => {
    const handleColdStart = (e) => {
      setIsServerWaking(!!e.detail?.isWaking);
    };

    window.addEventListener('tamiltunes:server-coldstart', handleColdStart);
    return () => window.removeEventListener('tamiltunes:server-coldstart', handleColdStart);
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-black text-white overflow-hidden">
      <div className="flex flex-1 min-h-0 md:p-2 md:gap-2">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-shrink-0 h-full w-[280px] lg:w-[320px]">
        <Sidebar onOpenCreatePlaylist={() => setCreatePlaylistOpen(true)} />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative w-72 h-full bg-black p-2 z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar
              onOpenCreatePlaylist={() => {
                setMobileSidebarOpen(false);
                setCreatePlaylistOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden md:rounded-panel bg-surface-1">
        {/* Soft green wash behind the page header, like a cover-colour gradient */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 cover-wash" />
        {/* Top Navbar */}
        <TopNav onToggleMobileSidebar={() => setMobileSidebarOpen(true)} />

        <PwaBar />

        {/* Cold Start Indicator for Render Free Tier */}
        {isServerWaking && (
          <div
            role="status"
            aria-live="polite"
            className="bg-amber-950/80 border-b border-amber-500/40 text-amber-200 text-xs px-4 py-2 flex items-center justify-center gap-2.5 z-40 animate-pulse shadow-md"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
            <span className="font-medium">
              Waking up the server (Render free tier may take up to 30s)... Retrying request automatically.
            </span>
          </div>
        )}

        {/* Dynamic page content container */}
        <main className="relative flex-1 overflow-y-auto px-4 md:px-6 py-4 pb-36 md:pb-6">
          <div key={location.pathname} className="page-in">
            <Outlet context={{
              onOpenAddToPlaylist: (song) => setAddToPlaylistSong(song),
              onOpenCreatePlaylist: () => setCreatePlaylistOpen(true)
            }} />
          </div>
        </main>

        {/* Visible video surface when the YouTube engine is active */}

        {/* Mobile Mini Player */}
        <MiniPlayer />

        {/* Mobile Bottom Navigation */}
        <MobileNav />

      </div>
      </div>

      {/* Shared Audio Player Engine (full-width desktop bar + Mobile FullScreen Modal + Queue Drawer) */}
      <MusicPlayer onAddToPlaylist={(song) => setAddToPlaylistSong(song)} />

      {/* Modals */}
      <CreatePlaylistModal
        isOpen={createPlaylistOpen}
        onClose={() => setCreatePlaylistOpen(false)}
        onCreated={() => {}}
      />

      <AddToPlaylistModal
        isOpen={!!addToPlaylistSong}
        song={addToPlaylistSong}
        onClose={() => setAddToPlaylistSong(null)}
        onOpenCreatePlaylist={() => setCreatePlaylistOpen(true)}
      />
    </div>
  );
};

export default MainLayout;
