import { applyImagePatches, imageDestinations } from '../images/references.js';

/** What the isolated renderer resolved for the images of one document. */
export interface ExportImageSet {
  /** Markdown image destination → self-contained `data:` URL. */
  images: Record<string, string>;
  /** Destinations that could not be resolved (missing file, unauthorised, remote, too large). */
  missing: string[];
}
export const MAX_EXPORT_IMAGES = 128;

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces image destinations in Markdown source with the data URLs resolved for them, so a
 * converter that never touches the file system still finds every picture. Only image
 * destinations are rewritten, never text that merely looks like one.
 */
export function embedImages(source: string, images: Readonly<Record<string, string>>): string {
  const known = Object.keys(images);
  if (!known.length) return source;
  try {
    const patches = imageDestinations(source).flatMap((item) => {
      const data = images[item.source];
      return data === undefined ? [] : [{ from: item.from, to: item.to, insert: data }];
    });
    return applyImagePatches(source, patches);
  } catch {
    // An unusual image syntax (or an image that is already a data URL) makes the strict scanner
    // refuse the whole document; fall back to the two forms an editor emits.
    let next = source;
    for (const destination of known) {
      const data = images[destination];
      if (data === undefined) continue;
      const escaped = escapePattern(destination);
      next = next
        .replace(
          new RegExp(`(!\\[[^\\]\\r\\n]*\\]\\(\\s*<?)${escaped}(>?(?:\\s+(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'))?\\s*\\))`, 'g'),
          (_all, before: string, after: string) => `${before}${data}${after}`,
        )
        .replace(
          new RegExp(`(<img\\b[^>]*?\\bsrc\\s*=\\s*["'])${escaped}(["'])`, 'gi'),
          (_all, before: string, after: string) => `${before}${data}${after}`,
        );
    }
    return next;
  }
}
