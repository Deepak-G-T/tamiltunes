import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ListPlus,
  Share2,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  ListMusic,
  Heart,
  Disc,
  MessageCircle,
  MoreHorizontal,
  Maximize,
  Settings2
} from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import ProgressBar from './ProgressBar';
import VolumeSlider from './VolumeSlider';
import VideoSlot from './VideoSlot';
import { enterVideoFullscreen } from '../../lib/videoFullscreen';
import VideoSettings from './VideoSettings';
import VideoModeToggle from './VideoModeToggle';
import ScreenLockNotice from './ScreenLockNotice';
import CommentsPanel from '../comments/CommentsPanel';
import QueueContent from './queue/QueueContent';
import MarqueeText from '../common/MarqueeText';
import { useSongActions } from '../common/SongActionsSheet';
import { useSwipe } from '../../lib/swipe';
import { haptic } from '../../lib/haptics';
import { canShare as canShareLink, shareLink } from '../../lib/share';
import { SITE_URL } from '../../config/app';
import { getUpNext } from '../../lib/upNext';

const MUSIC_COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' rx='16' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%231db954' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const FullScreenPlayer = ({ isOpen, onClose: onCloseProp, onToggleFavorite, isFavorite, onAddToPlaylist }) => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isBuffering,
    playbackError,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    previousTrack,
    isShuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeat,
    activeEngine,
    canToggleVideo,
    videoBlocked,
    queue,
    queueIndex,
    queueSections
  } = useAudio();

  // The full source name: the playlist or album being played, or the radio and what it started from
  const sourceName = (() => {
    const label = queueSections?.nextFrom?.label || '';
    if (queueSections?.mode === 'context' && label.startsWith('Next from ')) return label.slice('Next from '.length);
    return currentSong?.album ? `Radio · ${currentSong.album}` : 'TamilTunes';
  })();

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [view, setView] = useState('player'); // 'player' | 'queue' (the Queue tab inside Now Playing)
  const songActions = useSongActions();
  const [showVideoSettings, setShowVideoSettings] = useState(false);
  useEffect(() => { if (!isOpen) setView('player'); }, [isOpen]);
  // Every way of closing the player also closes the comments sheet
  const onClose = () => { setCommentsOpen(false); onCloseProp(); };

  // Lock body scroll when full screen player is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Swipe down (artwork or top bar) closes; swipe left/right on the artwork = next/previous song.
  // Never attached to the sliders or buttons, so they keep working normally.
  const artSwipe = useSwipe({
    onSwipeDown: () => {
      haptic(10);
      onClose();
    },
    onSwipeLeft: () => {
      haptic(10);
      nextTrack();
    },
    onSwipeRight: () => {
      haptic(10);
      previousTrack();
    }
  });
  const topSwipe = useSwipe({
    onSwipeDown: () => {
      haptic(10);
      onClose();
    }
  });

  const upNext = getUpNext(queue, queueIndex, { isShuffle, repeatMode });
  const canShare = canShareLink();

  const shareSong = async () => {
    haptic(10);
    await shareLink({
      title: currentSong.title,
      text: `${currentSong.title} – ${currentSong.artist || currentSong.singers || ''}`.trim(),
      url: SITE_URL,
    });
  };

  if (!isOpen || !currentSong) return null;

  const content = (
    <div
      style={{ zIndex: 99999 }}
      className="fixed inset-0 bg-black flex flex-col justify-between p-4 sm:p-8 select-none overflow-y-auto overflow-x-hidden animate-in fade-in duration-200"
    >
      {/* Cover-colour wash (follows the artwork) */}
      <div aria-hidden="true" className="fixed inset-0 cover-wash-strong pointer-events-none" />

      {/* Blurred ambient background effect */}
      <div
        className="fixed inset-0 opacity-20 filter blur-3xl pointer-events-none scale-125"
        style={{
          backgroundImage: `url(${currentSong.image || MUSIC_COVER_FALLBACK})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
      />

      {/* Top Bar with Down Chevron to close */}
      <div
        className="relative z-10 flex items-center justify-between pb-2"
        onTouchStart={topSwipe.onTouchStart}
        onTouchEnd={topSwipe.onTouchEnd}
        onTouchCancel={topSwipe.onTouchCancel}
      >
        <button
          onClick={onClose}
          aria-label="Close now playing"
          className="p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all active:scale-90"
        >
          <ChevronDown className="w-7 h-7" />
        </button>

        <div className="text-center px-2 min-w-0">
          <p className="text-[10px] sm:text-xs uppercase tracking-widest text-zinc-500 font-semibold">Playing from</p>
          <MarqueeText text={sourceName} className="text-xs sm:text-sm uppercase tracking-widest text-zinc-300 font-semibold" />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => songActions.open(currentSong, { onAddToPlaylist })}
            aria-label="More actions for this song"
            aria-haspopup="menu"
            className="p-2.5 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all active:scale-90"
          >
            <MoreHorizontal className="w-6 h-6" />
          </button>
          <button
            onClick={() => setView((v) => (v === 'queue' ? 'player' : 'queue'))}
            aria-label={view === 'queue' ? 'Show now playing' : 'Open queue'}
            aria-pressed={view === 'queue'}
            className={`p-2.5 rounded-full transition-all active:scale-90 ${view === 'queue' ? 'bg-brand-500 text-black' : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white'}`}
          >
            <ListMusic className="w-6 h-6" />
          </button>
        </div>
      </div>

      {view === 'queue' && (
        <div data-testid="fs-queue" className="fixed inset-x-0 bottom-0 top-[4.75rem] z-20 bg-black/80 backdrop-blur-md">
          <div className="h-full max-w-2xl mx-auto">
            <QueueContent embedded />
          </div>
        </div>
      )}

      {/* Center Artwork & Metadata */}
      <div className="relative z-10 flex flex-col items-center justify-center my-auto max-w-sm sm:max-w-md mx-auto w-full py-4">
        {/* Video surface (YouTube engine active) or album cover */}
        {activeEngine === 'youtube' && (
          <>
            {/* 16:9 space reserved before the video loads, so nothing jumps */}
            <VideoSlot className="w-full aspect-video mb-2 shadow-2xl border border-zinc-800/80" />
            <button type="button" onClick={() => enterVideoFullscreen()} aria-label="Full screen video" data-testid="video-fullscreen"
              className="press self-end mb-4 inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10">
              <Maximize className="w-4 h-4" aria-hidden="true" /> Full screen
            </button>
          </>
        )}
        {activeEngine !== 'youtube' && (
        <div
          key={currentSong.id}
          className="relative w-[min(70vw,20rem,34svh)] h-[min(70vw,20rem,34svh)] mb-5 art-in"
          data-testid="fs-artwork"
          style={{ touchAction: 'none' }}
          onTouchStart={artSwipe.onTouchStart}
          onTouchEnd={artSwipe.onTouchEnd}
          onTouchCancel={artSwipe.onTouchCancel}
        >
          <div aria-hidden="true" className={`cover-glow absolute -inset-10 pointer-events-none ${isPlaying ? 'breathe' : ''}`} />
          <div
            aria-hidden="true"
            data-testid="vinyl"
            className={`vinyl absolute top-1/2 -translate-y-1/2 right-[-16%] w-[92%] h-[92%] rounded-full shadow-[0_12px_32px_rgba(0,0,0,0.6)] ${isPlaying ? 'vinyl-spin' : ''}`}
          />
          <div className="relative w-full h-full rounded-lg overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.7)] group bg-surface-3">
          <img
            src={currentSong.image || MUSIC_COVER_FALLBACK}
            alt={currentSong.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = MUSIC_COVER_FALLBACK;
            }}
            className={`w-full h-full object-cover transition-transform duration-500 ${
              isPlaying ? 'scale-105' : 'scale-100'
            }`}
          />
          {isBuffering && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          </div>
        </div>
        )}

        {(canToggleVideo || videoBlocked) && (
          <div className="flex items-center gap-2 mb-4">
            <VideoModeToggle />
            <button type="button" onClick={() => setShowVideoSettings((v) => !v)} aria-expanded={showVideoSettings} aria-label="Video settings" data-testid="video-settings-button"
              className="press w-11 h-11 inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10">
              <Settings2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {showVideoSettings && (canToggleVideo || videoBlocked) && (
          <div className="w-full mb-4 rounded-xl bg-black/40 border border-white/10 px-4"><VideoSettings /></div>
        )}
        <ScreenLockNotice song={currentSong} engine={activeEngine} className="mb-4 px-1" />

        {/* Title, Artist, & Favorite */}
        <div className="w-full flex items-start justify-between mb-3 px-1">
          <div className="min-w-0 flex-1 mr-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white line-clamp-2 tracking-tight leading-tight">
              {currentSong.title}
            </h2>
            <p className="text-sm font-medium text-zinc-300 line-clamp-2 mt-1">
              {currentSong.artist || currentSong.singers}
            </p>
            {currentSong.album && (
              <span className="inline-flex max-w-full mt-2 px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-300 text-xs font-semibold">
                <span className="truncate">{currentSong.album}</span>
              </span>
            )}
          </div>
          {onToggleFavorite && (
            <button
              onClick={() => {
                haptic(12);
                onToggleFavorite(currentSong);
              }}
              aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={!!isFavorite}
              className="p-3 -mt-1 rounded-full hover:bg-white/10 active:scale-90 transition-transform"
            >
              <Heart
                key={isFavorite ? 'on' : 'off'}
                className={`w-7 h-7 transition-colors ${
                  isFavorite ? 'fill-brand-500 text-brand-500 heart-pop' : 'text-zinc-300 hover:text-white'
                }`}
              />
            </button>
          )}
        </div>

        {/* Playback error (the stream/licence provider text that used to be here was removed) */}
        {playbackError && (
          <div className="w-full mb-3 px-1" role="status">
            <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2">{playbackError}</p>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="relative z-10 max-w-sm sm:max-w-md mx-auto w-full pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Scrubber */}
        <div className="mb-5">
          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            isBuffering={isBuffering}
          />
        </div>

        {/* Transport controls */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={toggleShuffle}
            aria-label={`Shuffle ${isShuffle ? 'On' : 'Off'}`}
            className={`p-2.5 transition-colors active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
              isShuffle ? 'text-brand-400' : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              haptic(10);
              previousTrack();
            }}
            aria-label="Previous track"
            className="p-2.5 text-zinc-300 hover:text-white active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none transition-all"
          >
            <SkipBack className="w-7 h-7" />
          </button>

          <button
            onClick={() => {
              haptic(12);
              togglePlay();
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            data-testid="fs-play"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-16 h-16 rounded-full bg-white hover:bg-zinc-100 text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none transition-all"
          >
            {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>

          <button
            onClick={() => {
              haptic(10);
              nextTrack();
            }}
            aria-label="Next track"
            className="p-2.5 text-zinc-300 hover:text-white active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none transition-all"
          >
            <SkipForward className="w-7 h-7" />
          </button>

          <button
            onClick={toggleRepeat}
            aria-label={`Repeat: ${repeatMode}`}
            className={`p-2.5 transition-colors active:scale-90 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none ${
              repeatMode !== 'off' ? 'text-brand-400' : 'text-zinc-500 hover:text-white'
            }`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
          </button>
        </div>

        {/* Quick actions */}
        {(
          <div className="flex items-center justify-center gap-8 mb-3 text-zinc-300">
            <button
              onClick={() => {
                haptic(10);
                setCommentsOpen(true);
              }}
              aria-label="Open comments"
              data-testid="open-comments"
              className="flex flex-col items-center gap-1 text-[11px] hover:text-white active:scale-90 transition-transform"
            >
              <MessageCircle className="w-6 h-6" />
              <span className="[@media(max-height:700px)]:hidden">Comments</span>
            </button>
            {onAddToPlaylist && (
              <button
                onClick={() => {
                  haptic(10);
                  onClose(); // the playlist dialog sits below this full-screen layer
                  onAddToPlaylist(currentSong);
                }}
                aria-label="Add to playlist"
                className="flex flex-col items-center gap-1 text-[11px] hover:text-white active:scale-90 transition-transform"
              >
                <ListPlus className="w-6 h-6" />
                <span className="[@media(max-height:700px)]:hidden">Playlist</span>
              </button>
            )}
            {canShare && (
              <button
                onClick={shareSong}
                aria-label="Share song"
                className="flex flex-col items-center gap-1 text-[11px] hover:text-white active:scale-90 transition-transform"
              >
                <Share2 className="w-6 h-6" />
                <span className="[@media(max-height:700px)]:hidden">Share</span>
              </button>
            )}
          </div>
        )}

        {/* Up next */}
        {upNext && (
          <button
            onClick={() => {
              haptic(10);
              nextTrack();
            }}
            aria-label={`Up next: ${upNext.title}`}
            data-testid="up-next"
            className="w-full flex items-center gap-3 p-2 mb-3 rounded-lg bg-white/10 hover:bg-white/15 active:scale-[0.98] transition text-left [@media(max-height:700px)]:hidden"
          >
            <img
              src={upNext.image || MUSIC_COVER_FALLBACK}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = MUSIC_COVER_FALLBACK;
              }}
              className="w-10 h-10 rounded object-cover flex-shrink-0 bg-surface-3"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-wider font-bold text-accent-300">Up next</span>
              <span className="block text-sm font-semibold text-white truncate">{upNext.title}</span>
              <span className="block text-xs text-zinc-400 truncate">{upNext.artist || upNext.singers}</span>
            </span>
            <SkipForward className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          </button>
        )}

        {/* Volume */}
        <div className="hidden sm:flex justify-center pb-2">
          <VolumeSlider
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={setVolume}
            onToggleMute={toggleMute}
          />
        </div>
      </div>
    </div>
  );

  const withComments = (
    <>
      {content}
      <CommentsPanel
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onNavigate={onClose}
        song={currentSong}
      />
    </>
  );

  return typeof document !== 'undefined' ? createPortal(withComments, document.body) : withComments;
};

export default FullScreenPlayer;
