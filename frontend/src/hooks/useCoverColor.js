import { useEffect, useState } from 'react';
import { getCoverColor, colorFromSeed, rgbVar } from '../lib/coverColor';

/**
 * Returns a "r g b" string for rgb(var(--cover-rgb) / a). Starts with a stable seed-based colour (no flash),
 * then upgrades to the real artwork colour when the image allows it.
 */
export const useCoverColor = (imageUrl, seed) => {
  const [rgb, setRgb] = useState(() => rgbVar(colorFromSeed(seed || imageUrl)));

  useEffect(() => {
    let cancelled = false;
    setRgb(rgbVar(colorFromSeed(seed || imageUrl)));
    getCoverColor(imageUrl, seed).then((c) => {
      if (!cancelled) setRgb(rgbVar(c));
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, seed]);

  return rgb;
};

export default useCoverColor;
