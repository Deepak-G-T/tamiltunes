import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

export const ErrorState = ({ message = 'Something went wrong.', onRetry, compact = false }) => (
  <div role="alert" className={`flex flex-col items-center text-center gap-3 ${compact ? 'py-6' : 'py-16'}`}>
    <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center">
      <AlertTriangle className="w-6 h-6" />
    </div>
    <p className="text-sm text-zinc-300 max-w-xs">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="press inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
      >
        <RotateCw className="w-3.5 h-3.5" /> Try again
      </button>
    )}
  </div>
);

export const EmptyState = ({ icon: Icon, title, text, action, compact = false }) => (
  <div className={`flex flex-col items-center text-center gap-2 ${compact ? 'py-8' : 'py-16'}`}>
    {Icon && (
      <div className="w-12 h-12 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center mb-1">
        <Icon className="w-6 h-6" />
      </div>
    )}
    <h3 className="text-sm font-bold text-white">{title}</h3>
    {text && <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">{text}</p>}
    {action}
  </div>
);
