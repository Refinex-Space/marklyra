import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GitFileText } from '../../services/git.js';
import { GitGlyph } from './GitGlyph.js';
import type { DiffLayout } from './git-preferences.js';
import {
  changeIndexes,
  type DiffChunk,
  diffLines,
  diffStats,
  inlineDiff,
  type Segment,
  type SplitRow,
  splitLines,
  splitRows,
  type UnifiedRow,
  unifiedRows,
} from './model/diff.js';

/** Context lines kept around a change when unchanged runs are folded. */
const CONTEXT = 4;
/** Rows per rendering block; blocks off screen skip layout (content-visibility). */
const BLOCK = 200;
/** Intra-line highlighting is skipped for very long lines; whole lines still show as changed. */
const INLINE_LIMIT = 4000;

export interface DiffOptionsState {
  layout: DiffLayout;
  ignoreWhitespace: boolean;
  collapse: boolean;
}

function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.changed ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional.
          <mark key={index}>{segment.text}</mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional.
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/** The diff toolbar shared by the diff dialog, commit preview and history. */
export function DiffToolbar(props: {
  options: DiffOptionsState;
  onOptions: (change: Partial<DiffOptionsState>) => void;
  changes: number;
  current: number;
  onStep: (step: 1 | -1) => void;
  stats?: { additions: number; deletions: number } | null;
  extra?: ReactNode;
}) {
  const { options } = props;
  return (
    <div className="git-diff-toolbar" role="toolbar" aria-label="差异工具栏">
      <button
        type="button"
        className="git-icon-button"
        aria-label="上一处更改"
        title="上一处更改（Shift+F7）"
        disabled={!props.changes}
        onClick={() => props.onStep(-1)}
      >
        <GitGlyph name="up" />
      </button>
      <button
        type="button"
        className="git-icon-button"
        aria-label="下一处更改"
        title="下一处更改（F7）"
        disabled={!props.changes}
        onClick={() => props.onStep(1)}
      >
        <GitGlyph name="down" />
      </button>
      <span className="git-diff-counter" aria-live="polite">
        {props.changes
          ? `${props.current >= 0 ? props.current + 1 : '–'} / ${props.changes} 处更改`
          : '无差异'}
      </span>
      {props.stats && (props.stats.additions > 0 || props.stats.deletions > 0) && (
        <span className="git-diff-stats">
          <span className="git-added-text">+{props.stats.additions}</span>
          <span className="git-deleted-text">−{props.stats.deletions}</span>
        </span>
      )}
      <span className="git-toolbar-spacer" />
      {props.extra}
      <fieldset className="git-segmented" aria-label="差异布局">
        <button
          type="button"
          aria-pressed={options.layout === 'split'}
          title="左右对比"
          onClick={() => props.onOptions({ layout: 'split' })}
        >
          <GitGlyph name="columns" />
          <span>并排</span>
        </button>
        <button
          type="button"
          aria-pressed={options.layout === 'unified'}
          title="统一视图"
          onClick={() => props.onOptions({ layout: 'unified' })}
        >
          <GitGlyph name="rows" />
          <span>统一</span>
        </button>
      </fieldset>
      <button
        type="button"
        className="git-toggle"
        aria-pressed={options.ignoreWhitespace}
        title="忽略空白差异"
        onClick={() => props.onOptions({ ignoreWhitespace: !options.ignoreWhitespace })}
      >
        <GitGlyph name="whitespace" />
        <span>忽略空白</span>
      </button>
      <button
        type="button"
        className="git-toggle"
        aria-pressed={options.collapse}
        title="折叠未更改的内容"
        onClick={() => props.onOptions({ collapse: !options.collapse })}
      >
        <GitGlyph name="fold" />
        <span>折叠未更改</span>
      </button>
    </div>
  );
}

export interface DiffModel {
  left: string[];
  right: string[];
  chunks: DiffChunk[];
  changes: number[];
  stats: { additions: number; deletions: number };
}
export function useDiffModel(
  left: GitFileText | null,
  right: GitFileText | null,
  ignoreWhitespace: boolean,
): DiffModel | null {
  return useMemo(() => {
    if (!left || !right) return null;
    const leftLines = splitLines(left.text ?? '');
    const rightLines = splitLines(right.text ?? '');
    const chunks = diffLines(leftLines, rightLines, { ignoreWhitespace });
    const stats = diffStats(chunks);
    return {
      left: leftLines,
      right: rightLines,
      chunks,
      changes: changeIndexes(chunks),
      stats: { additions: stats.additions, deletions: stats.deletions },
    };
  }, [left, right, ignoreWhitespace]);
}

