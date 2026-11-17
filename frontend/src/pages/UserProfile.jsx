import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../lib/communityApi';
import ProfileView from '../components/profile/ProfileView';
import { ErrorState, EmptyState } from '../components/common/StateViews';
import { Skeleton } from '../components/common/Skeleton';

/** /u/:username: public profile. Unknown usernames get a friendly 404. */
const UserProfile = () => {
  const { username } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ status: 'loading', profile: null, isSelf: false, error: '' });

  const load = useCallback(async () => {
    setState({ status: 'loading', profile: null, isSelf: false, error: '' });
    try {
      const { profile, isSelf } = await usersApi.get(username);
      setState({ status: 'ready', profile, isSelf, error: '' });
    } catch (e) {
      setState({ status: e.status === 404 ? 'notfound' : 'error', profile: null, isSelf: false, error: e.message });
    }
  }, [username]);

  useEffect(() => { load(); }, [load, user?.id]);

  if (state.status === 'loading') {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-6" role="status" aria-label="Loading profile">
        <div className="flex items-center gap-4"><Skeleton className="w-24 h-24 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-1/3" /></div></div>
        <Skeleton className="h-16 w-full" /><Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (state.status === 'notfound') {
    return (
      <EmptyState icon={UserX} title="User not found" text={`There is no TamilTunes user called @${username}.`}
        action={<Link to="/" className="press mt-2 px-5 py-2 rounded-full bg-brand-500 text-black text-sm font-bold">Back to home</Link>} />
    );
  }
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={load} />;
  // Your own public URL shows the editable view
  if (state.isSelf) return <Navigate to="/profile" replace />;
  return <ProfileView profile={state.profile} isSelf={false} onProfileChange={(p) => setState((s) => ({ ...s, profile: p }))} />;
};

export default UserProfile;
