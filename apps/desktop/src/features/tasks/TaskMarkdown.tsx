import { type Block, type Inline, parseInline, parseMarkdown } from '@marklyra/editor-markdown';
import { invoke } from '@tauri-apps/api/core';
import {
  Fragment,
  forwardRef,
  type KeyboardEvent,
  memo,
  type ReactNode,
  type TextareaHTMLAttributes,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { notify } from '../notices/notices.js';
import { StatusGlyph } from './glyphs.js';
import type { Catalog } from './model/catalog.js';
import {
  continueBlock,
  indentList,
  insertLink,
  pasteLink,
  type TextEdit,
  toggleWrap,
} from './model/markdown-input.js';

interface RenderProps {
  source: string;
  catalog: Catalog;
  open(id: string): void;
  /** Opens a workspace-relative note path. */
  openNote?(relativePath: string): void;
  /** Present when checkboxes may be ticked; receives the offset of the mark's inner character. */
  onToggle?(offset: number): void;
}

const LIST = /^([ \t]*)([-+*]|(\d{1,9})[.)])[ \t]+(\[([ xX])\][ \t]+)?/;
/** Task links, wiki names, bare URLs and task IDs inside plain text. */
const TOKEN =
  /(\[(?:\\.|[^\]\\\n])+\]\([^)\s]+\)|\[\[[^\]\n]+\]\]|https?:\/\/[^\s<>()（）]*[^\s<>()（）.,;:!?，。；：！？、'"”’]|\b[A-Z][A-Z0-9]{1,4}-\d+\b)/g;
const EXTERNAL = /^(?:https?:|mailto:)/i;

const openExternal = (url: string) =>
  void invoke('open_external_link', { url }).catch((error) => notify(String(error), 'error'));

/**
 * Task descriptions and comments rendered with the shared Markdown parser: headings, nested
 * and ordered lists, task checkboxes, quotes, code, rules, tables, links and emphasis, plus
 * task IDs and `[[task:…]]` chips. Everything is React text, never HTML.
 */
export const TaskMarkdown = memo(function TaskMarkdown(props: RenderProps) {
  const { source, catalog } = props;

  const link = (href: string, label: ReactNode, key: string | number): ReactNode => {
    const task = /^task:([0-9a-z]+)$/.exec(href);
    if (task) {
      const target = catalog.task(task[1]);
      return target ? (
        <button
          type="button"
          key={key}
          className="task-chip-link"
          onClick={() => props.open(target.id)}
        >
          <StatusGlyph status={catalog.status(target.status)} size={12} />
          {catalog.humanId(target)} {target.title}
        </button>
      ) : (
        <span key={key}>{label}</span>
      );
    }
    if (EXTERNAL.test(href))
      return (
        <a
          key={key}
          href={href}
          title={href}
          onClick={(event) => {
            event.preventDefault();
            openExternal(href);
          }}
        >
          {label}
        </a>
      );
    let path = href;
    try {
      path = decodeURIComponent(href);
    } catch {}
    path = path.replace(/^\.?\//, '').split('#')[0] ?? '';
    if (props.openNote && /\.(?:md|markdown)$/i.test(path) && !path.split('/').includes('..'))
      return (
        <a
          key={key}
          href={`#note:${encodeURIComponent(path)}`}
          title={path}
          onClick={(event) => {
            event.preventDefault();
            props.openNote?.(path);
          }}
        >
          {label}
        </a>
      );
    return (
      <span key={key} className="task-md-link" title={href}>
        {label}
      </span>
    );
  };

  /** Plain text still carries task IDs, `[[…]]` names and bare URLs. */
  const text = (value: string, key: string): ReactNode[] =>
    value.split(TOKEN).map((part, i) => {
      const k = `${key}-${i}`;
      if (i % 2 === 0) return part ? <Fragment key={k}>{part}</Fragment> : null;
      const md = /^\[((?:\\.|[^\]\\])+)\]\(([^)\s]+)\)$/.exec(part);
      if (md) return link(md[2] ?? '', md[1], k);
      const wiki = /^\[\[([^\]]+)\]\]$/.exec(part);
      if (wiki) {
        const target = /^task:(.+)$/.exec(wiki[1] ?? '');
        const linked = target ? catalog.task(target[1]) : undefined;
        return linked ? (
          <button
            type="button"
            key={k}
            className="task-chip-link"
            onClick={() => props.open(linked.id)}
          >
            <StatusGlyph status={catalog.status(linked.status)} size={12} />
            {catalog.humanId(linked)}
          </button>
        ) : (
          <span key={k} className="task-note-link">
            {wiki[1]}
          </span>
        );
      }
      if (/^https?:\/\//.test(part)) return link(part, part, k);
      const resolved = catalog.resolve(part);
      return resolved ? (
        <button
          type="button"
          key={k}
          className="task-note-link"
          onClick={() => props.open(resolved.id)}
        >
          {part}
        </button>
      ) : (
        <Fragment key={k}>{part}</Fragment>
      );
    });

  const inline = (nodes: readonly Inline[]): ReactNode[] => {
    let consumed = -1;
    const limit = nodes.at(-1)?.to ?? source.length;
    return nodes.map((node) => {
      if (node.to <= consumed) return null;
      const from = Math.max(node.contentFrom, consumed);
      const children = node.children.length
        ? inline(node.children)
        : node.kind === 'code'
          ? source.slice(from, node.contentTo)
          : text(source.slice(from, node.contentTo), `t${node.from}`);
      switch (node.kind) {
        case 'link': {
          // A `[[name]]` before a later link is not that link's label.
          if (source[node.from + 1] === '[')
            return text(source.slice(node.from, node.to), `l${node.from}`);
          // The bounded parser stops at the first ')'; balance URL parentheses here.
          const start = node.contentTo + 2;
          let depth = 1;
          let end = start;
          for (; end < limit; end++) {
            if (source[end] === '\\') end++;
            else if (source[end] === '(') depth++;
            else if (source[end] === ')' && --depth === 0) break;
          }
          if (depth === 0) consumed = end + 1;
          return link(
            depth === 0 ? source.slice(start, end) : (node.destination ?? ''),
            children,
            node.from,
          );
        }
        case 'strong':
          return <strong key={node.from}>{children}</strong>;
        case 'emphasis':
          return <em key={node.from}>{children}</em>;
        case 'strike':
          return <del key={node.from}>{children}</del>;
        case 'code':
          return <code key={node.from}>{children}</code>;
        default:
          return <Fragment key={node.from}>{children}</Fragment>;
      }
    });
  };

  const blocks = parseMarkdown(source).blocks;
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
          <Tag key={block.from} className="task-md-heading">
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
              level: current.level,
              ordered: m?.[3] !== undefined,
              start: Number(m?.[3] ?? 1),
              check: m?.[4] ? current.from + (m[0].indexOf('[') + 1) : undefined,
              checked: m?.[5] !== undefined && m[5] !== ' ',
              more: [],
            });
            i = j;
          } else if (current.kind === 'paragraph' && blocks[j - 1]?.kind === 'list-item') {
            // A line under an item without a blank line continues that item.
            items.at(-1)?.more.push(current);
            i = j;
          } else if (current.kind === 'blank' && blocks[j + 1]?.kind === 'list-item') {
          } else break;
        }
        out.push(...renderList(items, 0, items.length, inline, props.onToggle));
        break;
      }
      default: {
        const table = tableOf(source, block);
        out.push(
          table ? (
            <div key={block.from} className="task-md-table">
              <table>
                <thead>
                  <tr>
                    {table.head.map((cell, c) => (
                      <th key={cell.from} style={{ textAlign: table.align[c] }}>
                        {inline(parseInline(source, cell.from, cell.to))}
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
                            {cell && inline(parseInline(source, cell.from, cell.to))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p key={block.from}>{inline(block.inlines)}</p>
          ),
        );
      }
    }
  }
  return <>{out}</>;
});

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
                ? 'task-md-check done'
                : 'task-md-check'
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
          <span className="task-md-item">
            {inline(item.block.inlines)}
            {item.more.map((more) => (
              <Fragment key={more.from}>
                <br />
                {inline(more.inlines)}
              </Fragment>
            ))}
          </span>
          {end > i + 1 && renderList(items, i + 1, end, inline, onToggle)}
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
        <ul key={first.block.from} className={checklist ? 'task-md-checklist' : undefined}>
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
const SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** A GFM pipe table: header, delimiter row, then body rows. */
function tableOf(source: string, block: Block) {
  const rows: Cell[][] = [];
  let at = block.from;
  const lines = source.slice(block.from, block.contentTo).split('\n');
  if (lines.length < 2 || !lines[0]?.includes('|') || !SEPARATOR.test(lines[1] ?? '')) return null;
  const align = (lines[1] ?? '')
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell): 'left' | 'center' | 'right' | undefined => {
      const c = cell.trim();
      return c.startsWith(':') && c.endsWith(':')
        ? 'center'
        : c.endsWith(':')
          ? 'right'
          : c.startsWith(':')
            ? 'left'
            : undefined;
    });
  for (const [n, raw] of lines.entries()) {
    const line = raw.replace(/\r$/, '');
    if (n !== 1) rows.push(cellsOf(source, at, at + line.length));
    at += raw.length + 1;
  }
  const [head = [], ...body] = rows;
  if (head.length !== align.length) return null;
  return { head, rows: body, align };
}

