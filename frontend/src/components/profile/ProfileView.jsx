import { shareLink } from '../../lib/share';
import React, { Suspense, lazy, useState, useCallback, useMemo, useRef } from 'react';
import { Settings, Pencil, Share2, MapPin, CalendarDays, Lock, Heart, ListMusic, History, MessageCircle } from 'lucide-react';
import Avatar from '../common/Avatar';
import { RowSkeleton, SkeletonList } from '../common/Skeleton';
import { EmptyState } from '../common/StateViews';
import FollowButton from './FollowButton';
import PeopleSheet from './PeopleSheet';
import EditProfileSheet from './EditProfileSheet';
import SettingsSheet from './SettingsSheet';
import { compactCount } from '../../lib/format';
import { usePageMeta } from '../../hooks/usePageMeta';
import { avatarSrc } from '../../lib/communityApi';
import { useAuth } from '../../context/AuthContext';

// Tabs are code-split and only fetched when first opened
const LikedTab = lazy(() => import('./tabs/LikedTab'));
const PlaylistsTab = lazy(() => import('./tabs/PlaylistsTab'));
const HistoryTab = lazy(() => import('./tabs/HistoryTab'));
const CommentsTab = lazy(() => import('./tabs/CommentsTab'));

const joinedLabel = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '');

const Stat = ({ label, value, onClick }) => {
  const body = (<><span className="block text-xl font-extrabold text-white tabular-nums">{compactCount(value)}</span><span className="block text-[11px] text-zinc-400 font-medium">{label}</span></>);
  return onClick ? (
    <button type="button" onClick={onClick} className="press text-center rounded-lg py-2 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">{body}</button>
  ) : <div className="text-center py-2">{body}</div>;
};

/**
 * Shared profile screen for /profile (isSelf) and /u/:username.
 * @param {{ profile: object, isSelf: boolean, onProfileChange: (p: object) => void }} props
 */
