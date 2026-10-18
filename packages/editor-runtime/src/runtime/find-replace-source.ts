import type { Patch } from '@marklyra/editor-core';

export interface FindSourceHit {
  start: number;
  end: number;
}

/** Native matching proves this exact range. Native string replacement receives
 * that one match against the complete input, including lookaround/context. */
export function findReplaceSourceMatch(
  source: string,
  hit: FindSourceHit,
  regexp: RegExp,
  replacement: string,
  ending: string,
): string | undefined {
  if (
    !Number.isSafeInteger(hit.start) ||
    !Number.isSafeInteger(hit.end) ||
    hit.start < 0 ||
    hit.end <= hit.start ||
    hit.end > source.length ||
    !['\n', '\r\n'].includes(ending)
  )
    return;
  const pattern = new RegExp(regexp.source, regexp.flags.replace(/[gy]/g, '') + 'g');
  pattern.lastIndex = hit.start;
  const match = pattern.exec(source);
  if (!match || match.index !== hit.start || match[0].length !== hit.end - hit.start) return;
  let token = '\uE000marklyra-single-find\uE001';
  while (source.includes(token) || replacement.includes(token)) token += '\uE002';
  const open = token + 'A',
    close = token + 'B';
  // Some WebKit builds exec sticky lookbehind correctly but fail to replace
  // it. Feed only this already-proved native match to a disposable global clone.
  let pending: RegExpExecArray | null = match;
  pattern.exec = () => {
    const result = pending;
    pending = null;
    return result;
  };
  const marked = source.replace(pattern, open + replacement + close);
  const begin = marked.indexOf(open),
    end = marked.indexOf(close, begin + open.length);
  if (begin !== hit.start || end < 0 || marked.slice(end + close.length) !== source.slice(hit.end))
    return;
  return marked.slice(begin + open.length, end).replace(/\r\n?|\n/g, ending);
}

/** Prove the local source ranges of the original Source replace-all. Native JS
 * replacement expands capture/context tokens; this adapter does not implement
 * a second replacement engine or infer ranges from a repeated-text diff. */
export function findReplaceSourcePatches(
  source: string,
  hits: readonly FindSourceHit[],
  regexp: RegExp,
  replacement: string,
  regexReplacement: boolean,
  ending: string,
): Patch[] | undefined {
  if (!regexp.global || !hits.length || hits.length > 5_000 || !['\n', '\r\n'].includes(ending))
    return;
  const pattern = new RegExp(regexp.source, regexp.flags);
  let index = 0;
  for (const match of source.matchAll(pattern)) {
    const hit = hits[index++];
    if (
      !hit ||
      match[0].length === 0 ||
      hit.start !== match.index ||
      hit.end !== match.index + match[0].length
    )
      return;
  }
  if (index !== hits.length) return;
  const normalize = (text: string) => text.replace(/\r\n?|\n/g, ending);
  if (!regexReplacement)
    return hits.map((hit) => ({ from: hit.start, to: hit.end, insert: normalize(replacement) }));

  // Markers cannot occur in the source, literal replacement, captures or $`/$'
  // expansions. Their boundaries recover the native replacement for each hit.
  let token = '\uE000marklyra-find\uE001';
  while (source.includes(token) || replacement.includes(token)) token += '\uE002';
  const open = `${token}A`,
    close = `${token}B`;
  const marked = source.replace(
    new RegExp(regexp.source, regexp.flags),
    open + replacement + close,
  );
  const patches: Patch[] = [];
  let cursor = 0,
    previousEnd = 0;
  for (const hit of hits) {
    const begin = marked.indexOf(open, cursor);
    if (begin < 0 || marked.slice(cursor, begin) !== source.slice(previousEnd, hit.start)) return;
    const end = marked.indexOf(close, begin + open.length);
    if (end < 0) return;
    patches.push({
      from: hit.start,
      to: hit.end,
      insert: normalize(marked.slice(begin + open.length, end)),
    });
    cursor = end + close.length;
    previousEnd = hit.end;
  }
  return marked.slice(cursor) === source.slice(previousEnd) ? patches : undefined;
}
