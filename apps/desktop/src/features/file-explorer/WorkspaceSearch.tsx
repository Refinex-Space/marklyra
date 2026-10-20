import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type WorkspaceMatchPosition,
  type WorkspaceSearchReport,
  workspaces,
} from '../../services/workspaces.js';
import { useNotice } from '../notices/notices.js';
import {
  entryIsPresent,
  NO_PRESENCE,
  NO_RENAMES,
  projectedPath,
  projectionEpoch,
  type RelativeEntryPresence,
  type RelativeEntryRename,
} from './entry-projection.js';
import { SidebarSkeleton } from './SidebarSkeleton.js';

/** Result rows drawn per step while scrolling; the whole result set is held, not drawn. */
const PAGE_SIZE = 100;

interface SearchProps {
  workspaceId: string;
  refresh?: number;
  metadataRevision?: number | undefined;
  disabled: boolean;
  active: boolean;
  onOpen: (relativePath: string, match: WorkspaceMatchPosition) => void;
  headerTargetId?: string | undefined;
  closeSearch?: () => void;
  renames?: readonly RelativeEntryRename[] | undefined;
  presence?: readonly RelativeEntryPresence[] | undefined;
}

function SearchOptionIcon({ name }: { name: 'case' | 'word' | 'regexp' }) {
  return (
    <svg className="sidebar-search-icon" viewBox="0 0 20 16" aria-hidden="true">
      <use href={`/__runtime-icons/search-options.svg#find-and-replace-icon-${name}`} />
    </svg>
  );
}

function skippedSummary(report: WorkspaceSearchReport): string {
  const { skipped } = report;
  const parts = [
    (skipped.unsupportedEncoding ?? skipped.nonUtf8)
      ? `${skipped.unsupportedEncoding ?? skipped.nonUtf8} 个不支持的编码文件`
      : '',
    skipped.tooLarge ? `${skipped.tooLarge} 个超过 2 MiB 的文件` : '',
    skipped.unreadable ? `${skipped.unreadable} 个不可读项目` : '',
    skipped.symlinks ? `${skipped.symlinks} 个符号链接` : '',
    skipped.unsupportedNames ? `${skipped.unsupportedNames} 个不支持的文件名` : '',
  ].filter(Boolean);
  return parts.length ? `已跳过：${parts.join('、')}。` : '';
}

