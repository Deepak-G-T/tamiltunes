import React from 'react';

// Fixed card width so a row scrolls horizontally (Spotify-style shelf)
const ITEM_CLASS = 'w-[150px] sm:w-[170px] md:w-[188px] flex-shrink-0 snap-start';

const SkeletonCard = () => (
  <div className={`${ITEM_CLASS} bg-surface-2 rounded-card p-3 md:p-4`}>
    <div className="aspect-square w-full rounded-md shimmer mb-3" />
    <div className="h-3 w-3/4 rounded shimmer mb-2" />
    <div className="h-3 w-1/2 rounded shimmer" />
  </div>
);

/**
 * Titled horizontal row of cards. `loading` shows skeleton cards.
 * Children are wrapped to a fixed width; the row scrolls with scroll-snap on touch.
 */
const Shelf = ({ title, subtitle, onShowAll, loading = false, children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!loading && items.length === 0) return null;

  return (
    <section aria-label={title}>
      <div className="flex items-end justify-between mb-3 md:mb-4">
        <div className="min-w-0">
          {loading && !title ? (
            <div aria-hidden="true" className="h-7 md:h-8 w-44 rounded shimmer" /> // same height as a real title: no jump when the shelf loads
          ) : (
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight hover:underline decoration-2 underline-offset-4">
              {title}
            </h2>
          )}
          {!loading && subtitle && <p className="text-xs md:text-sm text-zinc-400 mt-0.5 truncate" title={subtitle}>{subtitle}</p>}
        </div>
        {onShowAll && (
          <button onClick={onShowAll} className="text-sm font-bold text-zinc-400 hover:text-white hover:underline">
            Show all
          </button>
        )}
      </div>
      <div className="-mx-4 md:-mx-6 px-4 md:px-6 flex gap-3 md:gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-px-4 md:scroll-px-6 pb-2 stagger">
        {loading
          ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
          : items.map((child, i) => (
              <div key={child.key ?? i} className={ITEM_CLASS}>
                {child}
              </div>
            ))}
      </div>
    </section>
  );
};

export default Shelf;
