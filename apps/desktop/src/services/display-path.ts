/**
 * The host keeps canonical paths, which on Windows are the `\\?\D:\…` (or `\\?\UNC\server\share\…`)
 * verbatim form. That form is an identity detail; anything shown to a person uses the ordinary
 * drive or share path. Never use the result to compare or look up a stored path.
 */
export function displayPath(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}
