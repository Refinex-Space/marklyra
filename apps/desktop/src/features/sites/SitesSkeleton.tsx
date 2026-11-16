import { Skeleton, SkeletonBar, SkeletonRows } from '../../components/Skeleton.js';

/** The group list before it has arrived: in the footprint of the navigation rows. */
export function NavSkeleton() {
  return (
    <div className="site-nav-skeleton">
      <SkeletonRows rows={8} icon height={30} />
    </div>
  );
}

/** Six cards in the footprint of real ones, so nothing jumps when the sites arrive. */
export function CardsSkeleton() {
  return (
    <Skeleton className="site-cards-skeleton">
      <div className="site-grid">
        {Array.from({ length: 6 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative cards
          <div key={index} className="site-card skeleton">
            <div className="site-card-top">
              <SkeletonBar width={40} height={40} radius={10} />
              <div className="site-card-titles">
                <SkeletonBar width="58%" height={12} />
                <SkeletonBar width="38%" height={9} />
              </div>
            </div>
            <SkeletonBar width="92%" height={9} />
            <SkeletonBar width="64%" height={9} />
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
