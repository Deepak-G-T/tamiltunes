import React, { useState, memo } from 'react';
import { avatarSrc } from '../../lib/communityApi';

const PALETTE = [
  ['#1db954', '#0b3d20'], ['#ffb938', '#7a4a06'], ['#6ee9a0', '#14833c'], ['#f5a524', '#3d2503'],
  ['#38bdf8', '#0c4a6e'], ['#f472b6', '#831843'], ['#a78bfa', '#4c1d95'], ['#fb7185', '#881337'],
];

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);

/** First visible letter (works for Tamil clusters and emoji). */
const initialOf = (name) => {
  const t = String(name || '').trim();
  if (!t) return '?';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)) return segment.toUpperCase();
  }
  return [...t][0].toUpperCase();
};

/**
 * User avatar: the uploaded picture, or a generated gradient with the user's initial.
 * @param {{ user?: { name?: string, username?: string, avatarUrl?: string|null }, size?: number, className?: string }} props
 */
const Avatar = ({ user, size = 40, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const src = !failed ? avatarSrc(user?.avatarUrl) : null;
  const [from, to] = PALETTE[hash(user?.username || user?.name || '') % PALETTE.length];
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.42) };

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={style}
        className={`rounded-full object-cover bg-surface-3 flex-shrink-0 ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      className={`rounded-full inline-flex items-center justify-center font-black text-white flex-shrink-0 select-none ${className}`}
    >
      {initialOf(user?.name)}
    </span>
  );
};

export default memo(Avatar);
