import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Compass, Sparkles, Disc, Flame, Radio, Heart, Headphones } from 'lucide-react';

const GENRES = [
  {
    title: 'A.R. Rahman Classics',
    query: 'A.R. Rahman',
    bg: 'from-amber-600 to-rose-700',
    description: 'Isaipuyal’s timeless cinematic masterpieces'
  },
  {
    title: 'Anirudh High Energy',
    query: 'Anirudh',
    bg: 'from-violet-600 to-indigo-800',
    description: 'Modern chartbusters and pulsating bass'
  },
  {
    title: 'Ilaiyaraaja Magic',
    query: 'Ilaiyaraaja',
    bg: 'from-purple-600 to-pink-700',
    description: 'Nostalgic orchestral compositions and melodies'
  },
  {
    title: 'Yuvan Shankar Raja Hits',
    query: 'Yuvan Shankar Raja',
    bg: 'from-blue-600 to-cyan-700',
    description: 'U1 youth anthems and heartbreak vibes'
  },
  {
    title: 'Harris Jayaraj Melodies',
    query: 'Harris Jayaraj',
    bg: 'from-emerald-600 to-teal-800',
    description: 'Romantic acoustics, guitar riffs and soulful harmonies'
  },
  {
    title: '90s Tamil Golden Hits',
    query: '90s Tamil',
    bg: 'from-fuchsia-600 to-purple-800',
    description: 'Evergreen Kollywood hits that defined a generation'
  },
  {
    title: '2000s Kollywood Nostalgia',
    query: '2000s Tamil',
    bg: 'from-orange-600 to-red-800',
    description: 'The golden age of vibrant film anthems'
  },
  {
    title: 'Tamil Folk & Gaana',
    query: 'Tamil Folk',
    bg: 'from-rose-600 to-yellow-600',
    description: 'Raw traditional rhythms and high-octane celebration'
  },
  {
    title: 'Soulful Midnight Melodies',
    query: 'Tamil Melody',
    bg: 'from-indigo-700 to-slate-900',
    description: 'Calm, soothing tunes for relaxation and focus'
  },
  {
    title: 'Acoustic & Instrumental',
    query: 'Tamil Instrumental',
    bg: 'from-teal-600 to-emerald-900',
    description: 'Flute, violin, and veena symphonies'
  }
];

const Explore = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-2.5">
        <Compass className="w-6 h-6 text-purple-400" />
        <h1 className="text-2xl font-bold text-white tracking-tight">Explore Tamil Music</h1>
      </div>
      <p className="text-xs text-zinc-400 max-w-xl">
        Browse by legendary composers, musical eras, high-energy dance numbers, and serene Tamil acoustics.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
        {GENRES.map((genre, idx) => (
          <div
            key={idx}
            onClick={() => navigate(`/search?q=${encodeURIComponent(genre.query)}`)}
            className={`group relative overflow-hidden rounded-2xl p-6 h-40 bg-gradient-to-br ${genre.bg} cursor-pointer shadow-lg hover:shadow-2xl hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 border border-white/10 flex flex-col justify-between`}
          >
            <div className="relative z-10">
              <h3 className="text-lg font-bold text-white tracking-tight leading-snug group-hover:underline">
                {genre.title}
              </h3>
              <p className="text-xs text-white/80 mt-1 line-clamp-2">
                {genre.description}
              </p>
            </div>

            <div className="relative z-10 flex items-center justify-between text-white/90 text-xs font-semibold">
              <span className="group-hover:translate-x-1 transition-transform">Explore →</span>
              <Disc className="w-8 h-8 opacity-40 group-hover:rotate-45 group-hover:opacity-80 transition-all duration-300" />
            </div>

            <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Explore;
