/** Only dash runs in an explicit, context-checked table declaration are aliases.
 * Pipes, colons and cell text remain ordinary exact source characters. */
export const tableDelimiterDash = Symbol('table-delimiter-dash');
interface Frame {
  quote: number;
  indent: number;
  body: string;
  from: number;
  markerWidth: number;
  tab: boolean;
}
function frame(line: string): Frame {
  let cursor = 0,
    quote = 0;
  while (true) {
    const start = cursor;
    let spaces = 0;
    while (line[cursor] === ' ' && spaces < 4) {
      cursor++;
      spaces++;
    }
    if (spaces <= 3 && line[cursor] === '>') {
      quote++;
      cursor++;
      if (line[cursor] === ' ' || line[cursor] === '\t') cursor++;
      continue;
    }
    cursor = start;
    break;
  }
  let indent = 0,
    tab = false;
  while (line[cursor] === ' ' || line[cursor] === '\t') {
    if (line[cursor] === '\t') {
      indent += 4 - (indent % 4);
      tab = true;
    } else indent++;
    cursor++;
  }
  const marker = /^(?:[-+*]|\d+[.)])[ \t]+/u.exec(line.slice(cursor));
  const markerWidth = marker?.[0].length ?? 0;
  if (marker?.[0].includes('\t')) tab = true;
  cursor += markerWidth;
  return { quote, indent, body: line.slice(cursor), from: cursor, markerWidth, tab };
}
function columns(header: string): number | undefined {
  // The internal editor parser keeps bare pipes inside closed code spans in one
  // cell. Preserve that measured dialect; GFM's escaped-pipe rule differs.
  const value = header.trimEnd();
  if (!value.startsWith('|') || !value.endsWith('|')) return;
  let pipes = 0,
    lastPipe = -1,
    code = 0;
  for (let cursor = 0; cursor < value.length; cursor++) {
    const char = value[cursor];
    if (char === '`') {
      let end = cursor + 1;
      while (value[end] === '`') end++;
      const length = end - cursor;
      if (!code) code = length;
      else if (code === length) code = 0;
      cursor = end - 1;
    } else if (!code && char === '\\') cursor++;
    else if (!code && char === '|') {
      pipes++;
      lastPipe = cursor;
    }
  }
  return !code && pipes >= 2 && lastPipe === value.length - 1 ? pipes - 1 : undefined;
}
interface Fence {
  quote: number;
  indent: number;
  marker: string;
  length: number;
}
interface Opaque {
  quote: number;
  end?: string;
  blank?: true;
}
export function tableDelimiterRuns(text: string): Map<number, { to: number; key: symbol }> {
  const result = new Map<number, { to: number; key: symbol }>(),
    lists: { indent: number; content: number }[] = [];
  let quote = -1,
    frontMatter = false,
    fence: Fence | undefined,
    math: { quote: number; indent: number } | undefined,
    opaque: Opaque | undefined;
  let previous: { body: string; quote: number; list: number } | undefined;
  for (const line of text.matchAll(/[^\n]*(?:\n|$)/gu)) {
    if (!line[0]) continue;
    const value = line[0].replace(/\n$/u, ''),
      current = frame(value),
      blank = !current.body.trim();
    if (line.index === 0 && value.replace(/^\uFEFF/u, '') === '---') {
      frontMatter = true;
      previous = undefined;
      continue;
    }
    if (frontMatter) {
      if (/^(?:---|\.\.\.)[ \t]*$/u.test(value)) frontMatter = false;
      continue;
    }
    if (fence) {
      if (
        current.quote < fence.quote ||
        (!blank &&
          current.quote === fence.quote &&
          current.indent < fence.indent &&
          !current.markerWidth)
      )
        fence = undefined;
      else {
        // Like the serializer, accept a closer at any deeper indentation.
        const close = /^(`{3,}|~{3,})[ \t]*$/u.exec(current.body);
        if (
          current.quote === fence.quote &&
          !current.markerWidth &&
          close?.[1]?.[0] === fence.marker &&
          close[1].length >= fence.length
        )
          fence = undefined;
        previous = undefined;
        continue;
      }
    }
    if (math !== undefined) {
      if (current.quote < math.quote) math = undefined;
      else {
        if (
          current.quote === math.quote &&
          !current.markerWidth &&
          current.body.trim() === '$$' &&
          current.indent - math.indent <= 3
        )
          math = undefined;
        previous = undefined;
        continue;
      }
    }
    if (opaque) {
      if (current.quote < opaque.quote) opaque = undefined;
      else {
        if (
          (opaque.blank && blank) ||
          (opaque.end && current.body.toLowerCase().includes(opaque.end))
        )
          opaque = undefined;
        previous = undefined;
        continue;
      }
    }
    if (current.quote !== quote) {
      lists.length = 0;
      quote = current.quote;
    }
    if (blank) {
      previous = undefined;
      continue;
    }
    if (current.markerWidth) {
      while (lists.length && (lists.at(-1)?.indent ?? 0) >= current.indent) lists.pop();
      lists.push({ indent: current.indent, content: current.indent + current.markerWidth });
    } else while (lists.length && current.indent < (lists.at(-1)?.content ?? 0)) lists.pop();
    const list = lists.at(-1)?.content ?? 0,
      relative = current.markerWidth ? 0 : current.indent - list;
    if (relative >= 4 || current.tab) {
      previous = undefined;
      continue;
    }
    const open = /^(`{3,}|~{3,})(.*)$/u.exec(current.body);
    if (open?.[1]) {
      fence = {
        quote: current.quote,
        indent: list,
        marker: open[1][0] ?? '`',
        length: open[1].length,
      };
      previous = undefined;
      continue;
    }
    if (current.body.trim() === '$$') {
      math = { quote: current.quote, indent: list };
      previous = undefined;
      continue;
    }
    const body = current.body.toLowerCase(),
      raw = /^<(pre|script|style|textarea)(?=[\s>])/u.exec(body);
    if (raw?.[1]) {
      const end = `</${raw[1]}>`;
      if (!body.includes(end)) opaque = { quote: current.quote, end };
      previous = undefined;
      continue;
    }
    if (body.startsWith('<!--')) {
      if (!body.includes('-->')) opaque = { quote: current.quote, end: '-->' };
      previous = undefined;
      continue;
    }
    if (body.startsWith('<?')) {
      if (!body.includes('?>')) opaque = { quote: current.quote, end: '?>' };
      previous = undefined;
      continue;
    }
    if (/^<\/?[a-z][a-z0-9-]*(?=[\s/>])/u.test(body) || body.startsWith('<!')) {
      opaque = { quote: current.quote, blank: true };
      previous = undefined;
      continue;
    }
    const declaration = current.body.trimEnd();
    if (
      previous?.quote === current.quote &&
      previous.list === list &&
      /^\|(?:[ \t]*:?-+:?[ \t]*\|)+$/u.test(declaration)
    ) {
      const count = declaration.split('|').length - 2;
      if (columns(previous.body) === count)
        for (const dash of declaration.matchAll(/-+/gu)) {
          const from = line.index + current.from + dash.index;
          result.set(from, { to: from + dash[0].length, key: tableDelimiterDash });
        }
    }
    previous = { body: current.body, quote: current.quote, list };
  }
  return result;
}
