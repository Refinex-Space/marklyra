/** Source coordinates are UTF-16 offsets, matching browser Selection APIs. */
export interface SourceRange {
  readonly from: number;
  readonly to: number;
}
export type InlineKind = 'text' | 'strong' | 'emphasis' | 'strike' | 'code' | 'link';
export interface Inline extends SourceRange {
  readonly kind: InlineKind;
  readonly contentFrom: number;
  readonly contentTo: number;
  readonly children: readonly Inline[];
  readonly destination?: string;
}
export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'list-item'
  | 'code'
  | 'frontmatter'
  | 'blank'
  | 'rule';
export interface Block extends SourceRange {
  readonly kind: BlockKind;
  readonly contentFrom: number;
  readonly contentTo: number;
  readonly level: number;
  readonly raw: string;
  readonly inlines: readonly Inline[];
}
export interface MarkdownDocument {
  readonly source: string;
  readonly blocks: readonly Block[];
}
interface Line extends SourceRange {
  contentTo: number;
  text: string;
}
function lines(source: string): Line[] {
  const result: Line[] = [];
  const pattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  for (const match of source.matchAll(pattern)) {
    if (!match[0]) break;
    const from = match.index;
    const text = match[0].replace(/(?:\r\n|\r|\n)$/, '');
    result.push({ from, to: from + match[0].length, contentTo: from + text.length, text });
  }
  if (!result.length || /[\r\n]$/.test(source))
    result.push({ from: source.length, to: source.length, contentTo: source.length, text: '' });
  return result;
}
function escaped(source: string, offset: number): boolean {
  let count = 0;
  while (offset > 0 && source[--offset] === '\\') count++;
  return count % 2 === 1;
}
/** A deliberately bounded inline parser. Unsupported syntax stays exact source text. */
export function parseInline(source: string, from: number, to: number, depth = 0): Inline[] {
  const nodes: Inline[] = [];
  let textStart = from;
  const plain = (end: number) => {
    if (end > textStart)
      nodes.push({
        kind: 'text',
        from: textStart,
        to: end,
        contentFrom: textStart,
        contentTo: end,
        children: [],
      });
  };
  if (depth > 12)
    return [{ kind: 'text', from, to, contentFrom: from, contentTo: to, children: [] }];
  for (let i = from; i < to; i++) {
    if (escaped(source, i)) continue;
    let kind: InlineKind | undefined;
    let marker = '';
    if (source.startsWith('**', i) || source.startsWith('__', i)) {
      kind = 'strong';
      marker = source.slice(i, i + 2);
    } else if (source.startsWith('~~', i)) {
      kind = 'strike';
      marker = '~~';
    } else if (source[i] === '`') {
      kind = 'code';
      marker = source.slice(i, to).match(/^`+/)?.[0] ?? '`';
    } else if (source[i] === '*' || source[i] === '_') {
      kind = 'emphasis';
      marker = source[i] ?? '*';
    }
    if (kind && !/\s/.test(source[i + marker.length] ?? ' ')) {
      let close = source.indexOf(marker, i + marker.length);
      while (close >= 0 && escaped(source, close))
        close = source.indexOf(marker, close + marker.length);
      if (
        close > i + marker.length &&
        close + marker.length <= to &&
        !/\s/.test(source[close - 1] ?? ' ')
      ) {
        plain(i);
        nodes.push({
          kind,
          from: i,
          to: close + marker.length,
          contentFrom: i + marker.length,
          contentTo: close,
          children: kind === 'code' ? [] : parseInline(source, i + marker.length, close, depth + 1),
        });
        i = close + marker.length - 1;
        textStart = i + 1;
        continue;
      }
    }
    if (source[i] === '[' && source[i - 1] !== '!') {
      const labelEnd = source.indexOf('](', i + 1);
      const close = labelEnd < 0 ? -1 : source.indexOf(')', labelEnd + 2);
      if (labelEnd > i && close >= 0 && close < to) {
        plain(i);
        nodes.push({
          kind: 'link',
          from: i,
          to: close + 1,
          contentFrom: i + 1,
          contentTo: labelEnd,
          destination: source.slice(labelEnd + 2, close),
          children: parseInline(source, i + 1, labelEnd, depth + 1),
        });
        i = close;
        textStart = i + 1;
      }
    }
  }
  plain(to);
  return nodes;
}
function isBoundary(text: string): boolean {
  return /^\s*$|^ {0,3}(?:#{1,6}\s|>|(?:[-+*]|\d+[.)])\s|`{3,}|~{3,}|(?:-\s*){3,}$|(?:\*\s*){3,}$)/.test(
    text,
  );
}
export function parseMarkdown(source: string): MarkdownDocument {
  const input = lines(source);
  const blocks: Block[] = [];
  for (let i = 0; i < input.length; i++) {
    const line = input[i];
    if (!line) continue;
    const bom = i === 0 && line.text.startsWith('\uFEFF') ? 1 : 0;
    const text = line.text.slice(bom);
    let kind: BlockKind = 'paragraph',
      level = 0,
      contentFrom = line.from + bom,
      contentTo = line.contentTo,
      to = line.to;
    const fence = /^ {0,3}(`{3,}|~{3,})[^\r\n]*$/.exec(text);
    const heading = /^ {0,3}(#{1,6})[ \t]+/.exec(text);
    const quote = /^(?: {0,3}>[ \t]?)+/.exec(text);
    const list = /^([ \t]*)(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/.exec(text);
    if (i === 0 && text === '---') {
      const end = input.findIndex(
        (entry, index) => index > i && /^(?:---|\.\.\.)\s*$/.test(entry.text),
      );
      if (end > i) {
        kind = 'frontmatter';
        to = input[end]?.to ?? to;
        contentTo = input[end]?.contentTo ?? contentTo;
        i = end;
      }
    } else if (fence) {
      kind = 'code';
      contentFrom = line.to;
      let end = i + 1;
      const marker = fence[1] ?? '```';
      const closing = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}[ \\t]*$`);
      while (end < input.length && !closing.test(input[end]?.text ?? '')) end++;
      const close = input[end];
      contentTo = close?.from ?? source.length;
      to = close?.to ?? source.length;
      i = close ? end : input.length - 1;
    } else if (/^\s*$/.test(text)) kind = 'blank';
    else if (/^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(text)) kind = 'rule';
    else if (heading) {
      kind = 'heading';
      level = (heading[1] ?? '').length;
      contentFrom += heading[0].length;
    } else if (quote) {
      kind = 'quote';
      contentFrom += quote[0].length;
      level = (quote[0].match(/>/g) ?? []).length;
    } else if (list) {
      kind = 'list-item';
      contentFrom += list[0].length;
      level = (list[1] ?? '').replace(/\t/g, '    ').length;
    } else {
      while (i + 1 < input.length && !isBoundary(input[i + 1]?.text ?? '')) {
        const next = input[++i];
        if (next) {
          to = next.to;
          contentTo = next.contentTo;
        }
      }
    }
    blocks.push({
      kind,
      from: line.from,
      to,
      contentFrom,
      contentTo,
      level,
      raw: source.slice(line.from, to),
      inlines: ['code', 'frontmatter', 'blank', 'rule'].includes(kind)
        ? []
        : parseInline(source, contentFrom, contentTo),
    });
  }
  return { source, blocks };
}
/** Serialization is identity over the source, never a regenerated AST. */
export function serializeMarkdown(document: MarkdownDocument): string {
  return document.source;
}
export function blockAt(document: MarkdownDocument, position: number): Block | undefined {
  return (
    document.blocks.find((block) => position >= block.from && position < block.to) ??
    document.blocks.at(-1)
  );
}
