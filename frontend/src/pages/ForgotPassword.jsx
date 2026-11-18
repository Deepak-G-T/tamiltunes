import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthShell, EmailField, SubmitButton, FormError, AuthLink } from '../components/auth/AuthParts';
import { validateEmail, rememberEmail, recallEmail } from '../lib/authForm';

const ForgotPassword = () => {
  const [params] = useSearchParams();
  const redirectParam = params.get('redirect') || '';
  const loginLink = redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login';

  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState(() => recallEmail(window.sessionStorage));
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const problem = validateEmail(email);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (problem || loading) return;
    setLoading(true);
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    const res = await requestPasswordReset(cleanEmail);
    setLoading(false);
    if (res.success) setSent(true);
    else setError(res.error || 'Something went wrong. Please try again.');
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" footer={<AuthLink to={loginLink}>Back to sign in</AuthLink>}>
        <div role="status" className="text-center space-y-3" data-testid="forgot-sent">
          <MailCheck className="w-10 h-10 text-brand-400 mx-auto" aria-hidden="true" />
          <p className="text-sm text-white font-semibold">If an account exists, we sent a link</p>
          <p className="text-xs text-zinc-400">Open the email and choose a new password. The link works once and expires in 30 minutes. If you do not see it, check your spam folder.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one"
      footer={<AuthLink to={loginLink}>Back to sign in</AuthLink>}>
      <FormError>{error}</FormError>
      <form onSubmit={submit} noValidate className="space-y-4">
        <EmailField value={email} onChange={(e) => { setEmail(e.target.value); rememberEmail(window.sessionStorage, e.target.value); }} onBlur={() => setTouched(true)} error={touched ? problem : ''} />
        <SubmitButton loading={loading} loadingText="Sending...">
          <span>Send reset link</span><ArrowRight className="w-4 h-4" aria-hidden="true" />
        </SubmitButton>
      </form>
    </AuthShell>
  );
};

export default ForgotPassword;
