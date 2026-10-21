import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useRef } from 'react';
import type { ChangeKind } from '../../services/git.js';
import { basename, dirname } from './GitDialogFrame.js';

export interface FileListItem {
  path: string;
  origPath?: string | null;
  /** A `ChangeKind`, or a git status letter (A, M, D, R, C, T). */
  status: ChangeKind | string;
  additions?: number;
  deletions?: number;
  binary?: boolean;
}
const LETTERS: Record<string, { letter: string; tone: string; label: string }> = {
  modified: { letter: 'M', tone: 'modified', label: '已修改' },
  M: { letter: 'M', tone: 'modified', label: '已修改' },
  added: { letter: 'A', tone: 'added', label: '新增' },
  A: { letter: 'A', tone: 'added', label: '新增' },
  deleted: { letter: 'D', tone: 'deleted', label: '已删除' },
  D: { letter: 'D', tone: 'deleted', label: '已删除' },
  renamed: { letter: 'R', tone: 'renamed', label: '已重命名' },
  R: { letter: 'R', tone: 'renamed', label: '已重命名' },
  copied: { letter: 'C', tone: 'added', label: '已复制' },
  C: { letter: 'C', tone: 'added', label: '已复制' },
  typechange: { letter: 'T', tone: 'modified', label: '类型已更改' },
  T: { letter: 'T', tone: 'modified', label: '类型已更改' },
  untracked: { letter: 'U', tone: 'untracked', label: '未跟踪' },
  conflicted: { letter: '!', tone: 'conflicted', label: '冲突' },
};
export const statusInfo = (status: string) =>
  LETTERS[status] ?? { letter: status.slice(0, 1) || '?', tone: 'modified', label: status };

/** Rows of changed files, flat or grouped by folder, with optional inclusion checkboxes. */
export function FileList(props: {
  files: readonly FileListItem[];
  selected: string | null;
  onSelect: (path: string) => void;
  onOpen?: (path: string) => void;
  grouped?: boolean;
  checked?: ReadonlySet<string>;
  onCheck?: (paths: string[], checked: boolean) => void;
  onContextMenu?: (path: string, x: number, y: number) => void;
  label: string;
  empty?: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const { files, grouped, checked, onCheck } = props;
  const keys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-file-row]') ?? [])];
    const index = rows.findIndex((row) => row.dataset.path === props.selected);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next =
        rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next?.dataset.path) {
        props.onSelect(next.dataset.path);
        next.focus();
      }
    } else if (event.key === 'Enter' && props.selected) {
      event.preventDefault();
      props.onOpen?.(props.selected);
    } else if (event.key === ' ' && props.selected && onCheck && checked) {
      event.preventDefault();
      onCheck([props.selected], !checked.has(props.selected));
    }
  };
  if (!files.length) return <div className="git-file-list git-file-list-empty">{props.empty}</div>;
  const row = (file: FileListItem, nested: boolean) => {
    const info = statusInfo(file.status);
    const selected = props.selected === file.path;
    return (
      <div
        key={file.path}
        role="option"
        aria-selected={selected}
        tabIndex={selected || (!props.selected && file === files[0]) ? 0 : -1}
        className="git-file-row"
        data-file-row=""
        data-path={file.path}
        data-tone={info.tone}
        data-nested={nested || undefined}
        title={`${file.origPath ? `${file.origPath} → ` : ''}${file.path}\n${info.label}`}
        onClick={() => props.onSelect(file.path)}
        onDoubleClick={() => props.onOpen?.(file.path)}
        onContextMenu={(event) => {
          if (!props.onContextMenu) return;
          event.preventDefault();
          props.onSelect(file.path);
          props.onContextMenu(file.path, event.clientX, event.clientY);
        }}
        onKeyDown={(event) => {
          if (!props.onContextMenu) return;
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            props.onContextMenu(file.path, rect.left + 24, rect.bottom);
          }
        }}
      >
        {checked && onCheck && (
          <input
            type="checkbox"
            tabIndex={-1}
            aria-label={`提交 ${file.path}`}
            checked={checked.has(file.path)}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onCheck([file.path], event.target.checked)}
          />
        )}
        <span className="git-file-status" title={info.label}>
          {info.letter}
        </span>
        <span className="git-file-name">{basename(file.path)}</span>
        {!nested && dirname(file.path) && (
          <span className="git-file-dir">{dirname(file.path)}</span>
        )}
        {file.origPath && file.origPath !== file.path && (
          <span className="git-file-dir">← {basename(file.origPath)}</span>
        )}
        {(file.additions !== undefined || file.binary) && (
          <span className="git-file-stat">
            {file.binary ? (
              '二进制'
            ) : (
              <>
                {file.additions ? <span className="git-added-text">+{file.additions}</span> : null}
                {file.deletions ? (
                  <span className="git-deleted-text">−{file.deletions}</span>
                ) : null}
              </>
            )}
          </span>
        )}
      </div>
    );
  };
  let body: ReactNode[];
  if (grouped) {
    const groups = new Map<string, FileListItem[]>();
    for (const file of files) {
      const folder = dirname(file.path);
      groups.set(folder, [...(groups.get(folder) ?? []), file]);
    }
    body = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([folder, items]) => {
        const paths = items.map((item) => item.path);
        const all = checked ? paths.every((path) => checked.has(path)) : false;
        return [
          <div key={`folder:${folder}`} className="git-file-folder" role="presentation">
            {checked && onCheck && (
              <input
                type="checkbox"
                tabIndex={-1}
                aria-label={`提交 ${folder || '根目录'} 中的全部文件`}
                checked={all}
                onChange={(event) => onCheck(paths, event.target.checked)}
              />
            )}
            <span>{folder || '（根目录）'}</span>
            <span className="git-file-folder-count">{items.length}</span>
          </div>,
          ...items.map((file) => row(file, true)),
        ];
      });
  } else body = files.map((file) => row(file, false));
  return (
    <div
      ref={list}
      className="git-file-list"
      role="listbox"
      aria-label={props.label}
      tabIndex={-1}
      onKeyDown={keys}
    >
      {body}
    </div>
  );
}
