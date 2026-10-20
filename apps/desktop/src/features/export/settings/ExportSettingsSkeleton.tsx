import { Skeleton, SkeletonBar } from '../../../components/Skeleton.js';

const navWidths = [72, 58, 66, 50, 62, 44];
const rowWidths = [
  [38, 72],
  [46, 60],
  [32, 84],
  [52, 66],
];

/** The page list and one card of settings rows, in the footprint of the loaded export page. */
export function ExportSettingsSkeleton() {
  return (
    <Skeleton className="es-layout es-skeleton" label="正在读取导出设置">
      <div className="es-nav">
        {navWidths.map((width, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
          <span key={index} className="es-skeleton-tab">
            <SkeletonBar width={`${width}%`} height={10} />
          </span>
        ))}
      </div>
      <div className="es-skeleton-card">
        {rowWidths.map(([title, hint], index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative rows
          <span key={index} className="es-skeleton-row">
            <span className="es-skeleton-copy">
              <SkeletonBar width={`${title}%`} height={11} />
              <SkeletonBar width={`${hint}%`} />
            </span>
            <SkeletonBar width={72} height={26} radius={7} />
          </span>
        ))}
      </div>
    </Skeleton>
  );
}
