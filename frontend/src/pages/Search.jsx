import React, { useState, useEffect } from 'react';
import { useSearchParams, useOutletContext, useNavigate } from 'react-router-dom';
import { Search as SearchIcon, X, Loader2, Music, Disc, User, Sparkles, Clock } from 'lucide-react';
import SongCard from '../components/cards/SongCard';
import AlbumCard from '../components/cards/AlbumCard';
import ArtistCard from '../components/cards/ArtistCard';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const POPULAR_SEARCHES = [
  'Leo', 'Jailer', 'Master', 'Anirudh', 'AR Rahman', 'Ilaiyaraaja',
  'Harris Jayaraj', 'Yuvan Shankar Raja', 'Sid Sriram', 'Ponniyin Selvan', 'Kantara', 'Vikram'
];

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const { onOpenAddToPlaylist } = useOutletContext();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState(queryParam);
  const [debouncedTerm, setDebouncedTerm] = useState(queryParam);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'songs' | 'albums' | 'artists'
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({ songs: [], albums: [], artists: [] });
  const [error, setError] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('tamiltunes_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Debounce input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm);
      if (searchTerm.trim()) {
        setSearchParams({ q: searchTerm.trim() });
      } else {
        setSearchParams({});
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchTerm, setSearchParams]);

  // Execute search when debounced term changes
  useEffect(() => {
    if (!debouncedTerm.trim()) {
      setResults({ songs: [], albums: [], artists: [] });
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    // Save to recent searches
    setRecentSearches((prev) => {
      const clean = prev.filter((s) => s.toLowerCase() !== debouncedTerm.toLowerCase());
      const updated = [debouncedTerm, ...clean].slice(0, 8);
      localStorage.setItem('tamiltunes_recent_searches', JSON.stringify(updated));
      return updated;
    });

    api.get('/music/search', {
      params: {
        query: debouncedTerm,
        type: activeFilter
      }
    })
      .then(({ data }) => {
        if (isMounted) {
          if (data.success) {
            setResults(data.data || { songs: [], albums: [], artists: [] });
          } else {
            setError(data.message || 'No results found');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError('Search failed. Please check network connection or try again.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedTerm, activeFilter]);

  const handleClear = () => {
    setSearchTerm('');
    setDebouncedTerm('');
    setSearchParams({});
    setResults({ songs: [], albums: [], artists: [] });
  };

  const removeRecentSearch = (itemToRemove, e) => {
    e.stopPropagation();
    const updated = recentSearches.filter((s) => s !== itemToRemove);
    setRecentSearches(updated);
    localStorage.setItem('tamiltunes_recent_searches', JSON.stringify(updated));
  };

  const hasResults =
    (results.songs && results.songs.length > 0) ||
    (results.albums && results.albums.length > 0) ||
    (results.artists && results.artists.length > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Search Input Bar */}
      <div className="relative max-w-2xl">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-zinc-400">
          <SearchIcon className="w-5 h-5 text-purple-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search Tamil songs, movies, singers, music directors, albums..."
          className="w-full pl-12 pr-10 py-3.5 rounded-full bg-[#18181B] border border-zinc-700/80 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 shadow-lg transition-all"
        />
        {searchTerm && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      {debouncedTerm && (
        <div className="flex items-center gap-2">
          {['all', 'songs', 'albums', 'artists'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                activeFilter === tab
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center text-zinc-400 gap-3">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          <p className="text-xs">Searching Tamil catalog...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs text-center">
          {error}
        </div>
      )}

      {/* Results View */}
      {!loading && debouncedTerm && hasResults && (
        <div className="space-y-8">
          {/* Songs Section */}
          {(activeFilter === 'all' || activeFilter === 'songs') && results.songs?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Music className="w-4 h-4 text-purple-400" />
                <h3 className="text-base font-bold text-white">Songs</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.songs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    playlist={results.songs}
                    onAddToPlaylist={onOpenAddToPlaylist}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Albums Section */}
          {(activeFilter === 'all' || activeFilter === 'albums') && results.albums?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Disc className="w-4 h-4 text-violet-400" />
                <h3 className="text-base font-bold text-white">Albums</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {results.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </div>
          )}

          {/* Artists Section */}
          {(activeFilter === 'all' || activeFilter === 'artists') && results.artists?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-pink-400" />
                <h3 className="text-base font-bold text-white">Artists</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.artists.map((artist) => (
                  <ArtistCard key={artist.id || artist.name} artist={artist} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State when searched but nothing returned */}
      {!loading && debouncedTerm && !hasResults && !error && (
        <div className="py-16 text-center text-zinc-400 space-y-2">
          <p className="text-base font-semibold text-white">No results found for "{debouncedTerm}"</p>
          <p className="text-xs">
            Try searching for a different song name, movie, singer, or Tamil composer like "Anirudh", "AR Rahman", or "Ilaiyaraaja".
          </p>
        </div>
      )}

      {/* Default State: Popular tags & Recent Searches */}
      {!debouncedTerm && (
        <div className="space-y-6 pt-2">
          {recentSearches.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>Recent Searches</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSearchTerm(item)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 text-xs text-zinc-300 hover:text-white cursor-pointer transition-colors"
                  >
                    <span>{item}</span>
                    <button
                      onClick={(e) => removeRecentSearch(item, e)}
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Trending Searches</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SEARCHES.map((term, idx) => (
                <button
                  key={idx}
                  onClick={() => setSearchTerm(term)}
                  className="px-3.5 py-1.5 rounded-full bg-zinc-900 hover:bg-purple-600 hover:text-white border border-zinc-800 text-xs text-zinc-300 transition-all"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;
