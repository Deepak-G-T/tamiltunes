import React from 'react';

/** Placeholder block using the shared shimmer animation. */
export const Skeleton = ({ className = '' }) => (
  <div aria-hidden="true" className={`shimmer rounded-md bg-surface-3 ${className}`} />
);

export const RowSkeleton = () => (
  <div className="flex items-center gap-3 p-2.5" aria-hidden="true">
    <Skeleton className="w-11 h-11 rounded-lg flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  </div>
);

/** Wrapper that announces loading to assistive tech. */
export const SkeletonList = ({ children, label = 'Loading' }) => (
  <div role="status" aria-label={label} aria-busy="true">{children}</div>
);
