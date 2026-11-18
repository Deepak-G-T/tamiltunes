import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import SongCard from '../components/cards/SongCard';
import AlbumCard from '../components/cards/AlbumCard';
import ArtistCard from '../components/cards/ArtistCard';
import RadioMixCard from '../components/cards/RadioMixCard';
import SpeedDial from '../components/home/SpeedDial';
import Shelf from '../components/common/Shelf';
import FeaturedHero from '../components/cards/FeaturedHero';
import { useAuth } from '../context/AuthContext';
import { useSpeedDial } from '../hooks/useSpeedDial';
import { useStartRadio } from '../hooks/useStartRadio';
import { useHomeFeed } from '../hooks/useHomeFeed';
import { setShownOnHome } from '../lib/shownOnHome';
import { ErrorState } from '../components/common/StateViews';
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
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const Home = () => {
  const { onOpenAddToPlaylist } = useOutletContext();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const startRadio = useStartRadio();
  const firstName = (user?.name || '').trim().split(/\s+/)[0];

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

  // popular songs that fill empty Speed Dial slots: trending first, then melodies, gaana, 90s, 2000s, folk
  const fillPool = useMemo(() => {
    const seen = new Set();
    return ['trending', 'melodies', 'gana', 'nineties', 'twoThousands', 'folk']
      .flatMap((k) => homeData[k] || [])
      .filter((s) => s?.id && s.streamUrl && !seen.has(s.id) && seen.add(s.id));
  }, [homeData]);
  const speedDial = useSpeedDial({ trending: fillPool });

  // Everything below Speed Dial comes from one request, so no song is shown twice. It waits for Speed Dial so those songs can be left out.
  const speedReady = !loading && speedDial.status !== 'loading';
  const feed = useHomeFeed({ tab: activeTab, ready: speedReady, excludeIds: activeTab === 'all' ? speedDial.items.map((i) => i.id) : [] }); // Speed Dial is only shown on "All"

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

  // Radio mixes start a radio from your three most-played songs (a different row from "Made for you")
  const mixSeeds = speedDial.items.filter((i) => i.source === 'played' && i.hot).slice(0, 3);
  const feedLoading = feed.status === 'loading';
  // The radio keeps what this page shows out of its suggestions
  useEffect(() => {
    const ids = [feed.hero?.id, ...speedDial.items.map((i) => i.id), ...feed.sections.flatMap((sec) => (sec.kind === 'songs' ? sec.items.map((x) => x.id) : []))];
    setShownOnHome(ids);
  }, [feed.hero, feed.sections, speedDial.items]);

  const renderSection = (section) => {
    if (section.kind === 'artists') {
      return (
        <Shelf key={section.id} title={section.title}>
          {section.items.map((artist) => <ArtistCard key={artist.id || artist.name} artist={artist} />)}
        </Shelf>
      );
    }
    if (section.kind === 'albums') {
      return (
        <Shelf key={section.id} title={section.title}>
          {section.items.slice(0, 12).map((album) => <AlbumCard key={album.id} album={album} />)}
        </Shelf>
      );
    }
    return (
      <React.Fragment key={section.id}>
        {section.id === 'trending' && mixSeeds.length > 0 && (
          <Shelf title="Radio mixes">
            {mixSeeds.map((song) => <RadioMixCard key={song.id} song={song} onStart={startRadio} />)}
          </Shelf>
        )}
        <Shelf title={section.title} onShowAll={section.id === 'trending' ? () => navigate('/search?q=Tamil') : undefined}>
          {section.items.map((song) => songCard(song, section.items))}
        </Shelf>
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in duration-300">
      {/* Greeting + category pills */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight" dir="auto">
            Hello{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm md:text-base font-semibold text-accent-400">
            {greeting()}
          </p>
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

      {/* Speed dial: your most-played songs, one tap away (replaces the old Quick picks grid) */}
      {activeTab === 'all' && <SpeedDial {...speedDial} loadingHome={loading} />}

      {/* Featured today: one trending song, never repeated in a shelf below */}
      {activeTab === 'all' && feed.hero && <FeaturedHero song={feed.hero} playlist={[feed.hero]} />}

      {/* All other shelves, assembled together (no song twice). Fixed-height placeholders while loading: nothing jumps. */}
      {feedLoading && [0, 1, 2].map((i) => <Shelf key={`sk-${i}`} title="" loading />)}
      {feed.status === 'error' && <ErrorState compact message="Could not load the home page shelves." onRetry={feed.retry} />}
      {!feedLoading && feed.sections.map(renderSection)}
      {feed.status === 'ready' && feed.sections.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-400">Nothing new to show right now. Try searching for a song or artist.</p>
      )}
    </div>
  );
};

export default Home;
