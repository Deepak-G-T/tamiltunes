import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Play, Pause, Disc, Clock, Heart, PlusCircle, ArrowLeft, Loader2, Music2 } from 'lucide-react';
import CoverImage from '../components/common/CoverImage';
import Equalizer from '../components/common/Equalizer';
import { useAudio } from '../context/AudioContext';
import useCoverColor from '../hooks/useCoverColor';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '3:30';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const AlbumDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { onOpenAddToPlaylist } = useOutletContext();
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const { isAuthenticated } = useAuth();

  const [album, setAlbum] = useState(null);
  const coverRgb = useCoverColor(album?.image, album?.id); // hook must stay above the early returns
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api.get(`/music/albums/${id}`)
      .then(({ data }) => {
        if (isMounted) {
          if (data.success && data.album) {
            setAlbum(data.album);
          } else {
            setError('Album details could not be loaded.');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.message || 'Failed to fetch album details.');
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
        <p className="text-xs">Loading album tracks...</p>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-zinc-400">{error || 'Album not found.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-xs font-semibold hover:bg-zinc-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  const isCurrentAlbumPlaying =
    isPlaying && album.songs?.some((s) => s.id === currentSong?.id);

  const handlePlayAlbum = () => {
    if (!album.songs || album.songs.length === 0) return;
    if (isCurrentAlbumPlaying) {
      togglePlay();
    } else {
      playSong(album.songs[0], album.songs);
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

      {/* Album Header */}
      <div style={{ '--cover-rgb': coverRgb }} className="flex flex-col md:flex-row items-center md:items-end gap-6 cover-wash-strong -mx-4 md:-mx-6 -mt-4 px-4 md:px-6 pt-10 pb-6">
        <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-md overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)] flex-shrink-0 bg-zinc-800">
          <CoverImage src={album.image} alt={album.name || album.title} className="w-full h-full object-cover" />
        </div>

        <div className="flex-1 text-center md:text-left space-y-2">
          <span className="text-xs font-bold text-white">
            Tamil Album
          </span>
          <h1 className="text-3xl sm:text-6xl font-black text-white tracking-tight leading-tight">
            {album.name || album.title}
          </h1>
          <p className="text-sm text-zinc-300 font-medium">
            Music: <span className="text-white">{album.artist || album.music || 'Various Artists'}</span>
          </p>
          <p className="text-xs text-zinc-400">
            {album.year || '2024'} • {album.songs?.length || 0} songs • Ad-Free Playback
          </p>

          <div className="pt-2">
            <button
              onClick={handlePlayAlbum}
              className="px-8 py-3 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold flex items-center gap-2 shadow-lg shadow-brand-600/30 hover:scale-105 active:scale-95 transition-all mx-auto md:mx-0"
            >
              {isCurrentAlbumPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause Album</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-black" />
                  <span>Play All Songs</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tracklist Table */}
      <div className="space-y-1">
        <div className="grid grid-cols-12 px-4 py-2 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 border-b border-white/10">
          <div className="col-span-1">#</div>
          <div className="col-span-6 sm:col-span-7">Title</div>
          <div className="col-span-3 sm:col-span-2 hidden sm:block">Movie / Album</div>
          <div className="col-span-5 sm:col-span-2 text-right flex items-center justify-end gap-1">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>

        {album.songs?.map((song, idx) => {
          const isThisSong = currentSong?.id === song.id;

          return (
            <div
              key={song.id || idx}
              onClick={() => playSong(song, album.songs)}
              className={`grid grid-cols-12 items-center px-4 py-3 rounded-md hover:bg-white/10 cursor-pointer group transition-colors ${
                isThisSong ? 'bg-white/10 text-brand-400' : 'text-zinc-300'
              }`}
            >
              <div className="col-span-1 text-xs text-zinc-500 group-hover:hidden">
                {isThisSong && isPlaying ? <Equalizer /> : idx + 1}
              </div>
              <div className="col-span-1 hidden group-hover:block">
                <Play className="w-4 h-4 text-brand-400 fill-brand-400" />
              </div>

              <div className="col-span-6 sm:col-span-7 min-w-0 pr-2">
                <p className={`text-sm font-semibold truncate ${isThisSong ? 'text-brand-400' : 'text-white'}`}>
                  {song.title}
                </p>
                <p className="text-xs text-zinc-400 truncate mt-0.5">
                  {song.artist || song.singers}
                </p>
              </div>

              <div className="col-span-3 sm:col-span-2 hidden sm:block text-xs text-zinc-400 truncate">
                {album.name || album.title}
              </div>

              <div className="col-span-5 sm:col-span-2 flex items-center justify-end gap-3 text-xs text-zinc-400">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenAddToPlaylist) onOpenAddToPlaylist(song);
                  }}
                  title="Add to playlist"
                  className="opacity-0 group-hover:opacity-100 hover:text-brand-400 transition-opacity"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
                <span className="font-mono text-[11px] tabular-nums">
                  {formatDuration(song.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AlbumDetail;
