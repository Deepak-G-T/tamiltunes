import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, KeyRound, Copy, Check, Lock, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { useAuth } from '../../context/AuthContext';

const Admin2FA = () => {
  const { user } = useAuth();
  const [isEnabled, setIsEnabled] = useState(Boolean(user?.twoFactorEnabled));
  const [setupData, setSetupData] = useState(null);
  const [tokenCode, setTokenCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleStartSetup = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.setup2FA();
      setSetupData(res);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to initialize 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async (e) => {
    e.preventDefault();
    if (!tokenCode || tokenCode.length !== 6) {
      setError('Please enter the 6-digit code from your authenticator app');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await adminApi.verify2FA({
        token: tokenCode,
        recoveryCodes: setupData.recoveryCodes
      });
      setIsEnabled(true);
      setSetupData(null);
      showToast('Two-factor authentication successfully enabled');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Password is required to disable 2FA');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await adminApi.disable2FA({ password });
      setIsEnabled(false);
      setPassword('');
      showToast('Two-factor authentication disabled');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-brand-500/50 text-white text-xs font-semibold shadow-2xl flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Two-Factor Authentication</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
          Add an extra layer of security using standard TOTP apps (Google Authenticator, Authy, 1Password)
        </p>
      </div>

      {/* Status Card */}
      <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Status: {isEnabled ? 'Enabled' : 'Disabled'}
              </h3>
              <p className="text-xs text-zinc-400">
                {isEnabled
                  ? 'Your admin account is protected by TOTP two-factor authentication.'
                  : '2FA is currently not configured for your admin account.'}
              </p>
            </div>
          </div>
        </div>

        {!isEnabled && !setupData && (
          <button
            onClick={handleStartSetup}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold transition-transform active:scale-95"
          >
            {loading ? 'Initializing...' : 'Set Up 2FA Now'}
          </button>
        )}
      </div>

      {/* Setup Step 1 & 2 */}
      {setupData && !isEnabled && (
        <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-6">
          <h3 className="text-sm font-bold text-white">Configure Authenticator</h3>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">
              1. Copy Secret Key into your Authenticator App
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={setupData.secret}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono text-xs select-all"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(setupData.secret);
                  setCopiedSecret(true);
                  setTimeout(() => setCopiedSecret(false), 2000);
                }}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-1"
              >
                {copiedSecret ? <Check className="w-4 h-4 text-brand-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Or paste the URI: {setupData.uri}</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">
              2. Save Your 8 Emergency Recovery Codes
            </label>
            <p className="text-[11px] text-zinc-500 mb-2">
              If you lose access to your device, each code can be used once to sign in.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-zinc-900/80 border border-zinc-800/80 rounded-xl font-mono text-xs text-zinc-200 select-all">
              {setupData.recoveryCodes.map((code, idx) => (
                <div key={idx} className="p-1.5 text-center bg-zinc-800/40 rounded-lg">
                  {code}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(setupData.recoveryCodes.join('\n'));
                setCopiedCodes(true);
                setTimeout(() => setCopiedCodes(false), 2000);
              }}
              className="mt-2 text-xs text-brand-400 hover:underline flex items-center gap-1"
            >
              {copiedCodes ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCodes ? 'All codes copied to clipboard!' : 'Copy all recovery codes'}</span>
            </button>
          </div>

          <form onSubmit={handleVerifySetup} className="space-y-4 pt-2 border-t border-zinc-800/60">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">
                3. Enter 6-digit Code from Authenticator
              </label>
              <input
                type="text"
                maxLength={6}
                value={tokenCode}
                onChange={(e) => setTokenCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-44 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-mono text-base tracking-widest text-center focus:outline-none focus:border-brand-500"
              />
              {error && <p className="text-xs text-rose-400 mt-1.5">{error}</p>}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSetupData(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold"
              >
                {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disable 2FA Form */}
      {isEnabled && (
        <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-4">
          <h3 className="text-sm font-bold text-rose-400">Disable Two-Factor Authentication</h3>
          <p className="text-xs text-zinc-400">
            Disabling 2FA reduces account security. Re-enter your admin password to confirm:
          </p>

          <form onSubmit={handleDisable2FA} className="space-y-3 max-w-sm">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your admin password"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-semibold"
            >
              {loading ? 'Disabling...' : 'Confirm Disable 2FA'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Admin2FA;
