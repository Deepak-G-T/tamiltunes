import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Compass, Music } from 'lucide-react';
import { tileColor } from '../lib/tileColors';

const GENRES = [
  {
    title: 'A.R. Rahman Classics',
    query: 'A.R. Rahman',
    description: 'Isaipuyal’s timeless cinematic masterpieces'
  },
  {
    title: 'Anirudh High Energy',
    query: 'Anirudh',
    description: 'Modern chartbusters and pulsating bass'
  },
  {
    title: 'Ilaiyaraaja Magic',
    query: 'Ilaiyaraaja',
    description: 'Nostalgic orchestral compositions and melodies'
  },
  {
    title: 'Yuvan Shankar Raja Hits',
    query: 'Yuvan Shankar Raja',
    description: 'U1 youth anthems and heartbreak vibes'
  },
  {
    title: 'Harris Jayaraj Melodies',
    query: 'Harris Jayaraj',
    description: 'Romantic acoustics, guitar riffs and soulful harmonies'
  },
  {
    title: '90s Tamil Golden Hits',
    query: '90s Tamil',
    description: 'Evergreen Kollywood hits that defined a generation'
  },
  {
    title: '2000s Kollywood Nostalgia',
    query: '2000s Tamil',
    description: 'The golden age of vibrant film anthems'
  },
  {
    title: 'Tamil Folk & Gaana',
    query: 'Tamil Folk',
    description: 'Raw traditional rhythms and high-octane celebration'
  },
  {
    title: 'Soulful Midnight Melodies',
    query: 'Tamil Melody',
    description: 'Calm, soothing tunes for relaxation and focus'
  },
  {
    title: 'Acoustic & Instrumental',
    query: 'Tamil Instrumental',
    description: 'Flute, violin, and veena symphonies'
  }
];

const Explore = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div>
        <div className="flex items-center gap-2.5">
          <Compass className="w-6 h-6 text-brand-400" />
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Explore Tamil music</h1>
        </div>
        <p lang="ta" className="text-sm font-semibold text-accent-400 mt-1">தமிழ் இசையை ஆராயுங்கள்</p>
        <p className="text-xs md:text-sm text-zinc-400 max-w-xl mt-2">
          Browse by legendary composers, musical eras, high-energy dance numbers, and serene Tamil acoustics.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 stagger">
        {GENRES.map((genre, idx) => (
          <button
            key={genre.query}
            onClick={() => navigate(`/search?q=${encodeURIComponent(genre.query)}`)}
            className={`press group relative overflow-hidden rounded-lg p-3 md:p-4 min-h-[7.5rem] md:min-h-[9rem] text-left text-white hover:scale-[1.02] transition-transform focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${tileColor(idx)}`}
          >
            <span className="relative z-10 block text-base md:text-lg font-extrabold leading-tight line-clamp-2">
              {genre.title}
            </span>
            <span className="relative z-10 block text-[11px] md:text-xs text-white/85 mt-1 line-clamp-2">
              {genre.description}
            </span>
            <Music
              aria-hidden="true"
              className="absolute -bottom-3 -right-3 w-20 h-20 md:w-24 md:h-24 text-black/25 rotate-[22deg] group-hover:rotate-[12deg] transition-transform"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default Explore;
