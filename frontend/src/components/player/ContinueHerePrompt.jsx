import React from 'react';
import BottomSheet from '../common/BottomSheet';

/** "Continue on this device?" Shown when another device has saved a newer queue. */
const ContinueHerePrompt = ({ open, onChoose }) => (
  <BottomSheet open={open} onClose={() => onChoose('keep')} title="Continue on this device?">
    <p className="text-sm text-zinc-300 py-2">
      Your queue was changed on another device. Load that queue here (it will be paused where you left off), or keep the queue on this device.
    </p>
    <div className="flex flex-col gap-2 py-3">
      <button type="button" data-autofocus onClick={() => onChoose('continue')} className="press min-h-11 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold">Continue here</button>
      <button type="button" onClick={() => onChoose('keep')} className="press min-h-11 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold">Keep this queue</button>
    </div>
  </BottomSheet>
);

export default ContinueHerePrompt;
