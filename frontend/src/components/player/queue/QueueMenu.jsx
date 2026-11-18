import React, { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A small menu next to the button that opened it. Closes on Escape, outside click and scroll.
 * items: [{ label, icon, onSelect, danger?, checked?, disabled? }]
 */
const QueueMenu = ({ anchor, items, onClose, label = 'Options' }) => {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = 220;
    const h = items.length * 44 + 8;
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    const top = r.bottom + h > window.innerHeight - 8 ? Math.max(8, r.top - h) : r.bottom + 4;
    setPos({ left, top });
  }, [anchor, items.length]);

  useEffect(() => {
    if (!anchor) return undefined;
    const first = ref.current?.querySelector('button:not([disabled])');
    first?.focus({ preventScroll: true });
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor.focus?.({ preventScroll: true }); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = [...ref.current.querySelectorAll('button:not([disabled])')];
        const i = btns.indexOf(document.activeElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onClose, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); window.removeEventListener('scroll', onClose, true); };
  }, [anchor, onClose]);

  if (!anchor || !pos) return null;
  return createPortal(
    <div ref={ref} role="menu" aria-label={label} style={{ position: 'fixed', left: pos.left, top: pos.top, width: 220, zIndex: 100002 }}
      className="bg-surface-2 border border-white/10 rounded-xl shadow-2xl py-1">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <button key={it.label} type="button" role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={it.checked} disabled={it.disabled}
            onClick={() => { onClose(); it.onSelect(); }}
            className={`w-full min-h-11 px-3 flex items-center gap-2.5 text-left text-sm disabled:opacity-40 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none ${it.danger ? 'text-rose-400' : 'text-zinc-100'}`}>
            {Icon && <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
            <span className="flex-1 truncate">{it.label}</span>
            {it.checked && <span aria-hidden="true" className="text-brand-400 text-xs font-bold">On</span>}
          </button>
        );
      })}
    </div>,
    document.body
  );
};

export default QueueMenu;
