import type { Correspondence } from './source-mirror-ranges.js';

interface Heading {
  readonly from: number;
  readonly bodyFrom: number;
  readonly bodyTo: number;
  readonly to: number;
  readonly level: number;
  readonly body: string;
}
export interface HeadingCorrespondence {
  readonly canonicalFrom: number;
  readonly sourceTo: number;
  readonly canonicalTo: number;
  readonly spans: readonly Correspondence[];
}

/** Lexical proof for isolated, top-level headings only. Opaque/container content
 * is excluded rather than interpreting its apparent heading punctuation. */
function headings(text: string): Heading[] {
  const lines = [...text.matchAll(/[^\n]*(?:\n|$)/gu)].filter((line) => line[0]);
  const result: Heading[] = [];
  let boundary = true,
    container = false,
    frontMatter = false,
    math = false,
    fence: { marker: string; width: number } | undefined,
    opaque: { end?: string } | undefined;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    const value = line[0].replace(/\n$/u, ''),
      blank = !value.trim(),
      stripped = value
        .replace(/^(?:[ \t]*>[ \t]?|[ \t]*(?:[-+*]|\d+[.)])[ \t]+)+/u, '')
        .trimStart();
    if (index === 0 && value === '---') {
      frontMatter = true;
      boundary = false;
      continue;
    }
    if (frontMatter) {
      if (/^(?:---|\.\.\.)[ \t]*$/u.test(value)) {
        frontMatter = false;
        boundary = true;
      }
      continue;
    }
    if (fence) {
      const close = /^(`{3,}|~{3,})[ \t]*$/u.exec(stripped)?.[1];
      if (close?.[0] === fence.marker && close.length >= fence.width) fence = undefined;
      boundary = false;
      continue;
    }
    if (math) {
      if (stripped === '$$') math = false;
      boundary = false;
      continue;
    }
    if (opaque) {
      if (opaque.end ? value.toLowerCase().includes(opaque.end) : blank) opaque = undefined;
      boundary = blank;
      continue;
    }
    const open = /^(`{3,}|~{3,})(.*)$/u.exec(stripped)?.[1];
    if (open) {
      fence = { marker: open[0] ?? '`', width: open.length };
      boundary = false;
      continue;
    }
    if (stripped === '$$') {
      math = true;
      boundary = false;
      continue;
    }
    const lower = stripped.toLowerCase(),
      raw = /^<(pre|script|style|textarea)(?=[\s>]|$)/u.exec(lower)?.[1],
      end = raw
        ? `</${raw}>`
        : lower.startsWith('<!--')
          ? '-->'
          : lower.startsWith('<?')
            ? '?>'
            : lower.startsWith('<![cdata[')
              ? ']]>'
              : lower.startsWith('<!')
                ? '>'
                : undefined;
    if (end) {
      if (!lower.includes(end)) opaque = { end };
      boundary = false;
      continue;
    }
    if (/^<\/?[a-z][a-z0-9-]*(?=[\s/>]|$)/u.test(lower)) {
      opaque = {};
      boundary = false;
      continue;
    }
    if (blank) {
      boundary = true;
      continue;
    }
    if (/^[ \t]*(?:>|(?:[-+*]|\d+[.)])[ \t])/u.test(value)) {
      container = true;
      boundary = false;
      continue;
    }
    if (container) {
      if (boundary && !/^[ \t]/u.test(value)) container = false;
      else {
        boundary = false;
        continue;
      }
    }
    const indent = /^ {0,3}/u.exec(value)?.[0].length ?? 0;
    if (/^[ \t]/u.test(value.slice(indent))) {
      boundary = false;
      continue;
    }
    const from = line.index + indent,
      atx = /^(#{1,6})(?:[ \t]+|$)/u.exec(value.slice(indent));
    if (atx?.[1]) {
      const prefixEnd = indent + atx[0].length,
        content = value.slice(prefixEnd),
        close = /[ \t]+#+[ \t]*$/u.exec(content),
        body = (
          /^#+[ \t]*$/u.test(content) ? '' : close ? content.slice(0, close.index) : content
        ).replace(/[ \t]+$/u, '');
      result.push({
        from,
        bodyFrom: line.index + prefixEnd,
        bodyTo: line.index + prefixEnd + body.length,
        to: line.index + line[0].length,
        level: atx[1].length,
        body,
      });
      boundary = true;
      continue;
    }
    const next = lines[index + 1],
      underline = next && /^ {0,3}(=+|-+)[ \t]*(?:\n|$)$/u.exec(next[0]),
      body = value.slice(indent).replace(/[ \t]+$/u, '');
    if (
      boundary &&
      next &&
      underline?.[1] &&
      body &&
      !/^[#<>]|^(?:[-+*]|\d+[.)])(?:[ \t]|$)|^\[[^\]]*\]:|^(?:[*_-][ \t]*){3,}$/u.test(body)
    ) {
      result.push({
        from,
        bodyFrom: from,
        bodyTo: from + body.length,
        to: next.index + next[0].length,
        level: underline[1][0] === '=' ? 1 : 2,
        body,
      });
      index++;
      boundary = true;
    } else boundary = false;
  }
  return result;
}

/** Pair complete declarations in document order. Only level and exact inline
 * source text prove equivalence; no inline HTML/entity/escape normalization. */
export function headingCorrespondences(
  source: string,
  canonical: string,
): ReadonlyMap<number, HeadingCorrespondence> {
  const result = new Map<number, HeadingCorrespondence>(),
    possible = /(?:^|\n) {0,3}(?:#{1,6}(?:[ \t]|\n|$)|[=-]+[ \t]*(?:\n|$))/u;
  if (!possible.test(source) || !possible.test(canonical)) return result;
  const sourceHeadings = headings(source),
    canonicalHeadings = headings(canonical);
  for (let index = 0; index < sourceHeadings.length; index++) {
    const a = sourceHeadings[index],
      b = canonicalHeadings[index];
    if (!a || !b || a.level !== b.level || a.body !== b.body) continue;
    // A collapsed terminal suffix would make the text end and declaration end
    // indistinguishable. Require the serializer's line ending in that case.
    if (a.bodyTo < a.to && b.bodyTo === b.to) continue;
    const spans: Correspondence[] = [];
    for (const [af, at, bf, bt] of [
      [a.from, a.bodyFrom, b.from, b.bodyFrom],
      [a.bodyFrom, a.bodyTo, b.bodyFrom, b.bodyTo],
      [a.bodyTo, a.to, b.bodyTo, b.to],
    ]) {
      if (
        af === undefined ||
        at === undefined ||
        bf === undefined ||
        bt === undefined ||
        (af === at && bf === bt)
      )
        continue;
      spans.push({
        sourceFrom: af,
        sourceTo: at,
        canonicalFrom: bf,
        canonicalTo: bt,
        equal: source.slice(af, at) === canonical.slice(bf, bt),
      });
    }
    result.set(a.from, { canonicalFrom: b.from, sourceTo: a.to, canonicalTo: b.to, spans });
  }
  return result;
}
