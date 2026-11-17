import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { profileApi } from '../lib/communityApi';
import ProfileView from '../components/profile/ProfileView';
import { ErrorState } from '../components/common/StateViews';
import { Skeleton } from '../components/common/Skeleton';

/** /profile: the signed-in user's own, editable profile. Guests are sent to sign in. */
const Profile = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setProfile((await profileApi.me()).profile);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pt-6" role="status" aria-label="Loading profile">
        <div className="flex items-center gap-4"><Skeleton className="w-24 h-24 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-1/3" /></div></div>
        <Skeleton className="h-16 w-full" /><Skeleton className="h-10 w-full" />
      </div>
    );
  }
  return <ProfileView profile={profile} isSelf onProfileChange={setProfile} />;
};

export default Profile;
