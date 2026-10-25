import { createHash } from 'node:crypto';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const forbidden =
  /(?:^|\/)(?:private|artifacts|target|node_modules|\.git|[^/]+\.app)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:hdb|dmg|exe|msi|dylib|asar|tgz)$/i;

export function inspectPath(path) {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    Array.from(path).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    forbidden.test(path)
  )
    throw new Error(`Forbidden package path: ${JSON.stringify(path)}`);
}
function inspectMap(map, label, depth = 0) {
  if (!map || typeof map !== 'object' || depth > 8) throw new Error(`Invalid source map: ${label}`);
  for (const source of map.sources ?? []) {
    if (
      typeof source !== 'string' ||
      source.startsWith('/') ||
      source.startsWith('file:') ||
      /^[a-z]:[/\\]/i.test(source) ||
      forbidden.test(source.replaceAll('\\', '/'))
    )
      throw new Error(`Forbidden source map origin: ${label}`);
  }
  for (const section of map.sections ?? []) {
    if (!section.map || section.url)
      throw new Error(`External indexed source map cannot be inspected: ${label}`);
    inspectMap(section.map, label, depth + 1);
  }
}
function parseMap(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid source map JSON: ${label}`);
  }
}
export function inspectBytes(path, bytes) {
  if (path.endsWith('.map')) inspectMap(parseMap(bytes.toString('utf8'), path), path);
  if (/\.(?:[cm]?js|css)$/.test(path)) {
    for (const match of bytes
      .toString('utf8')
      .matchAll(
        /sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?(;base64)?,([^\s*]+)/g,
      )) {
      const source = match[1]
        ? Buffer.from(match[2], 'base64').toString('utf8')
        : decodeURIComponent(match[2]);
      inspectMap(parseMap(source, path), path);
    }
  }
}
