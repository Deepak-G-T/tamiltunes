import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import BottomSheet from '../common/BottomSheet';
import { loadImage, renderAvatar } from '../../lib/avatarImage';
import { minScale, clampOffset, centerOffset, zoomAround } from '../../lib/cropMath';

const VIEW = 280;

/**
 * Pick a square crop (drag to move, slider / buttons / keys to zoom) and return a 256px data URL.
 * @param {{ file: File | null, onCancel: () => void, onDone: (dataUrl: string) => void }} props
 */
const AvatarCropper = ({ file, onCancel, onDone }) => {
  const [img, setImg] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);
  const [base, setBase] = useState(1); // minimum scale: image just covers the viewport

  useEffect(() => {
    if (!file) return undefined;
    let revoked = false;
    let objectUrl = null;
    setImg(null);
    setError('');
    loadImage(file)
      .then(({ img: el, url }) => {
        objectUrl = url;
        if (revoked) return;
        const s = minScale(el.naturalWidth, el.naturalHeight, VIEW);
        setBase(s);
        setImg(el);
        setScale(s);
        setOffset(centerOffset(el.naturalWidth, el.naturalHeight, s, VIEW));
      })
      .catch((e) => setError(e.message));
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file]);

  const move = useCallback((dx, dy) => {
    if (!img) return;
    setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, img.naturalWidth, img.naturalHeight, scale, VIEW));
  }, [img, scale]);

  const zoom = useCallback((factor) => {
    if (!img) return;
    const next = Math.min(base * 4, Math.max(base, scale * factor));
    setOffset((o) => zoomAround(o, scale, next, img.naturalWidth, img.naturalHeight, VIEW));
    setScale(next);
  }, [img, scale, base]);

  const onPointerDown = (e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; };
  const onPointerMove = (e) => { if (!drag.current) return; move(e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = () => { drag.current = null; };
  const onKeyDown = (e) => {
    const step = 12;
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) { e.preventDefault(); move(...map[e.key]); }
    else if (e.key === '+' || e.key === '=') zoom(1.1);
    else if (e.key === '-') zoom(1 / 1.1);
  };

  const confirm = async () => {
    if (!img) return;
    setBusy(true);
    setError('');
    try {
      onDone(await renderAvatar(img, offset, scale, VIEW));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={Boolean(file)} onClose={onCancel} title="Crop your photo" subtitle="Drag to move, zoom to fit"
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="press flex-1 py-2.5 rounded-full bg-white/10 text-white text-sm font-semibold">Cancel</button>
          <button type="button" onClick={confirm} disabled={!img || busy} className="press flex-1 py-2.5 rounded-full bg-brand-500 text-black text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Use photo
          </button>
        </div>
      }>
      <div className="flex flex-col items-center gap-4 py-3">
        <div
          tabIndex={0}
          role="application"
          aria-label="Photo crop area. Use arrow keys to move and plus or minus to zoom."
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          style={{ width: VIEW, height: VIEW, touchAction: 'none' }}
          className="relative overflow-hidden rounded-full bg-surface-3 cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {img ? (
            <img src={img.src} alt="" draggable={false}
              style={{ position: 'absolute', left: 0, top: 0, width: img.naturalWidth * scale, height: img.naturalHeight * scale, transform: `translate(${offset.x}px, ${offset.y}px)`, maxWidth: 'none' }} />
          ) : !error ? (
            <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
          ) : null}
        </div>
        <div className="flex items-center gap-3 w-full max-w-[280px]">
          <button type="button" onClick={() => zoom(1 / 1.15)} aria-label="Zoom out" className="press p-2 rounded-full bg-white/10"><ZoomOut className="w-4 h-4" /></button>
          <input type="range" aria-label="Zoom" min={1} max={4} step={0.01} value={img ? scale / base : 1}
            onChange={(e) => { const t = Number(e.target.value) * base; zoom(t / scale); }}
            className="flex-1 accent-brand-400" />
          <button type="button" onClick={() => zoom(1.15)} aria-label="Zoom in" className="press p-2 rounded-full bg-white/10"><ZoomIn className="w-4 h-4" /></button>
        </div>
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      </div>
    </BottomSheet>
  );
};

export default AvatarCropper;