const ProfileView = ({ profile, isSelf, onProfileChange }) => {
  const { setUser } = useAuth();
  const [tab, setTab] = useState('liked');
  const [people, setPeople] = useState(null); // 'followers' | 'following' | null
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const tabRefs = useRef({});

  const isPrivate = Boolean(profile.isPrivate) && !isSelf;
  const stats = profile.stats ?? {};
  const url = `${window.location.origin}/u/${profile.username}`;

  usePageMeta({
    title: `${profile.name} (@${profile.username}) · TamilTunes`,
    description: profile.bio || `${profile.name} on TamilTunes: ad-free Tamil music streaming.`,
    image: profile.avatarUrl ? new URL(avatarSrc(profile.avatarUrl), window.location.origin).href : undefined,
    url,
  });

  const tabs = useMemo(() => {
    const t = [{ id: 'liked', label: 'Liked', Icon: Heart }, { id: 'playlists', label: 'Playlists', Icon: ListMusic }];
    if (isSelf || profile.showHistory) t.push({ id: 'history', label: 'Recent', Icon: History });
    t.push({ id: 'comments', label: 'Comments', Icon: MessageCircle });
    return t;
  }, [isSelf, profile.showHistory]);

  const onKeyTabs = (e) => {
    const i = tabs.findIndex((t) => t.id === tab);
    const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
    if (next) { e.preventDefault(); setTab(next.id); tabRefs.current[next.id]?.focus(); }
  };

  const share = useCallback(async () => {
    const r = await shareLink({ title: `${profile.name} on TamilTunes`, url });
    if (r === 'copied') { setShareMsg('Link copied'); setTimeout(() => setShareMsg(''), 2000); }
  }, [profile.name, url]);

  const onFollowChange = (isFollowing, followers) =>
    onProfileChange({ ...profile, isFollowing, stats: { ...profile.stats, followers: followers ?? Math.max(0, (stats.followers ?? 0) + (isFollowing === profile.isFollowing ? 0 : isFollowing ? 1 : -1)) } });

  const onSaved = (updated) => {
    onProfileChange({ ...profile, ...updated });
    setUser?.((u) => (u ? { ...u, name: updated.name, username: updated.username, avatarUrl: updated.avatarUrl } : u));
  };

  const panelId = `panel-${tab}`;
  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
      <header className="cover-wash-strong -mx-4 md:-mx-6 -mt-4 px-4 md:px-6 pt-8 pb-4 md:rounded-b-2xl">
        <div className="flex items-start gap-4">
          <Avatar user={profile} size={96} className="shadow-[0_12px_32px_rgba(0,0,0,0.5)]" />
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight break-words" dir="auto">{profile.name}</h1>
            <p className="text-sm text-zinc-300">@{profile.username}</p>
            {profile.role === 'artist' && <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-300 text-[10px] font-bold">Artist</span>}
          </div>
        </div>

        {isPrivate ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-zinc-300"><Lock className="w-4 h-4" /> This profile is private</p>
        ) : (
          <>
            {profile.bio && <p dir="auto" lang="ta" className="mt-3 text-[15px] leading-relaxed text-zinc-100 whitespace-pre-wrap break-words">{profile.bio}</p>}
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
              {profile.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{profile.location}</span>}
              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />Joined {joinedLabel(profile.joinedAt)}</span>
            </p>
            {(profile.genres?.length > 0 || profile.favoriteArtists?.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...(profile.genres ?? []), ...(profile.favoriteArtists ?? [])].map((g) => (
                  <span key={g} className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] text-zinc-200">{g}</span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isSelf ? (
            <>
              <button type="button" onClick={() => setEditing(true)} className="press inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black text-sm font-bold"><Pencil className="w-4 h-4" /> Edit profile</button>
              <button type="button" onClick={() => setSettings(true)} aria-label="Settings" className="press p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white"><Settings className="w-5 h-5" /></button>
            </>
          ) : profile.id ? (
            <FollowButton username={profile.username} isFollowing={Boolean(profile.isFollowing)} onChange={onFollowChange} />
          ) : null}
          <button type="button" onClick={share} aria-label="Share profile" className="press p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white"><Share2 className="w-5 h-5" /></button>
          <span role="status" className="text-xs text-brand-300">{shareMsg}</span>
        </div>

        <div className={`mt-4 grid ${isPrivate ? 'grid-cols-2' : 'grid-cols-5'} gap-1 rounded-xl bg-black/30 px-1`}>
          {!isPrivate && <Stat label="Liked" value={stats.favorites ?? 0} />}
          {!isPrivate && <Stat label="Playlists" value={stats.playlists ?? 0} />}
          {!isPrivate && <Stat label="Comments" value={stats.comments ?? 0} />}
          <Stat label="Followers" value={stats.followers ?? 0} onClick={() => setPeople('followers')} />
          <Stat label="Following" value={stats.following ?? 0} onClick={() => setPeople('following')} />
        </div>
      </header>

      {isPrivate ? (
        <EmptyState icon={Lock} title="Private profile" text="This person keeps their music and activity to themselves." />
      ) : (
        <>
          <div role="tablist" aria-label="Profile sections" onKeyDown={onKeyTabs} className="flex mt-4 overflow-x-auto no-scrollbar border-b border-white/10">
            {tabs.map(({ id, label, Icon }) => (
              <button key={id} ref={(el) => { tabRefs.current[id] = el; }} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                className={`press flex-1 justify-center inline-flex items-center gap-1.5 px-2.5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${tab === id ? 'border-brand-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={panelId} aria-labelledby={`tab-${tab}`} tabIndex={0} className="pt-3 pb-8 focus:outline-none">
            <Suspense fallback={<SkeletonList label="Loading">{[0, 1, 2].map((i) => <RowSkeleton key={i} />)}</SkeletonList>}>
              {tab === 'liked' && <LikedTab key={profile.username} username={profile.username} isSelf={isSelf} />}
              {tab === 'playlists' && <PlaylistsTab key={profile.username} username={profile.username} isSelf={isSelf}
                onCountChange={(d) => onProfileChange({ ...profile, stats: { ...profile.stats, playlists: Math.max(0, (stats.playlists ?? 0) + d) } })} />}
              {tab === 'history' && <HistoryTab key={profile.username} username={profile.username} isSelf={isSelf} />}
              {tab === 'comments' && <CommentsTab key={profile.username} username={profile.username} isSelf={isSelf} />}
            </Suspense>
          </div>
        </>
      )}

      {people && <PeopleSheet open onClose={() => setPeople(null)} username={profile.username} kind={people} />}
      {isSelf && <EditProfileSheet profile={profile} open={editing} onClose={() => setEditing(false)} onSaved={onSaved} />}
      {isSelf && <SettingsSheet profile={profile} open={settings} onClose={() => setSettings(false)} onChange={(patch) => onProfileChange({ ...profile, ...patch })} />}
    </div>
  );
};

export default ProfileView;
