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
}

/** Files and workspace search share the left sidebar. Document outline lives on the right. */
export function SidebarHeader({
  mode,
  change,
  disabled = false,
  searchTargetId = DEFAULT_SIDEBAR_SEARCH_TARGET,
}: SidebarHeaderProps) {
  const root = useRef<HTMLElement>(null);
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === 'search' && mode !== 'search' && !disabled) {
      if (
        root.current?.contains(document.activeElement) ||
        document.activeElement === document.body
      )
        document.getElementById(`${searchTargetId}-trigger`)?.focus();
    }
    previousMode.current = mode;
  }, [mode, disabled, searchTargetId]);
  return (
    <nav
      className="marklyra-sidebar-header"
      data-mode={mode}
      aria-label="侧栏导航"
      hidden={mode !== 'search'}
      ref={root}
    >
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
      <div id={searchTargetId} className="sidebar-search-target" hidden={mode !== 'search'} />
    </nav>
  );
}
