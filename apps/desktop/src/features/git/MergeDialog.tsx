import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type GitFileText, git, gitError } from '../../services/git.js';
import { useConflicts } from './ConflictsDialog.js';
import { DiffSkeleton } from './DiffPanel.js';
import { diffStepKey } from './DiffView.js';
import { GitDialogFrame } from './GitDialogFrame.js';
import { GitGlyph } from './GitGlyph.js';
import { useGit } from './GitProvider.js';
import { splitLines } from './model/diff.js';
import {
  applyNonConflicting,
  chunkResult,
  type Decision,
  initialDecisions,
  type MergeChunk,
  merge3,
  mergeResult,
  parseConflictMarkers,
  unresolvedCount,
} from './model/merge.js';

/** Unchanged runs longer than this fold to a few lines around the changes. */
const FOLD_CONTEXT = 3;

interface Sources {
  base: string[];
  yours: string[];
  theirs: string[];
  /** Encoding of the work tree file, kept when writing the result. */
  bom: boolean;
  crlf: boolean;
  finalNewline: boolean;
  fromMarkers: boolean;
}

function Lines(props: { lines: readonly string[]; start: number; numbered?: boolean }) {
  if (!props.lines.length) return <div className="git-merge-gap" aria-hidden="true" />;
  return (
    <>
      {props.lines.map((line, index) => (
        <div
          className={
            props.numbered === false ? 'git-merge-line git-merge-line-plain' : 'git-merge-line'
          }
          // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional.
          key={index}
        >
          {props.numbered !== false && (
            <span className="git-diff-number">{props.start + index + 1}</span>
          )}
          <span className="git-diff-text">{line}</span>
        </div>
      ))}
    </>
  );
}

const describeDecision = (decision: Decision | null) => {
  if (!decision) return '未解决';
  switch (decision.kind) {
    case 'base':
      return '保留基础版本';
    case 'yours':
      return '已采用你的';
    case 'theirs':
      return '已采用他们的';
    case 'yours-theirs':
      return '你的 + 他们的';
    case 'theirs-yours':
      return '他们的 + 你的';
    case 'custom':
      return '已手动编辑';
  }
};

/**
 * Three-way merge tool: your version on the left, the result in the middle, their version on the
 * right, chunk by chunk with apply (») / ignore (×) controls and an editable result, as in IDEA.
 */
