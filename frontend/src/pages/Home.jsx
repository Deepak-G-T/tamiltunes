import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Play, Sparkles, Flame, Radio, Heart, Disc, Award, Headphones, ArrowRight } from 'lucide-react';
import SongCard from '../components/cards/SongCard';
import AlbumCard from '../components/cards/AlbumCard';
import ArtistCard from '../components/cards/ArtistCard';
import { useAudio } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const CATEGORIES = [
  { id: 'all', label: 'All Tamil Music' },
  { id: 'trending', label: '🔥 Trending' },
  { id: 'melodies', label: '💖 Melodies' },
  { id: '90s', label: '📻 90s Hits' },
  { id: '2000s', label: '✨ 2000s Hits' },
  { id: 'love', label: '💌 Love Songs' },
  { id: 'folk', label: '🥁 Folk & Kuthu' },
  { id: 'instrumental', label: '🎻 Instrumental' }
];

const Home = () => {
  const { onOpenAddToPlaylist } = useOutletContext();
  const { playSong } = useAudio();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [homeData, setHomeData] = useState({
    trending: [],
    albums: [],
    artists: [],
    nineties: [],
    twoThousands: [],
    melodies: [],
    folk: []
  });
  const [favoritesMap, setFavoritesMap] = useState({});

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    // Fetch home data from backend music service
    api.get('/music/home')
      .then(({ data }) => {
        if (isMounted && data.success) {
          setHomeData(data.data);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch /music/home, using cached curated catalog:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // Fetch user favorites if logged in
    if (isAuthenticated) {
      api.get('/favorites')
        .then(({ data }) => {
          if (isMounted && data.success && Array.isArray(data.favorites)) {
            const map = {};
            data.favorites.forEach((f) => {
              map[f.songId || f.id] = true;
            });
            setFavoritesMap(map);
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const toggleFavorite = async (song) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const isFav = !!favoritesMap[song.id];
    try {
      if (isFav) {
        await api.delete(`/favorites/${song.id}`);
        setFavoritesMap((prev) => ({ ...prev, [song.id]: false }));
      } else {
        await api.post('/favorites', {
          songId: song.id,
          title: song.title,
          artist: song.artist || song.singers,
          album: song.album,
          image: song.image,
          duration: song.duration,
          streamUrl: song.streamUrl
        });
        setFavoritesMap((prev) => ({ ...prev, [song.id]: true }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Showcase Banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-purple-900/50 via-violet-950/40 to-zinc-900 border border-purple-500/20 p-6 md:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Pure Tamil Audio & High Fidelity</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight mb-3">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-violet-200">TamilTunes</span>
          </h1>
          <p className="text-sm md:text-base text-zinc-300 leading-relaxed mb-6 font-normal">
            Stream your favorite Kollywood blockbusters, legendary 90s melodies, soulful acoustic instrumentals, and contemporary chartbusters. Completely ad-free.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {homeData.trending?.[0] && (
              <button
                onClick={() => playSong(homeData.trending[0], homeData.trending)}
                className="px-6 py-3 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-purple-600/40 hover:scale-105 active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Play Trending Now</span>
              </button>
            )}
            <button
              onClick={() => navigate('/explore')}
              className="px-6 py-3 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold flex items-center gap-2 border border-zinc-700/60 transition-colors"
            >
              <span>Explore Genres</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id)}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === cat.id
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Section: Trending Tamil Music */}
      {(activeTab === 'all' || activeTab === 'trending') && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">Trending Tamil Songs</h2>
            </div>
            <button
              onClick={() => navigate('/search?q=Tamil')}
              className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {homeData.trending?.slice(0, 10).map((song) => (
              <SongCard
                key={song.id}
                song={song}
                playlist={homeData.trending}
                onAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={toggleFavorite}
                isFavorite={!!favoritesMap[song.id]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section: Popular Tamil Albums */}
      {activeTab === 'all' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Disc className="w-5 h-5 text-violet-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">Popular Tamil Albums</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {homeData.albums?.slice(0, 5).map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      {/* Section: Iconic Tamil Artists & Composers */}
      {activeTab === 'all' && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">Iconic Composers & Singers</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {homeData.artists?.map((artist) => (
              <ArtistCard key={artist.id || artist.name} artist={artist} />
            ))}
          </div>
        </section>
      )}

      {/* Section: 90s Golden Era */}
      {(activeTab === 'all' || activeTab === '90s') && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-rose-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">90s Golden Era Tamil Hits</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {homeData.nineties?.slice(0, 5).map((song) => (
              <SongCard
                key={song.id}
                song={song}
                playlist={homeData.nineties}
                onAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={toggleFavorite}
                isFavorite={!!favoritesMap[song.id]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section: 2000s Kollywood Nostalgia */}
      {(activeTab === 'all' || activeTab === '2000s') && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Headphones className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">2000s Nostalgic Hits</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {homeData.twoThousands?.slice(0, 5).map((song) => (
              <SongCard
                key={song.id}
                song={song}
                playlist={homeData.twoThousands}
                onAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={toggleFavorite}
                isFavorite={!!favoritesMap[song.id]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section: Soulful Melodies */}
      {(activeTab === 'all' || activeTab === 'melodies' || activeTab === 'love') && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-400" />
              <h2 className="text-xl font-bold text-white tracking-tight">Heartfelt Melodies & Love Songs</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {homeData.melodies?.slice(0, 5).map((song) => (
              <SongCard
                key={song.id}
                song={song}
                playlist={homeData.melodies}
                onAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={toggleFavorite}
                isFavorite={!!favoritesMap[song.id]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Section: Folk & Traditional Beats */}
      {(activeTab === 'all' || activeTab === 'folk') && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🥁</span>
              <h2 className="text-xl font-bold text-white tracking-tight">Folk & Kuthu Beats</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {homeData.folk?.slice(0, 5).map((song) => (
              <SongCard
                key={song.id}
                song={song}
                playlist={homeData.folk}
                onAddToPlaylist={onOpenAddToPlaylist}
                onToggleFavorite={toggleFavorite}
                isFavorite={!!favoritesMap[song.id]}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;
