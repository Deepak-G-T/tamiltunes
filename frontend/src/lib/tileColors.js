// Solid tile backgrounds for browse/explore grids (cycled). Dark enough for white text.
export const TILE_COLORS = [
  'bg-emerald-700', 'bg-rose-700', 'bg-indigo-700', 'bg-amber-700',
  'bg-sky-700', 'bg-fuchsia-800', 'bg-teal-700', 'bg-orange-700'
];

export const tileColor = (index) => TILE_COLORS[((index % TILE_COLORS.length) + TILE_COLORS.length) % TILE_COLORS.length];
