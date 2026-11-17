import React, { memo } from 'react';

// Compact built-in set (no dependency): music + reactions common in Tamil fan comments.
const EMOJI = [
  '🔥', '❤️', '😍', '🥹', '😭', '😂', '🙏', '👏', '🎶', '🎧', '🎵', '🎤',
  '💯', '✨', '🤩', '😎', '🥳', '💃', '🕺', '🪔', '🌹', '💚', '🙌', '👌',
  '🤯', '😊', '😢', '🥰', '👍', '💔', '🌟', '⚡', '🎬', '🎹', '🥁', '🎻',
];

const EmojiPicker = ({ onPick }) => (
  <div role="group" aria-label="Emoji" className="grid grid-cols-9 gap-0.5 p-2 rounded-xl bg-surface-3 border border-white/10">
    {EMOJI.map((e) => (
      <button
        key={e}
        type="button"
        onClick={() => onPick(e)}
        aria-label={`Insert ${e}`}
        className="press h-9 rounded-lg text-xl hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
      >
        {e}
      </button>
    ))}
  </div>
);

export default memo(EmojiPicker);
