import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AudioProvider } from './context/AudioContext';
import MainLayout from './components/layout/MainLayout';
import PlayTracker from './components/player/PlayTracker';
import { SongActionsProvider } from './components/common/SongActionsSheet';
import { Loader2 } from 'lucide-react';

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh] text-brand-400">
    <Loader2 className="w-8 h-8 animate-spin" />
  </div>
);

// Code-split routes via React.lazy for optimized bundle performance
const Home = lazy(() => import('./pages/Home'));
const Explore = lazy(() => import('./pages/Explore'));
const Search = lazy(() => import('./pages/Search'));
const AlbumDetail = lazy(() => import('./pages/AlbumDetail'));
const ArtistDetail = lazy(() => import('./pages/ArtistDetail'));
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail'));
const Favorites = lazy(() => import('./pages/Favorites'));
const History = lazy(() => import('./pages/History'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Profile = lazy(() => import('./pages/Profile'));
const UserProfile = lazy(() => import('./pages/UserProfile'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AudioProvider>
          <PlayTracker />
          <SongActionsProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Home />} />
                <Route path="explore" element={<Explore />} />
                <Route path="search" element={<Search />} />
                <Route path="album/:id" element={<AlbumDetail />} />
                <Route path="artist/:id" element={<ArtistDetail />} />
                <Route path="playlist/:id" element={<PlaylistDetail />} />
                <Route path="favorites" element={<Favorites />} />
                <Route path="history" element={<History />} />
                <Route path="login" element={<Login />} />
                <Route path="signup" element={<Signup />} />
                <Route path="profile" element={<Profile />} />
                <Route path="u/:username" element={<UserProfile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
          </SongActionsProvider>
        </AudioProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
