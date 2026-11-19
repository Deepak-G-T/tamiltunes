import React, { useId } from 'react';
import { useAudio } from '../../context/AudioContext';

const Switch = ({ label, hint, checked, onChange, testId }) => {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label id={`${id}-l`} className="block text-sm font-semibold text-white">{label}</label>
        <p className="text-xs text-zinc-400">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-l`} data-testid={testId} onClick={() => onChange(!checked)}
        className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${checked ? 'bg-brand-500' : 'bg-zinc-600'}`}>
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
};

/** "Prefer video" and "Wi-Fi only video": kept on this device. Used in Settings and in Now Playing ("Video settings"). */
const VideoSettings = () => {
  const { videoPrefs, setVideoPrefs } = useAudio();
  return (
    <div className="divide-y divide-white/5" data-testid="video-settings">
      <Switch label="Prefer video" testId="pref-prefer-video" checked={videoPrefs.preferVideo} onChange={(v) => setVideoPrefs({ preferVideo: v })}
        hint="In Now Playing, play the video version when a song has one. The mini player always plays audio." />
      <Switch label="Wi-Fi only video" testId="pref-wifi-only" checked={videoPrefs.wifiOnly} onChange={(v) => setVideoPrefs({ wifiOnly: v })}
        hint="No video on mobile data (Android can tell; most computers cannot, so video is allowed there). YouTube picks the quality itself." />
      <p className="py-3 text-xs text-zinc-500">Videos play through YouTube&apos;s player, which may set cookies once a video plays. <a href="/privacy" className="underline hover:text-white">Privacy</a></p>
    </div>
  );
};

export default VideoSettings;
