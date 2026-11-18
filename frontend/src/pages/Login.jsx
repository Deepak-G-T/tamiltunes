import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthShell, EmailField, PasswordField, SubmitButton, FormError, AuthLink } from '../components/auth/AuthParts';
import { validateEmail, validateCurrentPassword, rememberEmail, recallEmail } from '../lib/authForm';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState(() => recallEmail(window.sessionStorage));
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const errors = { email: validateEmail(email), password: validateCurrentPassword(password) };
  const show = (f) => (touched[f] ? errors[f] : '');
  const onEmail = (e) => { setEmail(e.target.value); rememberEmail(window.sessionStorage, e.target.value); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (errors.email || errors.password || loading) return;
    setLoading(true);
    setError('');
    const res = await login(email.trim(), password); // the password goes exactly as typed
    setLoading(false);
    if (res.success) navigate('/');
    else setError(res.error || 'Failed to sign in');
  };

  return (
    <AuthShell title="Sign in to TamilTunes" subtitle="Access your playlists, history, and favourite Tamil music"
      footer={<>Don't have an account? <AuthLink to="/signup">Sign up for free</AuthLink></>}>
      <FormError>{error}</FormError>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <EmailField value={email} onChange={onEmail} onBlur={() => setTouched((t) => ({ ...t, email: true }))} error={show('email')} />
        <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, password: true }))} error={show('password')} autoComplete="current-password" placeholder="Your password" />
        <div className="flex justify-end -mt-1 text-xs"><AuthLink to="/forgot-password">Forgot password?</AuthLink></div>
        <SubmitButton loading={loading} loadingText="Signing in...">
          <span>Sign In</span><ArrowRight className="w-4 h-4" aria-hidden="true" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
};

export default Login;
