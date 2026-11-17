import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Play, Pause, Heart, ArrowLeft, Loader2, Music2, Disc } from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import SongCard from '../components/cards/SongCard';
import AlbumCard from '../components/cards/AlbumCard';
import api from '../services/api';

const ArtistDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { onOpenAddToPlaylist } = useOutletContext();
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const { isAuthenticated } = useAuth();

  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.get(`/music/artists/${id}`)
      .then(({ data }) => {
        if (isMounted) {
          if (data.success && data.artist) {
            setArtist(data.artist);
          } else {
            setError('Artist details could not be found.');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.message || 'Failed to fetch artist details.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-400 gap-3">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="text-xs">Loading artist profile...</p>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-zinc-400">{error || 'Artist not found.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-xs font-semibold hover:bg-zinc-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  const handlePlayTopTracks = () => {
    if (artist.topSongs && artist.topSongs.length > 0) {
      playSong(artist.topSongs[0], artist.topSongs);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Artist Hero Header */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-brand-950/60 to-zinc-900 border border-zinc-800 p-6 md:p-8 flex flex-col sm:flex-row items-center gap-6 shadow-2xl">
        <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden shadow-2xl border-2 border-brand-500/30 flex-shrink-0 bg-zinc-800">
          <img
            src={artist.image || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80'}
            alt={artist.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80';
            }}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-brand-400">
            Verified Tamil Artist
          </span>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            {artist.name}
          </h1>
          <p className="text-xs text-zinc-300">
            {artist.role || 'Music Director & Singer'} • {artist.topSongs?.length || 0} Popular Tracks
          </p>

          <div className="pt-2">
            <button
              onClick={handlePlayTopTracks}
              className="px-6 py-2.5 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold flex items-center gap-2 shadow-lg shadow-brand-600/30 hover:scale-105 active:scale-95 transition-all mx-auto sm:mx-0"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Play Popular Tracks</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Songs */}
      {artist.topSongs?.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Music2 className="w-5 h-5 text-brand-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Popular Songs</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {artist.topSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                playlist={artist.topSongs}
                onAddToPlaylist={onOpenAddToPlaylist}
              />
            ))}
          </div>
        </section>
      )}

      {/* Albums Discography */}
      {artist.albums?.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Disc className="w-5 h-5 text-brand-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Discography & Albums</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {artist.albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ArtistDetail;
