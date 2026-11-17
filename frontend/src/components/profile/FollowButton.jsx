import React, { useState } from 'react';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { usersApi } from '../../lib/communityApi';

/**
 * Optimistic follow / unfollow toggle.
 * @param {{ username: string, isFollowing: boolean, onChange?: (isFollowing: boolean, followers?: number) => void, size?: 'sm'|'md' }} props
 */
const FollowButton = ({ username, isFollowing, onChange, size = 'md' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (busy) return;
    const next = !isFollowing;
    setBusy(true);
    setError('');
    onChange?.(next);
    try {
      const out = await (next ? usersApi.follow(username) : usersApi.unfollow(username));
      onChange?.(out.isFollowing, out.followers);
    } catch (e) {
      onChange?.(!next); // revert
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-5 py-2 text-sm';
  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={isFollowing}
        aria-label={isFollowing ? `Unfollow ${username}` : `Follow ${username}`}
        className={`press inline-flex items-center gap-1.5 rounded-full font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${pad} ${
          isFollowing ? 'bg-white/10 text-white border border-white/20 hover:bg-white/15' : 'bg-brand-500 text-black hover:bg-brand-400'
        }`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
        {isFollowing ? 'Following' : 'Follow'}
      </button>
      {error && <span role="alert" className="text-[11px] text-rose-400 mt-1">{error}</span>}
    </span>
  );
};

export default FollowButton;
