import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, User, Music2, Loader2 } from 'lucide-react';
import { passwordStrength } from '../../lib/authForm';

const INPUT = 'w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border text-white text-sm focus:outline-none focus:ring-1 placeholder-zinc-500 transition-colors';
const ok = 'border-zinc-700/80 focus:border-brand-500 focus:ring-brand-500';
const bad = 'border-rose-500/70 focus:border-rose-400 focus:ring-rose-400';

/** The card all four screens share. */
export const AuthShell = ({ title, subtitle, children, footer }) => (
  <div className="min-h-[80vh] flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-surface-2 rounded-2xl border border-zinc-800 p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
      <div className="text-center mb-7">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center mx-auto shadow-lg shadow-brand-600/30 mb-3">
          <Music2 className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
      </div>
      {children}
      {footer && <div className="mt-6 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-400">{footer}</div>}
    </div>
  </div>
);

const Field = ({ label, icon: Icon, error, id, children, hint }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-semibold text-zinc-300 mb-1.5">{label}</label>
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500"><Icon className="w-4 h-4" aria-hidden="true" /></div>
      {children}
    </div>
    {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-[11px] text-rose-400">{error}</p>}
    {hint}
  </div>
);

export const TextField = ({ label, icon = User, error, ...props }) => {
  const id = useId();
  return (
    <Field label={label} icon={icon} error={error} id={id}>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={`${INPUT} ${error ? bad : ok}`} {...props} />
    </Field>
  );
};

export const EmailField = (props) => <TextField label="Email address" icon={Mail} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" {...props} />;

/** Password with a show / hide eye. The password is sent exactly as typed (never trimmed). */
export const PasswordField = ({ label = 'Password', error, showStrength = false, value, ...props }) => {
  const id = useId();
  const [shown, setShown] = useState(false);
  const strength = showStrength ? passwordStrength(value) : null;
  return (
    <Field label={label} icon={Lock} error={error} id={id}
      hint={strength && (value ? (
        <div className="mt-2" data-testid="strength">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${strength.score >= n ? ['', 'bg-rose-500', 'bg-amber-400', 'bg-brand-400', 'bg-brand-300'][strength.score] : 'bg-zinc-700'}`} />)}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400" aria-live="polite"><span className="font-semibold text-zinc-200">{strength.label}</span>{strength.hint ? `: ${strength.hint}` : ''}</p>
        </div>
      ) : null)}>
      <input id={id} type={shown ? 'text' : 'password'} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        className={`${INPUT} pr-11 ${error ? bad : ok}`} autoCapitalize="none" spellCheck={false} {...props} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 px-3.5 text-zinc-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 rounded-r-xl">
        {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </Field>
  );
};

export const SubmitButton = ({ loading, children, loadingText }) => (
  <button type="submit" disabled={loading} aria-busy={loading}
    className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2">
    {loading ? (<><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /><span>{loadingText}</span></>) : children}
  </button>
);

export const FormError = ({ children }) => (children ? <div role="alert" className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center">{children}</div> : null);

export const AuthLink = ({ to, children }) => <Link to={to} className="text-brand-400 font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 rounded">{children}</Link>;
