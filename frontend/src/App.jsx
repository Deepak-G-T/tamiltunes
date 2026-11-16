import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AudioProvider } from './context/AudioContext';
import MainLayout from './components/layout/MainLayout';

// Pages
import Home from './pages/Home';
import Explore from './pages/Explore';
import Search from './pages/Search';
import AlbumDetail from './pages/AlbumDetail';
import ArtistDetail from './pages/ArtistDetail';
import PlaylistDetail from './pages/PlaylistDetail';
import Favorites from './pages/Favorites';
import History from './pages/History';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AudioProvider>
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AudioProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