export function WorkspaceSearch({
  workspaceId,
  refresh = 0,
  metadataRevision,
  disabled,
  active,
  onOpen,
  headerTargetId,
  closeSearch,
  renames = NO_RENAMES,
  presence = NO_PRESENCE,
}: SearchProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(!headerTargetId);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [report, setReport] = useState<WorkspaceSearchReport | null>(null);
  const reportEpoch = useRef(0);
  const latestRenames = useRef(renames);
  latestRenames.current = renames;
  const latestPresence = useRef(presence);
  latestPresence.current = presence;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const section = useRef<HTMLElement | null>(null);
  const sentinel = useRef<HTMLLIElement | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();
  const statusId = useId();
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    setHeaderTarget(headerTargetId ? document.getElementById(headerTargetId) : null);
  }, [headerTargetId]);
  useEffect(() => {
    if (active && headerTarget && !disabled) input.current?.focus();
  }, [active, headerTarget, disabled]);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const invalidate = useCallback(() => {
    generation.current += 1;
    clearTimer();
    setReport(null);
    setError('');
  }, [clearTimer]);

  const runSearch = useCallback(async () => {
    clearTimer();
    const version = ++generation.current;
    if (!active || disabled || query.length === 0) {
      setLoading(false);
      return;
    }
    if (Array.from(query).length > 256 || /[\r\n\0]/.test(query)) {
      setReport(null);
      setLoading(false);
      setError('搜索词最多 256 个字符，不能包含换行或空字符。');
      return;
    }
    setLoading(true);
    setReport(null);
    setError('');
    try {
      const epoch = projectionEpoch(latestRenames.current, latestPresence.current);
      const result = await workspaces.search(workspaceId, query, {
        caseSensitive,
        wholeWord,
        useRegex,
      });
      if (version === generation.current) {
        reportEpoch.current = epoch;
        setReport(result);
      }
    } catch (reason) {
      if (version === generation.current) setError(String(reason));
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [active, disabled, workspaceId, query, caseSensitive, wholeWord, useRegex, clearTimer]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: metadata/refresh invalidates both displayed results and pending searches.
  useEffect(() => {
    generation.current += 1;
    clearTimer();
    if (!active || disabled) {
      setLoading(false);
    } else {
      setReport(null);
      setError('');
      setLoading(query.length > 0);
      if (query.length > 0) timer.current = setTimeout(() => void runSearch(), 180);
    }
    return () => {
      generation.current += 1;
      clearTimer();
    };
  }, [active, disabled, query, runSearch, clearTimer, refresh, metadataRevision]);

  const matches =
    report?.matches
      .map((match) => ({
        ...match,
        relativePath: projectedPath(match.relativePath, reportEpoch.current, renames),
      }))
      .filter((match) =>
        entryIsPresent(match.relativePath, reportEpoch.current, presence, renames),
      ) ?? [];
  const skipped = report ? skippedSummary(report) : '';
  useNotice(error, 'error');
  useNotice(skipped);
  // A new result set starts again from its first rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the report identity is the generation.
  useEffect(() => setShown(PAGE_SIZE), [report]);
  const visible = Math.min(shown, matches.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh observer reports the sentinel again after every page.
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !active) return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting))
          setShown((current) => Math.min(current + PAGE_SIZE, matches.length));
      },
      {
        root: section.current?.closest('.workspace-panel, .sidebar-panel') ?? null,
        rootMargin: '480px 0px',
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active, visible, matches.length]);
  const files = new Set(matches.map((match) => match.relativePath)).size;
  // The result set is cut at a generous size; when it is, the count says "N+" rather than warning.
  const capped = report?.truncationReasons?.includes('results') ?? false;
  const controls = (
    <form
      className={headerTarget ? 'sidebar-search-controls' : undefined}
      aria-label="搜索文件"
      onSubmit={(event) => {
        event.preventDefault();
        void runSearch();
      }}
    >
      {!headerTarget && <label htmlFor={inputId}>搜索 Markdown 文件内容</label>}
      <div className="workspace-search-input">
        <input
          ref={input}
          id={inputId}
          type="search"
          aria-label={headerTarget ? '搜索文件' : undefined}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={query}
          placeholder={headerTarget ? '搜索' : '输入要查找的文字'}
          disabled={disabled}
          aria-describedby={statusId}
          onChange={(event) => {
            invalidate();
            setLoading(event.target.value.length > 0);
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (headerTarget && event.key === 'Escape' && closeSearch) {
              event.preventDefault();
              event.stopPropagation();
              closeSearch();
            }
          }}
        />
        {!headerTarget && (
          <button type="submit" disabled={disabled || query.length === 0} aria-label="立即搜索">
            查找
          </button>
        )}
      </div>
      {headerTarget && (
        <div className="sidebar-search-options">
          <button
            type="button"
            className="sidebar-search-option"
            aria-label="区分大小写"
            title="区分大小写"
            aria-pressed={caseSensitive}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              invalidate();
              setCaseSensitive((value) => !value);
            }}
          >
            <SearchOptionIcon name="case" />
          </button>
          <button
            type="button"
            className="sidebar-search-option"
            aria-label="查找整个单词"
            title="查找整个单词"
            aria-pressed={wholeWord}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              invalidate();
              setWholeWord((value) => !value);
              if (!wholeWord) setUseRegex(false);
            }}
          >
            <SearchOptionIcon name="word" />
          </button>
          <button
            type="button"
            className="sidebar-search-option"
            aria-label="正则表达式"
            title="正则表达式"
            aria-pressed={useRegex}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              invalidate();
              setUseRegex((value) => !value);
              if (!useRegex) setWholeWord(false);
            }}
          >
            <SearchOptionIcon name="regexp" />
          </button>
        </div>
      )}
      {!headerTarget && (
        <label className="workspace-case-toggle">
          <input
            type="checkbox"
            checked={caseSensitive}
            disabled={disabled}
            onChange={(event) => {
              invalidate();
              setCaseSensitive(event.target.checked);
            }}
          />
          区分大小写
        </label>
      )}
    </form>
  );
  return (
    <section
      ref={section}
      className="workspace-search"
      aria-label="工作区全文搜索"
      data-header-search={Boolean(headerTarget) || undefined}
      hidden={!active}
    >
      {headerTarget ? createPortal(controls, headerTarget) : controls}
      <div id={statusId} className="workspace-search-status" aria-live="polite" aria-atomic="true">
        {loading ? (
          <SidebarSkeleton variant="articles" rows={3} />
        ) : report ? (
          `找到 ${matches.length.toLocaleString('zh-CN')}${capped ? '+' : ''} 处匹配，位于 ${files.toLocaleString('zh-CN')} 个文件`
        ) : (
          ''
        )}
      </div>
      {report && !loading && (
        <>
          {matches.length === 0 && <p className="workspace-hint">没有找到匹配。</p>}
          <ol className="workspace-results" aria-label="全文搜索结果">
            {matches.slice(0, visible).map((sourceMatch) => {
              const match = {
                ...sourceMatch,
                relativePath: sourceMatch.relativePath,
              };
              const separator = match.relativePath.lastIndexOf('/');
              const name =
                separator < 0 ? match.relativePath : match.relativePath.slice(separator + 1);
              const folder = separator < 0 ? '' : match.relativePath.slice(0, separator);
              const hitStart = match.previewMatchStart ?? 0;
              const hitEnd = hitStart + (match.previewMatchLength ?? 0);
              const hit =
                hitEnd > hitStart && hitEnd <= match.preview.length ? [hitStart, hitEnd] : null;
              return (
                <li key={`${match.relativePath}:${match.line}:${match.column}`}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onOpen(match.relativePath, {
                        line: match.line,
                        column: match.column,
                        matchLength: match.matchLength,
                        ...(match.expectedText === undefined
                          ? {}
                          : { expectedText: match.expectedText }),
                        ...(match.matchFingerprint === undefined
                          ? {}
                          : { matchFingerprint: match.matchFingerprint }),
                        ...(match.sourceFingerprint === undefined
                          ? {}
                          : { sourceFingerprint: match.sourceFingerprint }),
                      })
                    }
                    title={`${match.relativePath}，第 ${match.line} 行，第 ${match.column} 列`}
                  >
                    <span className="workspace-result-path">{name}</span>
                    {folder && <span className="workspace-result-folder">{folder}</span>}
                    <span className="workspace-result-location">
                      第 {match.line} 行 · 第 {match.column} 列
                    </span>
                    <span className="workspace-result-preview">
                      {hit ? (
                        <>
                          {match.preview.slice(0, hit[0])}
                          <mark className="workspace-result-hit">
                            {match.preview.slice(hit[0], hit[1])}
                          </mark>
                          {match.preview.slice(hit[1])}
                        </>
                      ) : (
                        match.preview
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
            {visible < matches.length && (
              <li ref={sentinel} className="workspace-result-sentinel" aria-hidden="true" />
            )}
          </ol>
        </>
      )}
      <p className="workspace-search-scope">
        搜索支持的文本文件（UTF-8、带 BOM 的 UTF-16LE/BE），单文件最多 2
        MiB。隐藏及忽略项目不在搜索范围内。目录变化后自动重新搜索。
      </p>
    </section>
  );
}
