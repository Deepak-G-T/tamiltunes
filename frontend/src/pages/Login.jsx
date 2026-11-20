import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthShell, FormError } from '../components/auth/AuthParts';
import PwaBar from '../components/common/PwaBar';
import { isNativeApp } from '../lib/platform';
import { googleConfigured, renderGoogleButton, nativeGoogleIdToken, describeGoogleError } from '../lib/googleAuth';

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

/** Google is the only way to sign in. The website shows Google's own button; the Android app opens Google's account chooser. */
const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect') || '/';
  const { loginWithGoogle, isAuthenticated, isLoading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const buttonRef = useRef(null);
  const native = isNativeApp();
  const configured = googleConfigured();

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirectParam, { replace: true });
  }, [authLoading, isAuthenticated, redirectParam, navigate]);

  const finish = async (idToken) => {
    setBusy(true);
    setError('');
    const res = await loginWithGoogle(idToken);
    setBusy(false);
    if (res.success) navigate(redirectParam, { replace: true });
    else setError(res.error || 'Google sign-in failed');
  };

  // website: Google draws the button
  useEffect(() => {
    if (native || !configured || !buttonRef.current) return undefined;
    let cancelled = false;
    renderGoogleButton(buttonRef.current, { onCredential: (t) => { if (!cancelled) finish(t); }, width: 280 }).catch((e) => { if (!cancelled) setError(describeGoogleError(e)); });
    return () => { cancelled = true; };
  }, [native, configured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android app: our own button opens the native account chooser
  const nativeSignIn = async () => {
    if (busy) return;
    setError('');
    try {
      const idToken = await nativeGoogleIdToken();
      await finish(idToken);
    } catch (e) {
      setError(describeGoogleError(e));
    }
  };

  return (
    <>
      <PwaBar />
      <AuthShell
        title="Sign in to TamilTunes"
      subtitle="Your playlists, history and favourite Tamil music, with your Google account"
      footer={<>By continuing you agree to how TamilTunes uses your data: see the <Link to="/privacy" className="underline text-brand-300 hover:text-white">Privacy page</Link>.</>}
    >
      <FormError>{error}</FormError>
      {!configured ? (
        <p role="alert" data-testid="google-not-configured" className="text-sm text-amber-300 text-center">Google sign-in is not set up for this build yet.</p>
      ) : native ? (
        <button type="button" onClick={nativeSignIn} disabled={busy} data-testid="google-signin"
          className="press w-full min-h-12 inline-flex items-center justify-center gap-3 rounded-full bg-white text-black font-semibold text-sm disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <GoogleMark />}
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div ref={buttonRef} data-testid="google-button" className="min-h-[44px] flex justify-center" />
          {busy && <p role="status" className="text-xs text-zinc-400 inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Signing in…</p>}
        </div>
      )}
      <p className="mt-5 text-center text-[11px] text-zinc-500">The first time you sign in, your TamilTunes account is created. If you already had one with this email, it is linked and nothing is lost.</p>
    </AuthShell>
    </>
  );
};

export default Login;
