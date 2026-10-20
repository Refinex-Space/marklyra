import { Skeleton, SkeletonBar } from '../../components/Skeleton.js';

type Variant = 'tree' | 'articles';

// Deterministic widths keep the placeholder calm and identical between renders.
const treeWidths = [62, 48, 71, 54, 66, 44, 58];
const articleWidths = [
  [38, 74, 92],
  [30, 58, 84],
  [44, 82, 70],
  [34, 64, 90],
];

/** Quiet placeholder rows for a list that is still being read. */
export function SidebarSkeleton({ variant, rows }: { variant: Variant; rows?: number }) {
  const count = rows ?? (variant === 'tree' ? 6 : 4);
  return (
    <Skeleton className="sidebar-skeleton" data-variant={variant}>
      {Array.from({ length: count }, (_, index) =>
        variant === 'tree' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
          <span key={index} className="sidebar-skeleton-row">
            <SkeletonBar className="sidebar-skeleton-icon" width={14} height={14} radius={4} />
            <SkeletonBar width={`${treeWidths[index % treeWidths.length]}%`} />
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
          <span key={index} className="sidebar-skeleton-card">
            {(articleWidths[index % articleWidths.length] ?? []).map((width, line) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
              <SkeletonBar key={line} width={`${width}%`} />
            ))}
          </span>
        ),
      )}
    </Skeleton>
  );
}

/** Placeholder lines shown in an article row whose preview has not been read yet. */
export function SummarySkeleton() {
  return (
    <span className="sidebar-skeleton-summary" aria-hidden="true">
      <SkeletonBar width="92%" />
      <SkeletonBar width="64%" />
    </span>
  );
}
