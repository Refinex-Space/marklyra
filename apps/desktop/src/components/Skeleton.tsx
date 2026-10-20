import type { CSSProperties, HTMLAttributes } from 'react';
import './skeleton.css';

/**
 * The one loading placeholder of the app shell. It carries no visible text: bars stand in for the
 * content that is being read, a slow highlight sweeps across them, and nothing at all appears for
 * a read that finishes within a blink (see skeleton.css). Compose the layout of the real content
 * from `SkeletonBar`s inside it.
 */
export function Skeleton({
  label = '正在读取',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return (
    <div
      {...rest}
      className={className ? `skeleton ${className}` : 'skeleton'}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      {children}
    </div>
  );
}

/** A placeholder for one run of content. A number is pixels; a string is any CSS length. */
export function SkeletonBar({
  width,
  height,
  radius,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}) {
  const style: Record<string, string> = {};
  const length = (value: number | string) => (typeof value === 'number' ? `${value}px` : value);
  if (width !== undefined) style['--skeleton-width'] = length(width);
  if (height !== undefined) style['--skeleton-height'] = length(height);
  if (radius !== undefined) style['--skeleton-radius'] = length(radius);
  return (
    <i
      className={className ? `skeleton-bar ${className}` : 'skeleton-bar'}
      style={style as CSSProperties}
      aria-hidden="true"
    />
  );
}

// Deterministic widths keep a list calm and identical between renders.
const rowWidths = [58, 44, 66, 50, 62, 40];

/**
 * Placeholder rows for a list that is still being read: an optional leading icon, a title bar and,
 * with `lines={2}`, a shorter second line under it. `height` is the row height of the real list.
 */
export function SkeletonRows({
  rows = 3,
  icon = false,
  lines = 1,
  height = 32,
  label,
  className,
}: {
  rows?: number;
  /** A leading icon placeholder; a number is its size in pixels (default 16). */
  icon?: boolean | number;
  lines?: 1 | 2;
  height?: number;
  label?: string;
  className?: string;
}) {
  return (
    <Skeleton
      className={className ? `skeleton-rows ${className}` : 'skeleton-rows'}
      {...(label ? { label } : {})}
    >
      {Array.from({ length: rows }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
          key={index}
          className="skeleton-row"
          style={{ '--skeleton-row-height': `${height}px` } as CSSProperties}
        >
          {icon && (
            <SkeletonBar
              width={typeof icon === 'number' ? icon : 16}
              height={typeof icon === 'number' ? icon : 16}
              radius={4}
            />
          )}
          <span className="skeleton-row-text">
            <SkeletonBar width={`${rowWidths[index % rowWidths.length]}%`} height={10} />
            {lines === 2 && (
              <SkeletonBar width={`${(rowWidths[(index + 2) % rowWidths.length] ?? 50) + 12}%`} />
            )}
          </span>
        </span>
      ))}
    </Skeleton>
  );
}
