import { useEffect, useRef } from 'react';
import { ShellGlyph } from '../../components/ShellGlyph.js';
import './workspace-sidebar.css';

export type SidebarMode = 'files' | 'outline' | 'search';
export const DEFAULT_SIDEBAR_SEARCH_TARGET = 'marklyra-sidebar-search-controls';
interface SidebarHeaderProps {
  mode: SidebarMode;
  change: (mode: SidebarMode) => void;
  disabled?: boolean;
  searchTargetId?: string;
  fileView?: 'tree' | 'articles';
}

/** The shipped top-left control directly switches between files and outline. */
export function SidebarHeader({
  mode,
  change,
  disabled = false,
  fileView = 'articles',
  searchTargetId = DEFAULT_SIDEBAR_SEARCH_TARGET,
}: SidebarHeaderProps) {
  const root = useRef<HTMLElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === 'search' && mode !== 'search' && !disabled) {
      if (root.current?.contains(document.activeElement)) searchButton.current?.focus();
    }
    previousMode.current = mode;
  }, [mode, disabled]);
  return (
    <nav className="marklyra-sidebar-header" data-mode={mode} aria-label="侧栏导航" ref={root}>
      <button
        type="button"
        className="sidebar-header-action"
        aria-label={mode === 'search' ? '返回文件' : '切换侧栏视图'}
        disabled={disabled}
        title={mode === 'search' ? '返回文件' : '切换侧栏视图'}
        onClick={() => change(mode === 'files' ? 'outline' : 'files')}
      >
        {mode === 'search' ? (
          <ShellGlyph className="ui-icon" name="back" />
        ) : mode === 'outline' ? (
          <ShellGlyph className="ui-icon" name={fileView === 'tree' ? 'tree' : 'articles'} />
        ) : (
          <ShellGlyph className="ui-icon" name="outline" />
        )}
      </button>
      <span className="sidebar-current-title" hidden={mode === 'search'}>
        {mode === 'files' ? (fileView === 'tree' ? '文件' : '文档') : '大纲'}
      </span>
      <div id={searchTargetId} className="sidebar-search-target" hidden={mode !== 'search'} />
      <button
        type="button"
        className="sidebar-header-action"
        aria-label="全文搜索"
        title="全文搜索"
        hidden={mode === 'search'}
        disabled={disabled || mode === 'search'}
        ref={searchButton}
        onClick={() => change('search')}
      >
        <ShellGlyph className="ui-icon" name="search" />
      </button>
    </nav>
  );
}
