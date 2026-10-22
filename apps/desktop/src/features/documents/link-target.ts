import { displayPath } from '../../services/display-path.js';

export type LinkTarget =
  | { ok: true; relativePath: string; anchor: string }
  | { ok: false; reason: string };

const DRIVE = /^[A-Za-z]:\//;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:(?!\/)/;

function slashed(path: string): string {
  return displayPath(path).replace(/\\/g, '/');
}
function segments(path: string): string[] | null {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out;
}
function absolute(path: string): boolean {
  return path.startsWith('/') || DRIVE.test(path);
}
/** The editor already percent-decoded the text it reports; only the anchor and query remain to split. */
function split(url: string, anchor: string): { path: string; anchor: string } {
  let path = url.trim().replace(/^<|>$/g, '');
  let hash = anchor;
  const mark = path.search(/[#?]/);
  if (mark >= 0) {
    const tail = path.slice(mark);
    // A real file name may contain '#' or '?'; only treat it as a suffix when no such file name is
    // plausible, i.e. what follows has no separator or dot.
    if (/^[#?][^./\\]*$/.test(tail)) {
      if (tail.startsWith('#') && !hash) hash = tail;
      path = path.slice(0, mark);
    }
  }
  return { path, anchor: hash };
}
/**
 * Resolves a document link to a path inside the open folder. The link may be relative to the current
 * document, absolute, or a file: URL. Nothing outside the folder is ever returned: the shell only opens
 * documents it can address through a folder it already holds.
 */
export function resolveLinkTarget(
  url: string,
  anchor: string,
  currentPath: string | null,
  workspacePath: string | null,
): LinkTarget {
  if (!workspacePath) return { ok: false, reason: '请先打开包含该文档的文件夹，再通过链接跳转' };
  const parsed = split(url.replace(/^file:\/\//i, ''), anchor);
  const raw = parsed.path.replace(/\\/g, '/');
  if (!raw || SCHEME.test(raw)) return { ok: false, reason: `无法打开链接：${url}` };
  const root = slashed(workspacePath);
  let full: string;
  if (absolute(raw)) full = raw.replace(/^\/(?=[A-Za-z]:\/)/, '');
  else if (raw.startsWith('~/')) return { ok: false, reason: `无法解析主目录链接：${url}` };
  else {
    if (!currentPath)
      return { ok: false, reason: '当前文档尚未保存，无法解析相对链接，请先保存后再试' };
    const base = slashed(currentPath);
    full = `${base.slice(0, base.lastIndexOf('/') + 1)}${raw}`;
  }
  const rootParts = segments(root);
  const fullParts = segments(full);
  if (!rootParts || !fullParts) return { ok: false, reason: `链接超出可访问范围：${url}` };
  // Case-insensitive only where the volume is (a drive letter or UNC share); never on POSIX paths.
  const fold = DRIVE.test(root) || root.startsWith('//');
  const same = (a: string, b: string) => (fold ? a.toLowerCase() === b.toLowerCase() : a === b);
  const inside =
    fullParts.length > rootParts.length &&
    rootParts.every((part, i) => same(part, fullParts[i] ?? ''));
  if (!inside)
    return { ok: false, reason: `链接目标不在当前打开的文件夹内，未打开：${displayPath(full)}` };
  return {
    ok: true,
    relativePath: fullParts.slice(rootParts.length).join('/'),
    anchor: parsed.anchor,
  };
}
