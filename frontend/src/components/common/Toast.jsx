import React from 'react';
import { X } from 'lucide-react';

const Toast = ({ toast, onDismiss }) => {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      style={{ zIndex: 100001 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm flex items-start gap-2 rounded-xl bg-zinc-900/95 border border-amber-500/40 text-amber-200 text-sm px-4 py-3 shadow-2xl"
    >
      <span className="flex-1">{toast.message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-zinc-400 hover:text-white">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Toast;
