import React from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import BottomSheet from '../common/BottomSheet';
import Avatar from '../common/Avatar';
import ListShell from './tabs/ListShell';
import FollowButton from './FollowButton';
import { usePagedList } from '../../hooks/usePagedList';
import { usersApi } from '../../lib/communityApi';
import { useAuth } from '../../context/AuthContext';

const PeopleList = ({ username, kind, onNavigate }) => {
  const { user } = useAuth();
  const list = usePagedList((offset) => usersApi.tab(username, kind, { offset }), [username, kind]);
  const setFollowing = (id) => (isFollowing) => list.setItems((prev) => prev.map((p) => (p.id === id ? { ...p, isFollowing } : p)));
  return (
    <div className="py-2">
      <ListShell list={list} label={kind} emptyIcon={Users} emptyTitle={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}>
        <ul>
          {list.items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <Link to={`/u/${p.username}`} onClick={onNavigate} className="flex items-center gap-3 min-w-0 flex-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400">
                <Avatar user={p} size={44} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{p.name}</span>
                  <span className="block text-xs text-zinc-400 truncate">@{p.username}</span>
                </span>
              </Link>
              {user && user.id !== p.id && <FollowButton size="sm" username={p.username} isFollowing={p.isFollowing} onChange={setFollowing(p.id)} />}
            </li>
          ))}
        </ul>
      </ListShell>
    </div>
  );
};

const PeopleSheet = ({ open, onClose, username, kind }) => (
  <BottomSheet open={open} onClose={onClose} tall title={kind === 'followers' ? 'Followers' : 'Following'} subtitle={`@${username}`}>
    <PeopleList username={username} kind={kind} onNavigate={onClose} />
  </BottomSheet>
);

export default PeopleSheet;
