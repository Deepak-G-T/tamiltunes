import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AudioProvider } from './context/AudioContext';
import MainLayout from './components/layout/MainLayout';
import PlayTracker from './components/player/PlayTracker';
import { SongActionsProvider } from './components/common/SongActionsSheet';
import LoginGate from './components/auth/LoginGate';
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
const Profile = lazy(() => import('./pages/Profile'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
const Install = lazy(() => import('./pages/Install'));
const Privacy = lazy(() => import('./pages/Privacy'));

// Lazy-loaded Admin Section (non-admins never download this code)
const AdminRoute = lazy(() => import('./components/auth/AdminRoute'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminSongs = lazy(() => import('./pages/admin/AdminSongs'));
const AdminHomeContent = lazy(() => import('./pages/admin/AdminHomeContent'));
const AdminModeration = lazy(() => import('./pages/admin/AdminModeration'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AudioProvider>
          <PlayTracker />
          <SongActionsProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public Auth & PWA Routes */}
                <Route path="/login" element={<Login />} />
                {/* Google is the only way in: the old email/password addresses (and old emailed reset links) lead to the same screen */}
                <Route path="/signup" element={<Navigate to="/login" replace />} />
                <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
                <Route path="/reset-password" element={<Navigate to="/login" replace />} />
                <Route path="/install" element={<Install />} />
                <Route path="/privacy" element={<Privacy />} />

                {/* Lazy Protected Admin Management Section */}
                <Route
                  path="/admin"
                  element={
                    <AdminRoute>
                      <AdminLayout />
                    </AdminRoute>
                  }
                >
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="songs" element={<AdminSongs />} />
                  <Route path="home-content" element={<AdminHomeContent />} />
                  <Route path="moderation" element={<AdminModeration />} />
                  <Route path="playlists" element={<AdminModeration />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>

                {/* Main Application Routes (Protected by Login-First Gate) */}
                <Route
                  path="/"
                  element={
                    <LoginGate>
                      <MainLayout />
                    </LoginGate>
                  }
                >
                  <Route index element={<Home />} />
                  <Route path="explore" element={<Explore />} />
                  <Route path="search" element={<Search />} />
                  <Route path="album/:id" element={<AlbumDetail />} />
                  <Route path="artist/:id" element={<ArtistDetail />} />
                  <Route path="playlist/:id" element={<PlaylistDetail />} />
                  <Route path="favorites" element={<Favorites />} />
                  <Route path="history" element={<History />} />
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
