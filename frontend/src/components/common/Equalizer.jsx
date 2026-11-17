import React from 'react';

/** Three animated bars (CSS only). `playing=false` freezes them at a low height. */
const Equalizer = ({ playing = true, className = '' }) => (
  <span
    aria-hidden="true"
    data-testid="equalizer"
    className={`inline-flex items-end gap-[2px] h-3.5 w-4 ${className}`}
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className={`flex-1 rounded-sm bg-brand-400 h-full ${playing ? 'eq-bar' : ''}`}
        style={playing ? undefined : { transform: 'scaleY(0.3)', transformOrigin: 'bottom' }}
      />
    ))}
  </span>
);

export default Equalizer;
