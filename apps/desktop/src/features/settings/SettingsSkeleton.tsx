import type { CSSProperties } from 'react';
import { Skeleton, SkeletonBar } from '../../components/Skeleton.js';
import './settings-skeleton.css';

const navWidths = [54, 62, 48, 58, 66, 50, 56];
const cards = [
  [
    [34, 70],
    [42, 58],
    [30, 80],
  ],
  [
    [38, 64],
    [46, 76],
  ],
  [
    [32, 72],
    [44, 56],
    [36, 82],
  ],
];

/**
 * The settings page before its page has arrived: the sidebar of sections and cards of rows,
 * in the footprint of the real page. Settings pages draw their own content in an isolated
 * runtime, so this is what the window shows until that runtime reports it is ready.
 */
export function SettingsSkeleton({ sidebarWidth }: { sidebarWidth?: number }) {
  return (
    <Skeleton
      className="settings-skeleton"
      label="正在打开设置"
      style={
        sidebarWidth === undefined
          ? undefined
          : ({ '--settings-skeleton-sidebar': `${sidebarWidth}px` } as CSSProperties)
      }
    >
      <div className="settings-skeleton-sidebar">
        <span className="settings-skeleton-back" />
        {navWidths.map((width, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
          <span key={index} className="settings-skeleton-nav">
            <SkeletonBar width={16} height={16} radius={4} />
            <SkeletonBar width={`${width}%`} height={10} />
          </span>
        ))}
      </div>
      <div className="settings-skeleton-content">
        <SkeletonBar width={120} height={22} radius={6} />
        {cards.map((rows, card) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative cards
          <div key={card} className="settings-skeleton-card">
            {rows.map(([title, hint], row) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
              <span key={row} className="settings-skeleton-row">
                <span className="settings-skeleton-copy">
                  <SkeletonBar width={`${title}%`} height={11} />
                  <SkeletonBar width={`${hint}%`} />
                </span>
                <SkeletonBar width={52} height={22} radius={11} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
