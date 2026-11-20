import React, { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Trash2, Loader2 } from 'lucide-react';
import BottomSheet from '../common/BottomSheet';
import { profileApi } from '../../lib/communityApi';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';
import { isNativeApp } from '../../lib/platform';
import VideoSettings from '../player/VideoSettings';
import { sameText } from '../../lib/lastSeen';

const Toggle = ({ label, hint, checked, onChange, disabled }) => {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label id={`${id}-l`} className="block text-sm font-semibold text-white">{label}</label>
        <p className="text-xs text-zinc-400">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-l`} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative w-12 h-7 rounded-full flex-shrink-0 transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${checked ? 'bg-brand-500' : 'bg-zinc-600'}`}>
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
};

/**
 * Privacy toggles, sign out and account deletion.
 * @param {{ profile: object, open: boolean, onClose: () => void, onChange: (patch: object) => void }} props
 */
const SettingsSheet = ({ profile, open, onClose, onChange }) => {
  const { logout, user } = useAuth();
  const { autoplay, setAutoplay } = useAudio();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pid = useId();

  const update = async (patch) => {
    setError('');
    const prev = { isPublicProfile: profile.isPublicProfile, showHistory: profile.showHistory };
    onChange(patch); // optimistic
    try {
      await profileApi.update(patch);
    } catch (e) {
      onChange(prev);
      setError(e.message);
    }
  };

  const signOut = () => { onClose(); logout(); navigate('/'); };

  const openBattery = async () => {
    try {
      const { CapacitorMusicControls } = await import('capacitor-music-controls-plugin');
      if (typeof CapacitorMusicControls?.openBatterySettings === 'function') {
        await CapacitorMusicControls.openBatterySettings();
      }
    } catch (e) {
      console.warn('Failed to open battery settings:', e?.message || e);
    }
  };

  const destroy = async (e) => {
    e.preventDefault();
    if (!confirmed || !sameText(password, user?.email)) return;
    setBusy(true);
    setError('');
    try {
      await profileApi.deleteAccount(password.trim());
      onClose();
      logout();
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Settings" subtitle="Privacy and account">
      <div className="py-2 divide-y divide-white/10">
        <Toggle label="Public profile" hint="Anyone with your link can see your profile. Off shows only your name and photo." checked={profile.isPublicProfile} onChange={(v) => update({ isPublicProfile: v })} />
        <Toggle label="Show listening history" hint="Let visitors see your recently played songs." checked={profile.showHistory} disabled={!profile.isPublicProfile} onChange={(v) => update({ showHistory: v })} />
        <Toggle label="Autoplay similar songs" hint="When your songs run out, keep playing songs like them. Also in the play queue." checked={autoplay} onChange={setAutoplay} />
        {isNativeApp() && (
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-white">Background playback</span>
              <p className="text-xs text-zinc-400">Set battery to Unrestricted if playback stops with the screen off</p>
            </div>
            <button
              type="button"
              onClick={openBattery}
              className="press px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex-shrink-0"
            >
              Battery settings
            </button>
          </div>
        )}
        <h3 className="pt-4 text-xs uppercase tracking-wider font-bold text-zinc-500">Video</h3>
        <VideoSettings />
      </div>
      {error && <p role="alert" className="text-xs text-rose-400 mt-2">{error}</p>}

      <div className="py-4 space-y-3">
        <button type="button" onClick={signOut} className="press w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold">
          <LogOut className="w-4 h-4" /> Sign out
        </button>

        {!deleting ? (
          <button type="button" onClick={() => setDeleting(true)} className="press w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full text-rose-400 hover:bg-rose-500/10 text-sm font-semibold">
            <Trash2 className="w-4 h-4" /> Delete account
          </button>
        ) : (
          <form onSubmit={destroy} className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-3">
            <p className="text-sm text-white font-semibold">Delete your account?</p>
            <p className="text-xs text-zinc-300 leading-relaxed">This permanently removes your profile, playlists, liked songs, history, comments and follows. It cannot be undone.</p>
            <div>
              <label htmlFor={pid} className="block text-xs font-semibold text-zinc-300 mb-1">Type your email address to confirm</label>
              <input id={pid} type="email" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder={user?.email || ''} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-surface-3 border border-white/10 focus:border-rose-400 focus:outline-none px-3 py-2 text-[15px] text-white" />
            </div>
            <label className="flex items-start gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-rose-500" />
              I understand this is permanent.
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setDeleting(false); setPassword(''); setConfirmed(false); }} className="press flex-1 py-2 rounded-full bg-white/10 text-white text-sm font-semibold">Cancel</button>
              <button type="submit" disabled={!confirmed || !sameText(password, user?.email) || busy} className="press flex-1 py-2 rounded-full bg-rose-500 text-white text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Delete forever
              </button>
            </div>
          </form>
        )}
      </div>
    </BottomSheet>
  );
};

export default SettingsSheet;
