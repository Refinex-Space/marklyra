import { displayPath } from '../../services/display-path.js';

export const recentFileName = (name: string) =>
  name.replace(/\.(md|markdown|mdx|mkd|mdown|txt|text)$/i, '');

/** Short location for display only; the host's opaque ID remains the authority. */
export function recentFileLocation(path: string): string {
  const parts = displayPath(path).replaceAll('\\', '/').split('/').filter(Boolean);
  return parts.slice(-3, -1).join(' › ');
}
