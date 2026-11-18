import React from 'react';
import BottomSheet from '../common/BottomSheet';

/** "Already in queue - add again?" Shown when the user adds a song that is already queued. */
const DuplicateQueuePrompt = ({ prompt, onChoose }) => (
  <BottomSheet open={Boolean(prompt)} onClose={() => onChoose('cancel')} title="Already in queue" subtitle={prompt?.song?.title}>
    <p className="text-sm text-zinc-300 py-2">
      This song is already in your queue. Add it again, or move the queued copy {prompt?.where === 'next' ? 'to play next' : 'to the end of your queue'}?
    </p>
    <div className="flex flex-col gap-2 py-3">
      <button type="button" data-autofocus onClick={() => onChoose('again')} className="press min-h-11 rounded-full bg-brand-500 hover:bg-brand-400 text-black text-sm font-bold">Add again</button>
      <button type="button" onClick={() => onChoose('move')} className="press min-h-11 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold">Move the queued copy</button>
      <button type="button" onClick={() => onChoose('cancel')} className="press min-h-11 rounded-full text-zinc-300 hover:text-white text-sm font-semibold">Cancel</button>
    </div>
  </BottomSheet>
);

export default DuplicateQueuePrompt;
