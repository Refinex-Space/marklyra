import { Skeleton, SkeletonBar } from '../../components/Skeleton.js';
import './document-skeleton.css';

// A title, then paragraphs of ragged lines: the silhouette of a page of prose.
const paragraphs = [
  [100, 96, 88, 42],
  [100, 91, 97, 100, 58],
  [96, 84, 34],
];

/**
 * Stands in for the document card until the editor has started and the window has restored what
 * it was showing. It covers the card, so the window's first paint is already the page layout.
 */
export function DocumentSkeleton() {
  return (
    <Skeleton className="document-skeleton" label="正在准备编辑器">
      <div className="document-skeleton-page">
        <SkeletonBar className="document-skeleton-title" width="46%" height={26} radius={6} />
        {paragraphs.map((lines, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative paragraphs
          <div key={index} className="document-skeleton-paragraph">
            {lines.map((width, line) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative lines
              <SkeletonBar key={line} width={`${width}%`} height={11} />
            ))}
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
