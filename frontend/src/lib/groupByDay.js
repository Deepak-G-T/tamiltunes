// Group history items by day: Today, Yesterday, Earlier this week, Older. Order within a group is preserved.
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const dayLabel = (iso, now = Date.now()) => {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return 'Older';
  const diffDays = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(t))) / 86400000);
  if (diffDays <= 0) return 'Today'; // includes slightly-future timestamps (clock skew)
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'Earlier this week';
  return 'Older';
};

/** items: [{ playedAt | createdAt }]. Returns [{ label, items: [{ item, index }] }] in first-seen order. */
export const groupByDay = (items, now = Date.now()) => {
  const groups = [];
  (items || []).forEach((item, index) => {
    const label = dayLabel(item?.playedAt || item?.createdAt, now);
    let g = groups.find((x) => x.label === label);
    if (!g) {
      g = { label, items: [] };
      groups.push(g);
    }
    g.items.push({ item, index });
  });
  return groups;
};
