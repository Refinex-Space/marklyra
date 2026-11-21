import { type Block, type Inline, parseInline, parseMarkdown } from '@marklyra/editor-markdown';
import { Fragment, type ReactNode, useMemo } from 'react';

const LIST = /^([ \t]*)([-+*]|(\d{1,9})[.)])[ \t]+(\[([ xX])\][ \t]+)?/;
export function MarkdownBlocks({
  source,
  inline,
  prefix,
  codeBlock,
  onToggle,
}: {
  source: string;
  inline(nodes: readonly Inline[], tableCell?: boolean): ReactNode[];
  prefix: 'task-md' | 'ai-md';
  codeBlock?(block: Block): ReactNode;
  onToggle?: ((offset: number) => void) | undefined;
}) {
  const blocks = useMemo(() => parseMarkdown(source).blocks, [source]);
  function paragraph(block: Block): ReactNode[] {
    const out: ReactNode[] = [];
    let cursor = block.contentFrom;
    const prose = (end: number) => {
      if (end > cursor) out.push(<p key={cursor}>{inline(parseInline(source, cursor, end))}</p>);
    };
    for (const table of tablesOf(source, block)) {
      prose(table.from);
      out.push(
        <section
          key={table.from}
          className={prefix + '-table'}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: wide tables are keyboard scroll regions.
          tabIndex={0}
          aria-label="表格"
          onKeyDown={(event) => {
            const region = event.currentTarget;
            if (
              event.target !== region ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              event.shiftKey ||
              region.scrollWidth <= region.clientWidth
            )
              return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              region.scrollLeft += event.key === 'ArrowRight' ? 48 : -48;
            }
          }}
        >
          <table>
            <thead>
              <tr>
                {table.head.map((cell, c) => (
                  <th scope="col" key={cell.from} style={{ textAlign: table.align[c] }}>
                    {inline(parseInline(source, cell.from, cell.to), true)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row[0]?.from}>
                  {table.head.map((head, c) => {
                    const cell = row[c];
                    return (
                      <td
                        key={cell?.from ?? `${head.from}-${c}`}
                        style={{ textAlign: table.align[c] }}
                      >
                        {cell && inline(parseInline(source, cell.from, cell.to), true)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>,
      );
      cursor = table.to;
    }
    if (cursor === block.contentFrom && !out.length)
      return [<p key={block.from}>{inline(block.inlines)}</p>];
    prose(block.contentTo);
    return out;
  }
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Block;
    switch (block.kind) {
      case 'blank':
        break;
      case 'rule':
        out.push(<hr key={block.from} />);
        break;
      case 'code':
      case 'frontmatter': {
        if (codeBlock) {
          out.push(<Fragment key={block.from}>{codeBlock(block)}</Fragment>);
          break;
        }
        const lang = /^ {0,3}(?:`{3,}|~{3,})\s*([\w+#.-]+)/.exec(block.raw)?.[1];
        out.push(
          <pre key={block.from} data-lang={lang}>
            <code>{source.slice(block.contentFrom, block.contentTo).replace(/\r?\n$/, '')}</code>
          </pre>,
        );
        break;
      }
      case 'heading': {
        const Tag = `h${Math.min(6, block.level + 1)}` as 'h2';
        out.push(
          <Tag key={block.from} className={prefix + '-heading'}>
            {inline(block.inlines)}
          </Tag>,
        );
        break;
      }
      case 'quote': {
        const lines: Block[] = [block];
        while (blocks[i + 1]?.kind === 'quote') lines.push(blocks[++i] as Block);
        out.push(
          <blockquote key={block.from}>
            {lines.map((line, n) => (
              <Fragment key={line.from}>
                {n > 0 && <br />}
                {inline(line.inlines)}
              </Fragment>
            ))}
          </blockquote>,
        );
        break;
      }
      case 'list-item': {
        const items: ListItem[] = [];
        for (let j = i; j < blocks.length; j++) {
          const current = blocks[j] as Block;
          if (current.kind === 'list-item') {
            const m = LIST.exec(current.raw);
            items.push({
              block: current,
              level: Math.min(current.level, 64),
              ordered: m?.[3] !== undefined,
              start: Number(m?.[3] ?? 1),
              check: m?.[4] ? current.from + (m[0].indexOf('[') + 1) : undefined,
              checked: m?.[5] !== undefined && m[5] !== ' ',
              more: [],
            });
            i = j;
          } else if (
            current.kind === 'paragraph' &&
            blocks[j - 1]?.kind === 'list-item' &&
            (/^\s/.test(current.raw) || !current.raw.includes('|'))
          ) {
            // A line under an item without a blank line continues that item.
            items.at(-1)?.more.push(current);
            i = j;
          } else if (current.kind === 'blank' && blocks[j + 1]?.kind === 'list-item') {
          } else break;
        }
        out.push(...renderList(items, 0, items.length, inline, paragraph, prefix, onToggle));
        break;
      }
      default:
        out.push(...paragraph(block));
        break;
    }
  }
  return <>{out}</>;
}

interface ListItem {
  block: Block;
  level: number;
  ordered: boolean;
  start: number;
  check: number | undefined;
  checked: boolean;
  more: Block[];
}

/** Items deeper than their predecessor nest inside it; a change of list kind starts a new list. */
function renderList(
  items: ListItem[],
  from: number,
  to: number,
  inline: (nodes: readonly Inline[]) => ReactNode[],
  paragraph: (block: Block) => ReactNode[],
  prefix: string,
  onToggle?: (offset: number) => void,
): ReactNode[] {
  const lists: ReactNode[] = [];
  let i = from;
  while (i < to) {
    const first = items[i] as ListItem;
    const entries: ReactNode[] = [];
    while (i < to) {
      const item = items[i] as ListItem;
      if (item.ordered !== first.ordered || item.level < first.level) break;
      let end = i + 1;
      while (end < to && (items[end] as ListItem).level > item.level) end++;
      entries.push(
        <li
          key={item.block.from}
          className={
            item.check !== undefined
              ? item.checked
                ? prefix + '-check done'
                : prefix + '-check'
              : undefined
          }
        >
          {item.check !== undefined && (
            <input
              type="checkbox"
              checked={item.checked}
              disabled={!onToggle}
              aria-label={item.checked ? '标为未完成' : '标为完成'}
              onChange={() => item.check !== undefined && onToggle?.(item.check)}
            />
          )}
          <span className={prefix + '-item'}>{inline(item.block.inlines)}</span>
          {item.more.flatMap(paragraph)}
          {end > i + 1 && renderList(items, i + 1, end, inline, paragraph, prefix, onToggle)}
        </li>,
      );
      i = end;
    }
    const checklist = items
      .slice(from, to)
      .some((item) => item.check !== undefined && item.level === first.level);
    lists.push(
      first.ordered ? (
        <ol key={first.block.from} start={first.start === 1 ? undefined : first.start}>
          {entries}
        </ol>
      ) : (
        <ul key={first.block.from} className={checklist ? prefix + '-checklist' : undefined}>
          {entries}
        </ul>
      ),
    );
  }
  return lists;
}

interface Cell {
  from: number;
  to: number;
}
function separator(line: string) {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|');
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/** A GFM pipe table: header, delimiter row, then body rows. */
function* tablesOf(source: string, block: Block) {
  if (!block.raw.includes('|')) return;
  const lines = [...source.slice(block.contentFrom, block.contentTo).matchAll(/[^\r\n]+/g)];
  for (let i = 1; i < lines.length; i++) {
    const header = lines[i - 1],
      delimiter = lines[i];
    if (!header || !delimiter || !header[0].includes('|') || !separator(delimiter[0])) continue;
    const from = block.contentFrom + header.index;
    const head = cellsOf(source, from, from + header[0].length);
    const align = delimiter[0]
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell): 'left' | 'right' | 'center' | undefined => {
        const marker = cell.trim();
        if (marker.endsWith(':')) return marker.startsWith(':') ? 'center' : 'right';
        return marker.startsWith(':') ? 'left' : undefined;
      });
    if (!head.length || head.length !== align.length) continue;
    const rows: Cell[][] = [];
    let end = i;
    while (end + 1 < lines.length) {
      const row = lines[end + 1];
      if (!row || !row[0].includes('|') || separator(lines[end + 2]?.[0] ?? '')) break;
      const at = block.contentFrom + row.index;
      const cells = cellsOf(source, at, at + row[0].length);
      // Keep malformed or excessive rows readable as source instead of dropping any cells.
      if (cells.length > head.length || head.length * (rows.length + 1) > 4096) break;
      rows.push(cells);
      end++;
    }
    const next = lines[end + 1];
    yield { from, to: next ? block.contentFrom + next.index : block.contentTo, head, rows, align };
    i = end;
  }
}

function cellsOf(source: string, from: number, to: number): Cell[] {
  const cells: Cell[] = [];
  let start = from;
  let codeTicks = 0;
  const lastRun = new Map<number, number>();
  for (const run of source.slice(from, to).matchAll(/`+/g))
    lastRun.set(run[0].length, from + run.index);

  for (let i = from; i <= to; i++) {
    const c = i < to ? source[i] : '|';
    if (c === '`') {
      let end = i + 1;
      while (end < to && source[end] === '`') end++;
      if (codeTicks === 0 && lastRun.get(end - i) !== i) codeTicks = end - i;
      else if (codeTicks === end - i) codeTicks = 0;
      i = end - 1;
      continue;
    }
    if (c === '\\' && i + 1 < to) {
      i++;
      continue;
    }
    if (c !== '|' || (codeTicks !== 0 && i < to)) continue;
    let a = start;
    let b = i;
    while (a < b && /\s/.test(source[a] ?? '')) a++;
    while (b > a && /\s/.test(source[b - 1] ?? '')) b--;
    cells.push({ from: a, to: b });
    start = i + 1;
  }
  // Leading and trailing pipes leave empty edge cells.
  if (cells.length > 1 && /^\s*\|/.test(source.slice(from, to)) && cells[0]?.from === cells[0]?.to)
    cells.shift();
  if (
    cells.length > 1 &&
    /\|\s*$/.test(source.slice(from, to)) &&
    cells.at(-1)?.from === cells.at(-1)?.to
  )
    cells.pop();
  return cells;
}
