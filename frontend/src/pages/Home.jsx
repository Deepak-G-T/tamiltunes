import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import SongCard from '../components/cards/SongCard';
import AlbumCard from '../components/cards/AlbumCard';
import ArtistCard from '../components/cards/ArtistCard';
import QuickPickCard from '../components/cards/QuickPickCard';
import Shelf from '../components/common/Shelf';
import FeaturedHero from '../components/cards/FeaturedHero';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const CATEGORIES = [
  { id: 'all', label: 'All Tamil Music' },
  { id: 'trending', label: '🔥 Trending' },
  { id: 'melodies', label: '💖 Melodies' },
  { id: 'gana', label: '🪘 Film Gaana' },
  { id: '90s', label: '📻 90s Hits' },
  { id: '2000s', label: '✨ 2000s Hits' },
  { id: 'love', label: '💌 Love Songs' },
  { id: 'folk', label: '🥁 Folk & Kuthu' },
  { id: 'instrumental', label: '🎻 Instrumental' }
];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return { en: 'Good morning', ta: 'காலை வணக்கம்' };
  if (h < 17) return { en: 'Good afternoon', ta: 'மதிய வணக்கம்' };
  return { en: 'Good evening', ta: 'மாலை வணக்கம்' };
};

const Home = () => {
  const { onOpenAddToPlaylist } = useOutletContext();
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
    gana: [],
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

    // Fetch user favorite song IDs if logged in (lightweight lookup)
    if (isAuthenticated) {
      api.get('/favorites/ids')
        .then(({ data }) => {
          if (isMounted && data.success && Array.isArray(data.ids)) {
            const map = {};
            data.ids.forEach((id) => {
              map[id] = true;
            });
            setFavoritesMap(map);
          }
        })
        .catch((err) => {
          if (err.response?.status !== 401) {
            console.warn('Failed to load favorite IDs:', err);
          }
        });
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

  const songCard = (song, list) => (
    <SongCard
      key={song.id}
      song={song}
      playlist={list}
      onAddToPlaylist={onOpenAddToPlaylist}
      onToggleFavorite={toggleFavorite}
      isFavorite={!!favoritesMap[song.id]}
    />
  );

  const show = (...tabs) => activeTab === 'all' || tabs.includes(activeTab);
  const featured = (homeData.trending || [])[0];
  const quickPicks = (homeData.trending || []).slice(0, 6);
  const ganaList = homeData.gana?.length > 0 ? homeData.gana : homeData.folk;

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in duration-300">
      {/* Greeting + category pills */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{greeting().en}</h1>
          <p lang="ta" className="text-sm md:text-base font-semibold text-accent-400">{greeting().ta}</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              aria-pressed={activeTab === cat.id}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === cat.id
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Featured today: big artwork card with the first trending song */}
      {activeTab === 'all' && !loading && featured && <FeaturedHero song={featured} playlist={homeData.trending} />}

      {/* Quick picks: compact tiles that play on tap */}
      {activeTab === 'all' && (loading || quickPicks.length > 0) && (
        <section aria-label="Quick picks" className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 stagger">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-12 md:h-14 rounded-md shimmer" />
              ))
            : quickPicks.map((song) => <QuickPickCard key={song.id} song={song} playlist={homeData.trending} />)}
        </section>
      )}

      {show('trending') && (
        <Shelf title="Trending Tamil songs" subtitle="இன்றைய பிரபலப் பாடல்கள்" loading={loading} onShowAll={() => navigate('/search?q=Tamil')}>
          {homeData.trending?.slice(0, 12).map((song) => songCard(song, homeData.trending))}
        </Shelf>
      )}

      {activeTab === 'all' && (
        <Shelf title="Popular albums" subtitle="பிரபல ஆல்பங்கள்" loading={loading}>
          {(homeData.albums || homeData.popularAlbums)?.slice(0, 12).map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </Shelf>
      )}

      {activeTab === 'all' && (
        <Shelf title="Iconic composers & singers" subtitle="இசையமைப்பாளர்கள் & பாடகர்கள்" loading={loading}>
          {(homeData.artists || homeData.popularArtists)?.map((artist) => (
            <ArtistCard key={artist.id || artist.name} artist={artist} />
          ))}
        </Shelf>
      )}

      {show('90s') && (
        <Shelf title="90s golden era hits" subtitle="90களின் பொற்காலப் பாடல்கள்" loading={loading}>
          {homeData.nineties?.slice(0, 12).map((song) => songCard(song, homeData.nineties))}
        </Shelf>
      )}

      {show('2000s') && (
        <Shelf title="2000s nostalgic hits" subtitle="2000களின் நினைவுப் பாடல்கள்" loading={loading}>
          {homeData.twoThousands?.slice(0, 12).map((song) => songCard(song, homeData.twoThousands))}
        </Shelf>
      )}

      {show('melodies', 'love') && (
        <Shelf title="Heartfelt melodies & love songs" subtitle="மனம் நெகிழும் மெலடிகள்" loading={loading}>
          {homeData.melodies?.slice(0, 12).map((song) => songCard(song, homeData.melodies))}
        </Shelf>
      )}

      {show('gana') && (
        <Shelf title="Authentic film gaana hits" subtitle="கானா பாடல்கள்" loading={loading}>
          {ganaList?.slice(0, 12).map((song) => songCard(song, homeData.gana || homeData.folk))}
        </Shelf>
      )}

      {show('folk') && (
        <Shelf title="Folk & kuthu beats" subtitle="நாட்டுப்புறம் & குத்து" loading={loading}>
          {homeData.folk?.slice(0, 12).map((song) => songCard(song, homeData.folk))}
        </Shelf>
      )}
    </div>
  );
};

export default Home;
