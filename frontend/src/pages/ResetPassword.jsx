import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthShell, PasswordField, SubmitButton, FormError, AuthLink } from '../components/auth/AuthParts';
import { validateNewPassword, validateConfirm } from '../lib/authForm';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dead, setDead] = useState(!token);

  const errors = { password: validateNewPassword(password), confirm: validateConfirm(password, confirm) };
  const show = (f) => (touched[f] ? errors[f] : '');

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (errors.password || errors.confirm || loading) return;
    setLoading(true);
    setError('');
    const res = await resetPassword(token, password);
    setLoading(false);
    const redirectTo = params.get('redirect') || '/';
    if (res.success) navigate(redirectTo, { replace: true }); // signed in with the new password
    else if (res.code === 'RESET_INVALID') setDead(true);
    else setError(res.error || 'Something went wrong. Please try again.');
  };

  if (dead) {
    return (
      <AuthShell title="This link cannot be used" footer={<AuthLink to="/login">Back to sign in</AuthLink>}>
        <div role="alert" className="text-center space-y-3" data-testid="reset-invalid">
          <p className="text-sm text-zinc-200">The reset link is invalid, has already been used, or has expired.</p>
          <p className="text-xs text-zinc-400">Links work once and expire after 30 minutes.</p>
          <AuthLink to="/forgot-password">Send me a new link</AuthLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You will be signed in as soon as it is saved">
      <FormError>{error}</FormError>
      <form onSubmit={submit} noValidate className="space-y-4">
        <PasswordField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, password: true }))} error={show('password')} autoComplete="new-password" placeholder="At least 8 characters" showStrength />
        <PasswordField label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, confirm: true }))} error={show('confirm')} autoComplete="new-password" placeholder="Type it again" />
        <SubmitButton loading={loading} loadingText="Saving...">
          <span>Save password and sign in</span><ArrowRight className="w-4 h-4" aria-hidden="true" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
};

export default ResetPassword;