/** Why a pair of versions has no textual diff to show, if it has none. */
export function diffNotice(left: GitFileText | null, right: GitFileText | null): string | null {
  if (!left || !right) return null;
  if (left.binary || right.binary) return '二进制文件，无法显示文本差异。';
  if (left.tooLarge || right.tooLarge) return '文件超过 4 MB，不显示差异。';
  if (left.text === null && right.text === null) return '两侧都不存在此文件。';
  return null;
}

/**
 * Side-by-side or unified diff of two texts. Rows wrap long lines (notes are mostly long
 * paragraphs), so both sides of a row always share a height.
 */
export function DiffView(props: {
  model: DiffModel;
  options: DiffOptionsState;
  /** Index into `model.changes` to reveal; changes when the caller steps. */
  focus: number;
  /** Extra classes, e.g. for a compact preview. */
  className?: string;
  leftLabel: string;
  rightLabel: string;
  notes?: string[];
}) {
  const { model, options } = props;
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const scroller = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new model starts folded again.
  useEffect(() => setExpanded(new Set()), [model]);
  const context = options.collapse ? CONTEXT : null;
  const rows = useMemo(
    () =>
      options.layout === 'split'
        ? splitRows(model.chunks, context, expanded)
        : unifiedRows(model.chunks, context, expanded),
    [model, options.layout, context, expanded],
  );
  // Pairs of changed lines get intra-line highlighting, computed once per pair.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the cache belongs to one model.
  const inline = useMemo(() => new Map<string, { left: Segment[]; right: Segment[] }>(), [model]);
  const pair = (leftIndex: number, rightIndex: number) => {
    const key = `${leftIndex}:${rightIndex}`;
    let value = inline.get(key);
    if (!value) {
      const a = model.left[leftIndex] ?? '';
      const b = model.right[rightIndex] ?? '';
      value =
        a.length > INLINE_LIMIT || b.length > INLINE_LIMIT
          ? { left: [{ text: a, changed: false }], right: [{ text: b, changed: false }] }
          : inlineDiff(a, b);
      inline.set(key, value);
    }
    return value;
  };
  // In the unified layout a deleted line pairs with the inserted line at the same offset.
  const unifiedPartner = useMemo(() => {
    const partner = new Map<string, number>();
    if (options.layout !== 'unified') return partner;
    for (const chunk of model.chunks) {
      if (chunk.kind !== 'change') continue;
      const count = Math.min(chunk.leftEnd - chunk.leftStart, chunk.rightEnd - chunk.rightStart);
      for (let offset = 0; offset < count; offset++) {
        partner.set(`l${chunk.leftStart + offset}`, chunk.rightStart + offset);
        partner.set(`r${chunk.rightStart + offset}`, chunk.leftStart + offset);
      }
    }
    return partner;
  }, [model, options.layout]);

  useEffect(() => {
    const chunk = model.changes[props.focus];
    if (chunk === undefined) return;
    const row = scroller.current?.querySelector<HTMLElement>(`[data-chunk="${chunk}"]`);
    row?.scrollIntoView({ block: 'center' });
  }, [props.focus, model]);

  const fold = (row: SplitRow | UnifiedRow, key: string) => (
    <div className="git-diff-fold" key={key}>
      <button
        type="button"
        onClick={() =>
          setExpanded((set) => {
            const next = new Set(set);
            if (row.foldId !== undefined) next.add(row.foldId);
            return next;
          })
        }
      >
        <GitGlyph name="expand" />
        展开 {row.hidden} 行未更改的内容
      </button>
    </div>
  );
  const focusChunk = model.changes[props.focus];
  const renderSplit = (row: SplitRow, index: number) => {
    const key = `${index}`;
    if (row.kind === 'fold') return fold(row, key);
    const change = row.kind === 'change';
    const both = change && row.left !== null && row.right !== null;
    const segments = both ? pair(row.left as number, row.right as number) : null;
    const leftText = row.left === null ? null : (model.left[row.left] ?? '');
    const rightText = row.right === null ? null : (model.right[row.right] ?? '');
    return (
      <div
        key={key}
        className="git-diff-row git-diff-split"
        data-kind={row.kind}
        data-chunk={change ? row.chunk : undefined}
        data-focus={change && row.chunk === focusChunk ? true : undefined}
      >
        <span className="git-diff-number" data-side="left">
          {row.left === null ? '' : row.left + 1}
        </span>
        <span
          className="git-diff-text"
          data-side="left"
          data-state={!change ? 'equal' : row.left === null ? 'empty' : 'deleted'}
        >
          {segments ? <Segments segments={segments.left} /> : leftText}
        </span>
        <span className="git-diff-number" data-side="right">
          {row.right === null ? '' : row.right + 1}
        </span>
        <span
          className="git-diff-text"
          data-side="right"
          data-state={!change ? 'equal' : row.right === null ? 'empty' : 'inserted'}
        >
          {segments ? <Segments segments={segments.right} /> : rightText}
        </span>
      </div>
    );
  };
  const renderUnified = (row: UnifiedRow, index: number) => {
    const key = `${index}`;
    if (row.kind === 'fold') return fold(row, key);
    let content: ReactNode;
    if (row.kind === 'delete' && row.left !== null) {
      const partner = unifiedPartner.get(`l${row.left}`);
      content =
        partner === undefined ? (
          model.left[row.left]
        ) : (
          <Segments segments={pair(row.left, partner).left} />
        );
    } else if (row.kind === 'insert' && row.right !== null) {
      const partner = unifiedPartner.get(`r${row.right}`);
      content =
        partner === undefined ? (
          model.right[row.right]
        ) : (
          <Segments segments={pair(partner, row.right).right} />
        );
    } else content = row.right !== null ? model.right[row.right] : '';
    const change = row.kind !== 'equal';
    return (
      <div
        key={key}
        className="git-diff-row git-diff-unified"
        data-kind={row.kind}
        data-chunk={change ? row.chunk : undefined}
        data-focus={change && row.chunk === focusChunk ? true : undefined}
      >
        <span className="git-diff-number">{row.left === null ? '' : row.left + 1}</span>
        <span className="git-diff-number">{row.right === null ? '' : row.right + 1}</span>
        <span className="git-diff-sign" aria-hidden="true">
          {row.kind === 'delete' ? '−' : row.kind === 'insert' ? '+' : ''}
        </span>
        <span
          className="git-diff-text"
          data-state={
            row.kind === 'delete' ? 'deleted' : row.kind === 'insert' ? 'inserted' : 'equal'
          }
        >
          {content}
        </span>
      </div>
    );
  };
  const blocks: ReactNode[] = [];
  for (let start = 0; start < rows.length; start += BLOCK) {
    const slice = rows.slice(start, start + BLOCK);
    blocks.push(
      <div
        className="git-diff-block"
        key={start}
        style={{ containIntrinsicSize: `auto ${slice.length * 21}px` }}
      >
        {slice.map((row, offset) =>
          options.layout === 'split'
            ? renderSplit(row as SplitRow, start + offset)
            : renderUnified(row as UnifiedRow, start + offset),
        )}
      </div>,
    );
  }
  return (
    <div
      className={`git-diff${props.className ? ` ${props.className}` : ''}`}
      data-layout={options.layout}
    >
      {options.layout === 'split' ? (
        <div className="git-diff-heads" aria-hidden="true">
          <span title={props.leftLabel}>{props.leftLabel}</span>
          <span title={props.rightLabel}>{props.rightLabel}</span>
        </div>
      ) : (
        <div className="git-diff-heads git-diff-heads-unified" aria-hidden="true">
          <span>
            {props.leftLabel} → {props.rightLabel}
          </span>
        </div>
      )}
      {props.notes?.map((note) => (
        <p key={note} className="git-diff-note">
          {note}
        </p>
      ))}
      <section
        ref={scroller}
        className="git-diff-scroll"
        aria-label={`${props.leftLabel} 与 ${props.rightLabel} 的差异`}
      >
        {rows.length ? blocks : <p className="git-diff-empty">两侧内容为空。</p>}
      </section>
    </div>
  );
}

/** F7 / Shift+F7 and Alt+↓ / Alt+↑ step through changes, as in IDEA. */
export function diffStepKey(event: ReactKeyboardEvent, step: (direction: 1 | -1) => void) {
  if (event.nativeEvent.isComposing) return;
  if (
    event.key === 'F7' ||
    (event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp'))
  ) {
    event.preventDefault();
    step(event.key === 'ArrowUp' || (event.key === 'F7' && event.shiftKey) ? -1 : 1);
  }
}

/** Notes about differences the text view does not show (line endings, BOM). */
export function encodingNotes(left: GitFileText | null, right: GitFileText | null): string[] {
  if (!left || !right || left.text === null || right.text === null) return [];
  const notes: string[] = [];
  if (left.crlf !== right.crlf)
    notes.push(`行尾符不同：${left.crlf ? 'CRLF' : 'LF'} → ${right.crlf ? 'CRLF' : 'LF'}`);
  if (left.bom !== right.bom) notes.push(right.bom ? '新增了 UTF-8 BOM' : '移除了 UTF-8 BOM');
  return notes;
}
