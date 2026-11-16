import { type CSSProperties, useState } from 'react';
import { colorValue } from './model/colors.js';
import { letterMark } from './model/letter.js';

/**
 * A site's mark: its first letter on a tint of its group's colour. Fetched icons arrive with
 * the metadata work; until then, and for sites without one, this is the mark.
 */
export function SiteMark({
  title,
  color,
  size,
  src,
  fetching = false,
}: {
  title: string;
  color: string;
  size: 'sm' | 'lg';
  /** A fetched icon. Absent values keep the letter. */
  src?: string | null;
  fetching?: boolean;
}) {
  const custom = color.startsWith('#');
  // An icon the WebView cannot decode shows the letter, not a broken-image glyph.
  const [failed, setFailed] = useState<string | null>(null);
  const image = src && src !== failed ? src : null;
  return (
    <span
      className={`site-mark ${size}${custom ? ' custom' : ''}${fetching && !image ? ' fetching' : ''}`}
      style={{ '--site-mark-raw': colorValue(color) } as CSSProperties}
      aria-hidden="true"
    >
      {image ? <img src={image} alt="" onError={() => setFailed(image)} /> : letterMark(title)}
      {fetching && !image ? <span className="skeleton-bar site-mark-sweep" /> : null}
    </span>
  );
}
