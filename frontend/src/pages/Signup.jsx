import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthShell, TextField, EmailField, PasswordField, SubmitButton, FormError, AuthLink } from '../components/auth/AuthParts';
import { validateName, validateEmail, validateNewPassword, validateConfirm, rememberEmail, recallEmail } from '../lib/authForm';

const Signup = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => recallEmail(window.sessionStorage));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exists, setExists] = useState(false);

  const errors = { name: validateName(name), email: validateEmail(email), password: validateNewPassword(password), confirm: validateConfirm(password, confirm) };
  const show = (f) => (touched[f] ? errors[f] : '');
  const blur = (f) => () => setTouched((t) => ({ ...t, [f]: true }));
  const onEmail = (e) => { setEmail(e.target.value); setExists(false); rememberEmail(window.sessionStorage, e.target.value); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirm: true });
    if (Object.values(errors).some(Boolean) || loading) return;
    setLoading(true);
    setError('');
    setExists(false);
    const res = await signup(name.trim(), email.trim(), password);
    setLoading(false);
    if (res.success) navigate('/');
    else if (res.code === 'EMAIL_EXISTS') setExists(true);
    else setError(res.error || 'Failed to create account');
  };

  return (
    <AuthShell title="Create your Account" subtitle="Start listening to authentic Tamil music with zero ads"
      footer={<>Already have an account? <AuthLink to="/login">Log in</AuthLink></>}>
      <FormError>{error}</FormError>
      {exists && (
        <div role="alert" data-testid="email-exists" className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          <p className="font-semibold">An account with this email already exists.</p>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1"><AuthLink to="/login">Log in instead</AuthLink><AuthLink to="/forgot-password">Forgot password?</AuthLink></p>
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} onBlur={blur('name')} error={show('name')} autoComplete="name" placeholder="Your name" />
        <EmailField value={email} onChange={onEmail} onBlur={blur('email')} error={show('email')} />
        <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} onBlur={blur('password')} error={show('password')} autoComplete="new-password" placeholder="At least 8 characters" showStrength />
        <PasswordField label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onBlur={blur('confirm')} error={show('confirm')} autoComplete="new-password" placeholder="Type it again" />
        <SubmitButton loading={loading} loadingText="Creating account...">
          <span>Sign Up Free</span><ArrowRight className="w-4 h-4" aria-hidden="true" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
};

export default Signup;