export function MergeDialog({ path, active }: { path: string; active: boolean }) {
  const context = useGit();
  const { conflicts } = useConflicts();
  const [sources, setSources] = useState<Sources | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(context.preferences.ignoreWhitespace);
  const [decisions, setDecisions] = useState<(Decision | null)[]>([]);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [focus, setFocus] = useState(-1);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  const id = context.workspace?.id;
  const stage = conflicts?.yoursStage;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the stage mapping and retries reload.
  useEffect(() => {
    if (!id || !stage) return;
    let alive = true;
    setSources(null);
    setError('');
    const other = stage === 2 ? 3 : 2;
    const read = (rev: string) => git.fileText(id, { rev, path });
    void Promise.all([read(':1'), read(`:${stage}`), read(`:${other}`), read('WORKTREE')]).then(
      ([base, yours, theirs, worktree]: GitFileText[]) => {
        if (!alive) return;
        if ([base, yours, theirs, worktree].some((file) => file?.binary || file?.tooLarge)) {
          setError('二进制或超过 4 MB 的文件无法在合并工具中合并，请选择接受某一侧。');
          return;
        }
        let parts: Omit<Sources, 'bom' | 'crlf' | 'finalNewline'>;
        if (yours?.text != null && theirs?.text != null) {
          parts = {
            base: splitLines(base?.text ?? ''),
            yours: splitLines(yours.text),
            theirs: splitLines(theirs.text),
            fromMarkers: false,
          };
        } else {
          const parsed = parseConflictMarkers(worktree?.text ?? '');
          if (!parsed) {
            setError('无法读取冲突两侧的内容，文件中的冲突标记也不完整。');
            return;
          }
          parts = {
            base: parsed.base,
            yours: parsed.yours,
            theirs: parsed.theirs,
            fromMarkers: true,
          };
        }
        const sample = worktree?.text ?? yours?.text ?? theirs?.text ?? '';
        setSources({
          ...parts,
          bom: worktree?.bom ?? yours?.bom ?? false,
          crlf: worktree?.crlf ?? yours?.crlf ?? false,
          finalNewline: sample === '' || sample.endsWith('\n'),
        });
      },
      (failure: unknown) => {
        if (alive) setError(gitError(failure).message);
      },
    );
    return () => {
      alive = false;
    };
  }, [id, path, stage, attempt]);

  const chunks = useMemo<MergeChunk[]>(
    () =>
      sources ? merge3(sources.base, sources.yours, sources.theirs, { ignoreWhitespace }) : [],
    [sources, ignoreWhitespace],
  );
  useEffect(() => {
    setDecisions(initialDecisions(chunks));
    setEditing(null);
    setExpanded(new Set());
  }, [chunks]);
  const conflictIndexes = chunks.flatMap((chunk, index) =>
    chunk.kind === 'conflict' ? [index] : [],
  );
  const changeIndexes = chunks.flatMap((chunk, index) =>
    chunk.kind === 'unchanged' ? [] : [index],
  );
  const unresolved = unresolvedCount(chunks, decisions);
  const autoApplied = chunks.filter(
    (chunk, index) => chunk.kind !== 'unchanged' && chunk.kind !== 'conflict' && decisions[index],
  ).length;

  useEffect(() => {
    if (focus < 0) return;
    scroller.current
      ?.querySelector<HTMLElement>(`[data-merge-chunk="${focus}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [focus]);
  // Start at the first conflict.
  useEffect(() => {
    if (chunks.length) setFocus(chunks.findIndex((chunk) => chunk.kind === 'conflict'));
  }, [chunks]);

  const decide = (index: number, decision: Decision | null) =>
    setDecisions((list) => list.map((item, at) => (at === index ? decision : item)));
  const apply = (index: number, side: 'yours' | 'theirs') => {
    const current = decisions[index] ?? null;
    const chunk = chunks[index];
    if (!chunk) return;
    if (chunk.kind === 'conflict' && current) {
      // Applying the second side of a conflict keeps both, in the order they were applied.
      if (side === 'yours' && current.kind === 'theirs')
        return decide(index, { kind: 'theirs-yours' });
      if (side === 'theirs' && current.kind === 'yours')
        return decide(index, { kind: 'yours-theirs' });
    }
    decide(index, { kind: side });
  };
  const ignore = (index: number, side: 'yours' | 'theirs') => {
    const current = decisions[index] ?? null;
    if (current?.kind === 'yours-theirs' || current?.kind === 'theirs-yours')
      return decide(index, { kind: side === 'yours' ? 'theirs' : 'yours' });
    decide(index, { kind: 'base' });
  };
  const includes = (decision: Decision | null, side: 'yours' | 'theirs') =>
    !!decision &&
    (decision.kind === side ||
      decision.kind === 'yours-theirs' ||
      decision.kind === 'theirs-yours');
  const stepConflict = (direction: 1 | -1) => {
    const targets = conflictIndexes.length ? conflictIndexes : changeIndexes;
    if (!targets.length) return;
    const after =
      direction > 0
        ? targets.find((index) => index > focus)
        : [...targets].reverse().find((index) => index < focus);
    setFocus(after ?? (direction > 0 ? (targets[0] as number) : (targets.at(-1) as number)));
  };

  const save = async () => {
    if (!sources) return;
    setSaving(true);
    let done = false;
    try {
      const lines = mergeResult(chunks, decisions, sources.base, sources.yours, sources.theirs);
      const text = lines.join('\n') + (sources.finalNewline && lines.length ? '\n' : '');
      await context.run(
        '保存合并结果',
        async (workspace) => {
          await git.resolve(workspace, path, {
            kind: 'content',
            text,
            bom: sources.bom,
            crlf: sources.crlf,
          });
          done = true;
        },
        { touchesWorkTree: true, success: () => `已解决 ${path}` },
      );
    } finally {
      setSaving(false);
    }
    if (done) context.closeDialog();
  };
  const acceptSide = (side: 'yours' | 'theirs') =>
    void context
      .run(
        side === 'yours' ? '接受你的版本' : '接受他们的版本',
        (workspace) => git.resolve(workspace, path, { kind: side }),
        {
          touchesWorkTree: true,
          success: () => `已解决 ${path}`,
        },
      )
      .then(() => context.closeDialog());

  const yoursLabel = conflicts?.yoursLabel ?? '本地';
  const theirsLabel = conflicts?.theirsLabel ?? '传入';
  let body: ReactNode;
  if (error)
    body = (
      <div className="git-error-state" role="alert">
        <GitGlyph name="conflict" />
        <p>{error}</p>
        <button
          type="button"
          className="git-button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          重试
        </button>
      </div>
    );
  else if (!sources) body = <DiffSkeleton />;
  else
    body = (
      <section ref={scroller} className="git-merge-scroll" aria-label="三方合并">
        <div className="git-merge-grid git-merge-heads">
          <span>你的版本 · {yoursLabel}</span>
          <i />
          <span>结果</span>
          <i />
          <span>他们的版本 · {theirsLabel}</span>
        </div>
        {chunks.map((chunk, index) => {
          const decision = decisions[index] ?? null;
          const yours = sources.yours.slice(chunk.yours[0], chunk.yours[1]);
          const theirs = sources.theirs.slice(chunk.theirs[0], chunk.theirs[1]);
          const result = chunkResult(chunk, decision, sources.base, sources.yours, sources.theirs);
          const key = `${index}`;
          if (chunk.kind === 'unchanged') {
            const length = yours.length;
            if (!expanded.has(index) && length > FOLD_CONTEXT * 2 + 2) {
              const head = index === 0 ? 0 : FOLD_CONTEXT;
              const tail = index === chunks.length - 1 ? 0 : FOLD_CONTEXT;
              const hidden = length - head - tail;
              const piece = (from: number, to: number) => (
                <div className="git-merge-grid" data-kind="unchanged">
                  <div className="git-merge-cell">
                    <Lines lines={yours.slice(from, to)} start={chunk.yours[0] + from} />
                  </div>
                  <div className="git-merge-gutter" />
                  <div className="git-merge-cell">
                    <Lines
                      lines={result.slice(from, to)}
                      start={chunk.base[0] + from}
                      numbered={false}
                    />
                  </div>
                  <div className="git-merge-gutter" />
                  <div className="git-merge-cell">
                    <Lines lines={theirs.slice(from, to)} start={chunk.theirs[0] + from} />
                  </div>
                </div>
              );
              return (
                <div key={key}>
                  {head > 0 && piece(0, head)}
                  <div className="git-diff-fold">
                    <button
                      type="button"
                      onClick={() => setExpanded((set) => new Set(set).add(index))}
                    >
                      <GitGlyph name="expand" />
                      展开 {hidden} 行相同的内容
                    </button>
                  </div>
                  {tail > 0 && piece(length - tail, length)}
                </div>
              );
            }
            return (
              <div key={key} className="git-merge-grid" data-kind="unchanged">
                <div className="git-merge-cell">
                  <Lines lines={yours} start={chunk.yours[0]} />
                </div>
                <div className="git-merge-gutter" />
                <div className="git-merge-cell">
                  <Lines lines={result} start={chunk.base[0]} numbered={false} />
                </div>
                <div className="git-merge-gutter" />
                <div className="git-merge-cell">
                  <Lines lines={theirs} start={chunk.theirs[0]} />
                </div>
              </div>
            );
          }
          const hasYours = chunk.kind !== 'theirs';
          const hasTheirs = chunk.kind !== 'yours';
          const sideControls = (side: 'yours' | 'theirs') => {
            const applied = includes(decision, side);
            const label = side === 'yours' ? '你的' : '他们的';
            return (
              <div className="git-merge-controls" data-side={side}>
                {!applied ? (
                  <button
                    type="button"
                    className="git-merge-apply"
                    aria-label={`采用${label}更改`}
                    title={`采用${label}更改`}
                    onClick={() => apply(index, side)}
                  >
                    {side === 'yours' ? '»' : '«'}
                  </button>
                ) : (
                  <span className="git-merge-applied" title="已采用">
                    <GitGlyph name="check" />
                  </span>
                )}
                {(!decision || applied) && (
                  <button
                    type="button"
                    className="git-merge-ignore"
                    aria-label={`忽略${label}更改`}
                    title={`忽略${label}更改`}
                    onClick={() => ignore(index, side)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          };
          return (
            <div
              key={key}
              className="git-merge-grid git-merge-chunk"
              data-kind={chunk.kind}
              data-resolved={decision ? true : undefined}
              data-focus={focus === index || undefined}
              data-merge-chunk={index}
            >
              <div
                className="git-merge-cell"
                data-side="yours"
                data-changed={hasYours || undefined}
              >
                <Lines lines={yours} start={chunk.yours[0]} />
              </div>
              <div className="git-merge-gutter">{hasYours && sideControls('yours')}</div>
              <div
                className="git-merge-cell git-merge-result"
                data-unresolved={!decision || undefined}
              >
                {editing?.index === index ? (
                  <div className="git-merge-editor">
                    <textarea
                      className="git-input git-mono"
                      aria-label="编辑合并结果"
                      autoFocus
                      rows={Math.max(3, editing.text.split('\n').length + 1)}
                      value={editing.text}
                      onChange={(event) => setEditing({ index, text: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          event.stopPropagation();
                          setEditing(null);
                        }
                      }}
                    />
                    <div className="git-merge-editor-actions">
                      <button type="button" className="git-button" onClick={() => setEditing(null)}>
                        取消
                      </button>
                      <button
                        type="button"
                        className="git-button git-button-primary"
                        onClick={() => {
                          decide(index, { kind: 'custom', lines: splitLines(editing.text) });
                          setEditing(null);
                        }}
                      >
                        确定
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Lines lines={result} start={0} numbered={false} />
                    <div className="git-merge-result-bar">
                      <span>{describeDecision(decision)}</span>
                      <button
                        type="button"
                        className="git-link-button"
                        onClick={() => setEditing({ index, text: result.join('\n') })}
                      >
                        编辑
                      </button>
                      {decision && chunk.kind === 'conflict' && (
                        <button
                          type="button"
                          className="git-link-button"
                          onClick={() => decide(index, null)}
                        >
                          撤销
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="git-merge-gutter">{hasTheirs && sideControls('theirs')}</div>
              <div
                className="git-merge-cell"
                data-side="theirs"
                data-changed={hasTheirs || undefined}
              >
                <Lines lines={theirs} start={chunk.theirs[0]} />
              </div>
            </div>
          );
        })}
      </section>
    );

  return (
    <GitDialogFrame
      title="合并修订"
      subtitle={path}
      active={active}
      onClose={context.closeDialog}
      locked={saving}
      size="full"
      className="git-merge-dialog"
      toolbar={
        sources ? (
          <div className="git-merge-toolbar" role="toolbar" aria-label="合并工具栏">
            <button
              type="button"
              className="git-icon-button"
              aria-label="上一处冲突"
              title="上一处冲突（Shift+F7）"
              onClick={() => stepConflict(-1)}
            >
              <GitGlyph name="up" />
            </button>
            <button
              type="button"
              className="git-icon-button"
              aria-label="下一处冲突"
              title="下一处冲突（F7）"
              onClick={() => stepConflict(1)}
            >
              <GitGlyph name="down" />
            </button>
            <span
              className="git-merge-counter"
              aria-live="polite"
              data-done={unresolved === 0 || undefined}
            >
              {unresolved ? `${unresolved} 处冲突未解决` : '全部冲突已解决'}
              {autoApplied ? ` · 已自动应用 ${autoApplied} 处不冲突的更改` : ''}
            </span>
            <button
              type="button"
              className="git-button"
              onClick={() => setDecisions((list) => applyNonConflicting(chunks, list))}
            >
              应用所有不冲突的更改
            </button>
            <button
              type="button"
              className="git-toggle"
              aria-pressed={ignoreWhitespace}
              title="比较时忽略空白（重新计算后会重置已做的选择）"
              onClick={() => setIgnoreWhitespace((value) => !value)}
            >
              <GitGlyph name="whitespace" />
              <span>忽略空白</span>
            </button>
          </div>
        ) : undefined
      }
      footer={
        confirming ? (
          <>
            <span className="git-footer-note git-field-warning">
              仍有 {unresolved} 处冲突未解决，这些位置将保存基础版本的内容。仍要保存并标记为已解决？
            </span>
            <span className="git-toolbar-spacer" />
            <button type="button" className="git-button" onClick={() => setConfirming(false)}>
              返回
            </button>
            <button
              type="button"
              className="git-button git-button-danger"
              disabled={saving}
              onClick={() => void save()}
            >
              仍然保存
            </button>
          </>
        ) : (
          <>
            {sources?.fromMarkers && (
              <span className="git-footer-note">内容来自文件中的冲突标记。</span>
            )}
            <span className="git-toolbar-spacer" />
            <button
              type="button"
              className="git-button"
              disabled={saving}
              onClick={() => acceptSide('yours')}
            >
              接受你的
            </button>
            <button
              type="button"
              className="git-button"
              disabled={saving}
              onClick={() => acceptSide('theirs')}
            >
              接受他们的
            </button>
            <button
              type="button"
              className="git-button"
              disabled={saving}
              onClick={context.closeDialog}
            >
              取消
            </button>
            <button
              type="button"
              className="git-button git-button-primary"
              disabled={!sources || saving || editing !== null}
              onClick={() => (unresolved ? setConfirming(true) : void save())}
            >
              应用
            </button>
          </>
        )
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: F7 moves between conflicts. */}
      <div className="git-merge" onKeyDown={(event) => diffStepKey(event, stepConflict)}>
        {body}
      </div>
    </GitDialogFrame>
  );
}
