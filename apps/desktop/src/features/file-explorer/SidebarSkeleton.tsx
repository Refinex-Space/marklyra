import type { CSSProperties } from 'react';

type Variant = 'tree' | 'articles';

// Deterministic widths keep the placeholder calm and identical between renders.
const treeWidths = [62, 48, 71, 54, 66, 44, 58];
const articleWidths = [
  [38, 74, 92],
  [30, 58, 84],
  [44, 82, 70],
  [34, 64, 90],
];

/**
 * Quiet placeholder rows for a list that is still being read. It carries no visible text: the
 * motion is a slow highlight sweep that only appears if the read takes longer than a blink.
 */
export function SidebarSkeleton({ variant, rows }: { variant: Variant; rows?: number }) {
  const count = rows ?? (variant === 'tree' ? 6 : 4);
  return (
    <div
      className="sidebar-skeleton"
      data-variant={variant}
      role="status"
      aria-label="正在读取"
      aria-live="polite"
    >
      {Array.from({ length: count }, (_, index) =>
        variant === 'tree' ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
            key={index}
            className="sidebar-skeleton-row"
            style={
              { '--skeleton-width': `${treeWidths[index % treeWidths.length]}%` } as CSSProperties
            }
          >
            <i className="sidebar-skeleton-icon" />
            <i className="sidebar-skeleton-bar" />
          </span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
            key={index}
            className="sidebar-skeleton-card"
          >
            {(articleWidths[index % articleWidths.length] ?? []).map((width, line) => (
              <i
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
                key={line}
                className="sidebar-skeleton-bar"
                style={{ '--skeleton-width': `${width}%` } as CSSProperties}
              />
            ))}
          </span>
        ),
      )}
    </div>
  );
}

/** Placeholder lines shown in an article row whose preview has not been read yet. */
export function SummarySkeleton() {
  return (
    <span className="sidebar-skeleton-summary" aria-hidden="true">
      <i className="sidebar-skeleton-bar" style={{ '--skeleton-width': '92%' } as CSSProperties} />
      <i className="sidebar-skeleton-bar" style={{ '--skeleton-width': '64%' } as CSSProperties} />
    </span>
  );
}