function cellsOf(source: string, from: number, to: number): Cell[] {
  const cells: Cell[] = [];
  let start = from;
  let code = false;
  for (let i = from; i <= to; i++) {
    const c = i < to ? source[i] : '|';
    if (c === '`') code = !code;
    if (c === '\\') {
      i++;
      continue;
    }
    if (c !== '|' || (code && i < to)) continue;
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

/** Applies an edit as one native insertion so ⌘Z undoes it like typing. */
function apply(area: HTMLTextAreaElement, edit: TextEdit) {
  area.focus();
  area.setSelectionRange(edit.from, edit.to);
  const done = edit.text
    ? document.execCommand('insertText', false, edit.text)
    : edit.from === edit.to || document.execCommand('delete');
  if (!done) {
    area.setRangeText(edit.text, edit.from, edit.to, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
  area.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onValue(value: string): void;
  /** Grows with its content up to this height (px), then scrolls. */
  maxHeight?: number;
};

/**
 * A Markdown source field: ⌘B / ⌘I / ⇧⌘X / ⌘E / ⌘K format the selection, Enter continues lists
 * and quotes, Tab nests list items, pasting a URL over words links them, and it grows with text.
 */
export const MarkdownTextarea = forwardRef<HTMLTextAreaElement, AreaProps>(
  function MarkdownTextarea(
    { value, onValue, maxHeight = 560, onKeyDown, onPaste, style, ...rest },
    ref,
  ) {
    const area = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => area.current as HTMLTextAreaElement);
    // biome-ignore lint/correctness/useExhaustiveDependencies: height follows the text.
    useLayoutEffect(() => {
      const el = area.current;
      if (!el) return;
      el.style.height = 'auto';
      const border = el.offsetHeight - el.clientHeight;
      el.style.height = `${Math.min(maxHeight, el.scrollHeight + border)}px`;
      el.style.overflowY = el.scrollHeight + border > maxHeight ? 'auto' : 'hidden';
    }, [value, maxHeight]);
    const handle = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || e.nativeEvent.isComposing || e.keyCode === 229) return;
      const el = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = el;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      let edit: TextEdit | null = null;
      if (mod && !e.altKey) {
        if (key === 'b' && !e.shiftKey) edit = toggleWrap(el.value, start, end, '**');
        else if (key === 'i' && !e.shiftKey) edit = toggleWrap(el.value, start, end, '*');
        else if (key === 'x' && e.shiftKey) edit = toggleWrap(el.value, start, end, '~~');
        else if (key === 'e' && !e.shiftKey) edit = toggleWrap(el.value, start, end, '`');
        else if (key === 'k' && !e.shiftKey) edit = insertLink(el.value, start, end);
      } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        edit = continueBlock(el.value, start, end);
      } else if (e.key === 'Tab' && !e.altKey) {
        edit = indentList(el.value, start, end, e.shiftKey);
      }
      if (!edit) return;
      e.preventDefault();
      apply(el, edit);
    };
    return (
      <textarea
        {...rest}
        ref={area}
        value={value}
        style={style}
        spellCheck={false}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={handle}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          const el = e.currentTarget;
          const edit = pasteLink(
            el.value,
            el.selectionStart,
            el.selectionEnd,
            e.clipboardData.getData('text/plain'),
          );
          if (!edit) return;
          e.preventDefault();
          apply(el, edit);
        }}
      />
    );
  },
);
