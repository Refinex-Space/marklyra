import { useEffect, useRef } from 'react';
import { ShellGlyph } from '../../components/ShellGlyph.js';
import './workspace-sidebar.css';

export type SidebarMode = 'files' | 'search';
export const DEFAULT_SIDEBAR_SEARCH_TARGET = 'marklyra-sidebar-search-controls';
interface SidebarHeaderProps {
  mode: SidebarMode;
  change: (mode: SidebarMode) => void;
  disabled?: boolean;
  searchTargetId?: string;
  fileView?: 'tree' | 'articles';
}

/** Files and workspace search share the left sidebar. Document outline lives on the right. */
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
      {mode === 'search' ? (
        <button
          type="button"
          className="sidebar-header-action"
          aria-label="返回文件"
          disabled={disabled}
          title="返回文件"
          onClick={() => change('files')}
        >
          <ShellGlyph className="ui-icon" name="back" />
        </button>
      ) : (
        <span className="sidebar-header-spacer" aria-hidden="true" />
      )}
      <span className="sidebar-current-title" hidden={mode === 'search'}>
        {fileView === 'tree' ? '文件' : '文档'}
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
