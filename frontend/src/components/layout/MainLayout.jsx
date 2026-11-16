import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import MobileNav from './MobileNav';
import MusicPlayer from '../player/MusicPlayer';
import MiniPlayer from '../player/MiniPlayer';
import CreatePlaylistModal from '../modals/CreatePlaylistModal';
import AddToPlaylistModal from '../modals/AddToPlaylistModal';

const MainLayout = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState(null);

  return (
    <div className="flex h-screen w-screen bg-[#09090B] text-white overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-shrink-0 h-full">
        <Sidebar onOpenCreatePlaylist={() => setCreatePlaylistOpen(true)} />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative w-64 h-full bg-[#111114] z-10 shadow-2xl animate-in slide-in-from-left duration-200">
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
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Navbar */}
        <TopNav onToggleMobileSidebar={() => setMobileSidebarOpen(true)} />

        {/* Dynamic page content container */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 pb-36 md:pb-28">
          <Outlet context={{
            onOpenAddToPlaylist: (song) => setAddToPlaylistSong(song),
            onOpenCreatePlaylist: () => setCreatePlaylistOpen(true)
          }} />
        </main>

        {/* Mobile Mini Player */}
        <MiniPlayer />

        {/* Mobile Bottom Navigation */}
        <MobileNav />

        {/* Desktop Fixed Bottom Player */}
        <div className="hidden md:block">
          <MusicPlayer />
        </div>
      </div>

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
