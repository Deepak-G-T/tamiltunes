import React, { useEffect, useState } from 'react';

const COVER_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='150' r='60' fill='%231db954' opacity='0.2'/%3E%3Cpath d='M135 180V120l50-14v54m-50 0a16 16 0 11-32 0 16 16 0 0132 0zm50-14a16 16 0 11-32 0 16 16 0 0132 0z' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const ARTIST_FALLBACK = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23143d24'/%3E%3Cstop offset='50%25' stop-color='%230f2a1a'/%3E%3Cstop offset='100%25' stop-color='%23071a10'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' fill='url(%23bg)'/%3E%3Ccircle cx='150' cy='120' r='45' fill='%231db954' opacity='0.3'/%3E%3Cpath d='M90 240c0-33 27-60 60-60s60 27 60 60' stroke='%236ee9a0' stroke-width='6' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='150' cy='120' r='35' stroke='%236ee9a0' stroke-width='6' fill='none'/%3E%3C/svg%3E";

/**
 * Cover/artist picture that never shows broken-image alt text and never depends on an outside host:
 * an empty `src` or a failed load switches to a built-in green placeholder.
 */
const CoverImage = ({ src, alt = '', variant = 'cover', className = '', ...rest }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const fallback = variant === 'artist' ? ARTIST_FALLBACK : COVER_FALLBACK;
  return (
    <img
      src={!src || failed ? fallback : src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
      {...rest}
    />
  );
};

export default CoverImage;
