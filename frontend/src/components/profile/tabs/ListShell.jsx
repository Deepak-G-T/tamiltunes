import React from 'react';
import { Loader2 } from 'lucide-react';
import { RowSkeleton, SkeletonList } from '../../common/Skeleton';
import { ErrorState, EmptyState } from '../../common/StateViews';

/** Shared loading / error / empty / load-more wrapper for tab lists. */
const ListShell = ({ list, label, emptyIcon, emptyTitle, emptyText, emptyAction, children }) => {
  if (list.status === 'loading') return <SkeletonList label={`Loading ${label}`}>{[0, 1, 2, 3, 4].map((i) => <RowSkeleton key={i} />)}</SkeletonList>;
  if (list.status === 'error') return <ErrorState message={list.error} onRetry={list.reload} compact />;
  if (list.items.length === 0) return <EmptyState icon={emptyIcon} title={emptyTitle} text={emptyText} action={emptyAction} compact />;
  return (
    <>
      {children}
      {list.hasMore && (
        <div className="pt-3 text-center">
          <button type="button" onClick={list.loadMore} disabled={list.loadingMore}
            className="press px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 inline-flex items-center gap-2">
            {list.loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {list.loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
};

export default ListShell;
