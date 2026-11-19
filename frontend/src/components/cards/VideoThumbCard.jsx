import React, { useState } from 'react';
import { Play, Video } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { youtubeThumb } from '../../lib/youtubeThumb';

/**
 * A video song as a 16:9 YouTube thumbnail (lazy loaded, the song's cover as the fallback). Nothing plays until it is tapped: then the song
 * opens in Now Playing as video (the embed loads only then). Never autoplays in a list.
 */
const VideoThumbCard = ({ song, list = null, className = '' }) => {
  const { playAsVideo } = useAudio();
  const [failed, setFailed] = useState(false);
  const thumb = youtubeThumb(song?.videoId);
  const src = !failed && thumb ? thumb : song?.image || null;
  return (
    <button type="button" onClick={() => playAsVideo(song, list)} aria-label={`Play the video of ${song.title}`} data-testid="video-thumb-card"
      className={`group press text-left w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 rounded-xl ${className}`}>
      <span className="relative block w-full aspect-video rounded-xl overflow-hidden bg-surface-3">
        {src
          ? <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
          : <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-zinc-500"><Video className="w-8 h-8" /></span>}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span aria-hidden="true" className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-brand-500 text-black flex items-center justify-center shadow-lg opacity-90 group-hover:opacity-100">
          <Play className="w-4 h-4 fill-black ml-0.5" />
        </span>
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-bold uppercase tracking-wide text-white">
          <Video className="w-3 h-3" aria-hidden="true" /> Video
        </span>
      </span>
      <span dir="auto" className="block mt-2 text-sm font-semibold text-white truncate">{song.title}</span>
      <span dir="auto" className="block text-xs text-zinc-400 truncate">{song.artist || song.singers}</span>
    </button>
  );
};

/** A row of video thumbnails (Home) or a grid (Search, artist and album pages). */
export const VideoGrid = ({ songs, title = 'Videos', testId = 'videos-section' }) => {
  if (!songs?.length) return null;
  return (
    <section aria-label={title} data-testid={testId}>
      <div className="flex items-center gap-2 mb-3">
        <Video className="w-5 h-5 text-brand-400" aria-hidden="true" />
        <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
      </div>
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {songs.map((s) => <VideoThumbCard key={s.id} song={s} list={songs} />)}
      </div>
    </section>
  );
};

export default VideoThumbCard;
