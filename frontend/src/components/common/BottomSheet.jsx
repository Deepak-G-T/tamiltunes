import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: bottom sheet on phones, centered dialog on larger screens.
 * Traps focus, closes on Escape / backdrop, restores focus, respects safe areas.
 */
const BottomSheet = ({ open, onClose, title, subtitle, children, footer, tall = false, testId, bare = false }) => {
  const ref = useRef(null);
  const dragY = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE);
    first?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.target?.closest?.('[role=menu]')) return; // a menu inside the sheet handles its own keys
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const a = items[0];
        const z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div style={{ zIndex: 100000 }} className="fixed inset-0 flex items-end sm:items-center justify-center pt-[var(--safe-top)]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        data-testid={testId}
        aria-modal="true"
        aria-labelledby={bare ? undefined : titleId}
        aria-label={bare ? title : undefined}
        className={`slide-up relative w-full sm:max-w-lg bg-surface-2 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col ${
          tall ? 'h-[min(84dvh,calc(100dvh-var(--safe-top)-0.5rem))]' : 'max-h-[min(84dvh,calc(100dvh-var(--safe-top)-0.5rem))]'
        } sm:max-h-[85dvh]`}
      >
        {/* Drag handle: swipe down to close (phones). Escape, the backdrop and the X still work. */}
        <div
          aria-hidden="true"
          className="sm:hidden flex justify-center pt-2 pb-1 flex-shrink-0"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => { dragY.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); }}
          onPointerUp={(e) => { if (dragY.current !== null && e.clientY - dragY.current > 60) onClose(); dragY.current = null; }}
          onPointerCancel={() => { dragY.current = null; }}
        >
          <span className="block w-10 h-1 rounded-full bg-white/25" />
        </div>
        {!bare && (
        <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-2 flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-white truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-zinc-400 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="press p-2 rounded-full bg-white/10 hover:bg-white/15 text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        )}
        {bare ? (
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4">{children}</div>
        )}
        {footer && <div className="flex-shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,var(--safe-bottom))]">{footer}</div>}
        {!footer && <div className="h-[var(--safe-bottom)]" />}
      </div>
    </div>,
    document.body
  );
};

export default BottomSheet;
