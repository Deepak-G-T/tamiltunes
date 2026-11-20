import React, { useEffect, useRef, useState } from 'react';

/**
 * One line of text that shows in full. If it does not fit it scrolls slowly back and forth (not when the person prefers reduced
 * motion); tapping it shows the whole text on several lines, tapping again folds it. The full text is always in `title`
 * and `aria-label` too.
 */
const MarqueeText = ({ text, className = '', align = 'center' }) => {
  const box = useRef(null);
  const inner = useRef(null);
  const [overflow, setOverflow] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      setOverflow(Math.max(0, Math.ceil(inner.current.scrollWidth - box.current.clientWidth)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, open]);

  const moving = overflow > 0 && !open;
  return (
    <button type="button" ref={box} onClick={() => setOpen((o) => !o)} title={text} aria-label={text} aria-expanded={open}
      data-testid="marquee-text" data-overflow={overflow > 0 ? 'true' : 'false'}
      className={`block w-full ${align === 'left' ? 'text-left' : 'text-center'} bg-transparent p-0 min-h-[24px] ${open ? '' : 'overflow-hidden whitespace-nowrap'} ${className}`}>
      <span ref={inner} className={`${open ? 'whitespace-normal break-words' : 'inline-block'} ${moving ? 'marquee-slide' : ''}`}
        style={moving ? { '--marquee-shift': `-${overflow + 8}px`, animationDuration: `${Math.max(6, overflow / 14 + 4)}s` } : undefined}>
        {text}
      </span>
    </button>
  );
};

export default MarqueeText;
