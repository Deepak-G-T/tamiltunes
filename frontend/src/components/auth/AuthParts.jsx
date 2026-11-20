import React from 'react';
import { Music2 } from 'lucide-react';

/** The card of the sign-in screen. */
export const AuthShell = ({ title, subtitle, children, footer }) => (
  <main className="min-h-screen flex items-center justify-center p-4 bg-[#09090B]">
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
  </main>
);

export const FormError = ({ children }) => (children ? <div role="alert" className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center">{children}</div> : null);
