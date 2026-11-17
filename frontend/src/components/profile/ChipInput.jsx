import React, { useState, useId } from 'react';
import { X } from 'lucide-react';

/**
 * Small tag editor: Enter or comma adds a chip, Backspace on empty removes the last.
 * @param {{ label: string, values: string[], onChange: (v: string[]) => void, max?: number, suggestions?: string[], placeholder?: string }} props
 */
const ChipInput = ({ label, values, onChange, max = 10, suggestions = [], placeholder = 'Type and press Enter' }) => {
  const [text, setText] = useState('');
  const id = useId();

  const add = (raw) => {
    const v = raw.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!v || values.length >= max || values.some((x) => x.toLowerCase() === v.toLowerCase())) { setText(''); return; }
    onChange([...values, v]);
    setText('');
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-zinc-300 mb-1">{label} <span className="text-zinc-500 font-normal">({values.length}/{max})</span></label>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-surface-3 border border-white/10 focus-within:border-brand-400 p-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-brand-500/15 text-brand-300 text-xs font-semibold">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="p-0.5 rounded-full hover:bg-white/10"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input id={id} value={text} maxLength={30} dir="auto" lang="ta" placeholder={values.length ? '' : placeholder} disabled={values.length >= max}
          onChange={(e) => { if (e.target.value.endsWith(',')) add(e.target.value.slice(0, -1)); else setText(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(text); }
            else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => add(text)}
          className="flex-1 min-w-[6rem] bg-transparent outline-none text-sm text-white placeholder:text-zinc-500 px-1 py-1" />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} disabled={values.length >= max} className="press px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-[11px] text-zinc-300 disabled:opacity-40">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChipInput;
