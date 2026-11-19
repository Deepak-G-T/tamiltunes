import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthShell, EmailField, PasswordField, SubmitButton, FormError, AuthLink } from '../components/auth/AuthParts';
import { validateEmail, validateCurrentPassword, rememberEmail, recallEmail } from '../lib/authForm';

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect') || '/';
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState(() => recallEmail(window.sessionStorage));
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already authenticated, redirect to destination
  React.useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectParam, { replace: true });
    }
  }, [authLoading, isAuthenticated, redirectParam, navigate]);

  const errors = { email: validateEmail(email), password: validateCurrentPassword(password) };
  const show = (f) => (touched[f] ? errors[f] : '');
  const onEmail = (e) => {
    setEmail(e.target.value);
    rememberEmail(window.sessionStorage, e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (errors.email || errors.password || loading) return;
    setLoading(true);
    setError('');
    // Normalize email (trimmed + lowercased) before sending; password remains strictly as entered
    const cleanEmail = email.trim().toLowerCase();
    const res = await login(cleanEmail, password);
    setLoading(false);
    if (res.success) {
      navigate(redirectParam, { replace: true });
    } else {
      setError(res.error || 'Failed to sign in');
    }
  };

  const signupLink = redirectParam && redirectParam !== '/'
    ? `/signup?redirect=${encodeURIComponent(redirectParam)}`
    : '/signup';

  const forgotLink = redirectParam && redirectParam !== '/'
    ? `/forgot-password?redirect=${encodeURIComponent(redirectParam)}`
    : '/forgot-password';

  return (
    <AuthShell
      title="Sign in to TamilTunes"
      subtitle="Access your playlists, history, and favourite Tamil music"
      footer={
        <>
          Don't have an account? <AuthLink to={signupLink}>Sign up for free</AuthLink>
        </>
      }
    >
      <FormError>
        {error === 'Invalid email or password' ? (
          <div>
            <p className="font-semibold text-rose-300">Invalid email or password</p>
            <p className="mt-1 text-[11px] text-zinc-300/80 font-normal">
              Check Caps Lock or auto-capitalize on your keyboard.
            </p>
          </div>
        ) : (
          error
        )}
      </FormError>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <EmailField
          value={email}
          onChange={onEmail}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={show('email')}
        />
        <PasswordField
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={show('password')}
          autoComplete="current-password"
          placeholder="Your password"
        />
        <div className="flex justify-end -mt-1 text-xs">
          <AuthLink to={forgotLink}>Forgot password?</AuthLink>
        </div>
        <SubmitButton loading={loading} loadingText="Signing in...">
          <span>Sign In</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
};

export default Login;
