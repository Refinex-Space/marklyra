import { type ReactNode, useEffect, useState } from 'react';
import { Skeleton, SkeletonBar } from '../../components/Skeleton.js';
import { type GitFileText, git, gitError } from '../../services/git.js';
import {
  type DiffOptionsState,
  DiffToolbar,
  DiffView,
  diffNotice,
  diffStepKey,
  encodingNotes,
  useDiffModel,
} from './DiffView.js';
import { GitGlyph } from './GitGlyph.js';
import type { DiffEntry, DiffSide } from './GitProvider.js';
import { useGit } from './GitProvider.js';

const EMPTY: GitFileText = { text: null, binary: false, tooLarge: false, bom: false, crlf: false };

/** Reads both versions of one file; a null revision is an empty side. */
export function useFilePair(left: DiffSide, right: DiffSide, entry: DiffEntry | null) {
  const { workspace, revision } = useGit();
  const [state, setState] = useState<{
    left: GitFileText | null;
    right: GitFileText | null;
    error: string;
  }>({ left: null, right: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const id = workspace?.id;
  const leftPath = entry ? (entry.origPath ?? entry.path) : null;
  const rightPath = entry?.path ?? null;
  // Work-tree sides follow repository changes; committed sides never change.
  const live =
    left.rev === 'WORKTREE' ||
    right.rev === 'WORKTREE' ||
    left.rev?.startsWith(':') ||
    right.rev?.startsWith(':');
  // biome-ignore lint/correctness/useExhaustiveDependencies: inputs are the identity of the pair.
  useEffect(() => {
    if (!id || !leftPath || !rightPath) return;
    let alive = true;
    setState({ left: null, right: null, error: '' });
    const read = (rev: string | null, path: string) =>
      rev === null ? Promise.resolve(EMPTY) : git.fileText(id, { rev, path });
    void Promise.all([read(left.rev, leftPath), read(right.rev, rightPath)]).then(
      ([a, b]) => {
        if (alive) setState({ left: a, right: b, error: '' });
      },
      (error: unknown) => {
        if (alive) setState({ left: null, right: null, error: gitError(error).message });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, left.rev, right.rev, leftPath, rightPath, attempt, live ? revision : 0]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

export function DiffSkeleton() {
  return (
    <Skeleton className="git-diff-skeleton">
      {[62, 48, 70, 40, 56, 66, 44, 58].map((width, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: decorative rows.
        <div key={index} className="git-diff-skeleton-row">
          <SkeletonBar width={24} height={10} />
          <SkeletonBar width={`${width}%`} height={10} />
          <SkeletonBar width={24} height={10} />
          <SkeletonBar width={`${Math.max(30, width - 12)}%`} height={10} />
        </div>
      ))}
    </Skeleton>
  );
}

/** Toolbar plus diff for one file, with loading, failure and non-text states. */
export function DiffPanel(props: {
  left: DiffSide;
  right: DiffSide;
  entry: DiffEntry | null;
  className?: string;
  toolbarExtra?: ReactNode;
  empty?: ReactNode;
}) {
  const { preferences, setPreferences } = useGit();
  const options: DiffOptionsState = {
    layout: preferences.diffLayout,
    ignoreWhitespace: preferences.ignoreWhitespace,
    collapse: preferences.collapseUnchanged,
  };
  const pair = useFilePair(props.left, props.right, props.entry);
  const model = useDiffModel(pair.left, pair.right, options.ignoreWhitespace);
  const [focus, setFocus] = useState(-1);
  useEffect(() => setFocus(model?.changes.length ? 0 : -1), [model]);
  const step = (direction: 1 | -1) => {
    const count = model?.changes.length ?? 0;
    if (!count) return;
    setFocus((value) => (value < 0 ? 0 : (value + direction + count) % count));
  };
  const notice = diffNotice(pair.left, pair.right);
  let body: ReactNode;
  if (!props.entry) body = props.empty ?? <p className="git-empty">选择文件查看差异</p>;
  else if (pair.error)
    body = (
      <div className="git-error-state" role="alert">
        <GitGlyph name="conflict" />
        <p>{pair.error}</p>
        <button type="button" className="git-button" onClick={pair.retry}>
          重试
        </button>
      </div>
    );
  else if (!pair.left || !pair.right || !model) body = <DiffSkeleton />;
  else if (notice) body = <p className="git-empty">{notice}</p>;
  else
    body = (
      <DiffView
        model={model}
        options={options}
        focus={focus}
        leftLabel={props.left.label}
        rightLabel={props.right.label}
        notes={[
          ...(pair.left.text === null ? ['新文件'] : []),
          ...(pair.right.text === null ? ['文件已删除'] : []),
          ...encodingNotes(pair.left, pair.right),
        ]}
      />
    );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: F7 navigation inside the diff.
    <div
      className={`git-diff-panel${props.className ? ` ${props.className}` : ''}`}
      onKeyDown={(event) => diffStepKey(event, step)}
    >
      <DiffToolbar
        options={options}
        onOptions={(change) =>
          setPreferences({
            ...(change.layout ? { diffLayout: change.layout } : {}),
            ...(change.ignoreWhitespace !== undefined
              ? { ignoreWhitespace: change.ignoreWhitespace }
              : {}),
            ...(change.collapse !== undefined ? { collapseUnchanged: change.collapse } : {}),
          })
        }
        changes={model?.changes.length ?? 0}
        current={focus}
        onStep={step}
        stats={model?.stats ?? null}
        extra={props.toolbarExtra}
      />
      {body}
    </div>
  );
}
