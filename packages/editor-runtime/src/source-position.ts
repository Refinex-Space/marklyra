/** Convert one-based UTF-16 line/column without normalizing source line endings. */
export function offsetAt(source: string, line: number, column: number): number {
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1)
    throw new RangeError('Source position must be positive one-based UTF-16 coordinates');
  let start = 0;
  for (let current = 1; current < line; current++) {
    const end = source.slice(start).search(/[\r\n]/);
    if (end < 0) throw new RangeError('Source line is outside the document');
    start += end;
    start += source[start] === '\r' && source[start + 1] === '\n' ? 2 : 1;
  }
  const ending = source.slice(start).search(/[\r\n]/);
  const length = ending < 0 ? source.length - start : ending;
  if (column > length + 1) throw new RangeError('Source column is outside the line');
  return start + column - 1;
}
export function positionAt(source: string, offset: number): { line: number; column: number } {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > source.length)
    throw new RangeError('Source offset is outside the document');
  let line = 1;
  let start = 0;
  for (let index = 0; index < offset; index++) {
    if (source[index] !== '\r' && source[index] !== '\n') continue;
    if (source[index] === '\r' && source[index + 1] === '\n') {
      if (index + 1 === offset) throw new RangeError('Source offset splits CRLF');
      index++;
    }
    line++;
    start = index + 1;
  }
  return { line, column: offset - start + 1 };
}
