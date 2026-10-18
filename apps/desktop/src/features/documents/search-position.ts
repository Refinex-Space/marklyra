import type { WorkspaceMatchPosition } from '../../services/workspaces.js';

/** UTF-16LE FNV-1a, matching the index's read-only hint. Never an access token.
 * Two 32-bit limbs avoid a BigInt allocation for every byte in large matches. */
export function searchFingerprint(text: string): string {
  let high = 0xcbf29ce4;
  let low = 0x84222325;
  const byte = (value: number) => {
    low = (low ^ value) >>> 0;
    const product = low * 0x1b3;
    high =
      (Math.imul(high, 0x1b3) + Math.imul(low, 0x100) + Math.floor(product / 0x100000000)) >>> 0;
    low = product >>> 0;
  };
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    byte(unit & 0xff);
    byte(unit >>> 8);
  }
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}

function splitsSurrogate(text: string, offset: number): boolean {
  return (
    offset > 0 &&
    offset < text.length &&
    text.charCodeAt(offset - 1) >= 0xd800 &&
    text.charCodeAt(offset - 1) <= 0xdbff &&
    text.charCodeAt(offset) >= 0xdc00 &&
    text.charCodeAt(offset) <= 0xdfff
  );
}

/** Line endings and columns follow the decoded source, never the preview. */
export function searchPositionIsCurrent(source: string, match: WorkspaceMatchPosition): boolean {
  if (
    !Number.isSafeInteger(match.line) ||
    match.line < 1 ||
    !Number.isSafeInteger(match.column) ||
    match.column < 1 ||
    !Number.isSafeInteger(match.matchLength) ||
    match.matchLength < 0
  )
    return false;
  let offset = 0;
  let line = 1;
  while (line < match.line && offset < source.length) {
    const character = source[offset++];
    if (character === '\r') {
      if (source[offset] === '\n') offset++;
      line++;
    } else if (character === '\n') line++;
  }
  if (line !== match.line) return false;
  let endOfLine = offset;
  while (endOfLine < source.length && source[endOfLine] !== '\r' && source[endOfLine] !== '\n')
    endOfLine++;
  const start = offset + match.column - 1;
  const end = start + match.matchLength;
  if (
    start > endOfLine ||
    end > endOfLine ||
    splitsSurrogate(source, start) ||
    splitsSurrogate(source, end)
  )
    return false;
  if (
    match.sourceFingerprint !== undefined &&
    (!/^[0-9a-f]{16}$/.test(match.sourceFingerprint) ||
      searchFingerprint(source) !== match.sourceFingerprint)
  )
    return false;
  const text = source.slice(start, end);
  if (
    match.expectedText !== undefined &&
    match.expectedText !== null &&
    text !== match.expectedText
  )
    return false;
  if (
    match.matchFingerprint !== undefined &&
    (!/^[0-9a-f]{16}$/.test(match.matchFingerprint) ||
      searchFingerprint(text) !== match.matchFingerprint)
  )
    return false;
  return true;
}

export const STALE_SEARCH_POSITION =
  '搜索结果对应的正文已变化，未跳转到旧位置。请保存当前文稿或重新搜索。';
